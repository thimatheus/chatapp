import jwt from "jsonwebtoken";
import { get, run, all } from "./db.js";
import { JWT_SECRET } from "./auth.js";
import { shapeOne } from "./messageShape.js";
import { dmKey, keyForMessageRow } from "./conversation.js";
import { pushToUser } from "./push.js";

const MAX_CALL_PARTICIPANTS = 7;

// roomId -> Map<userId, socketId>
const callRooms = new Map();
// userId -> Set<socketId> (presença online)
const onlineUsers = new Map();

async function isBlocked(a, b) {
  const row = await get(
    "SELECT 1 FROM blocks WHERE (user_id = ? AND blocked_id = ?) OR (user_id = ? AND blocked_id = ?)",
    [a, b, b, a]
  );
  return !!row;
}

async function reactionsFor(messageId) {
  const rows = await all("SELECT user_id, emoji FROM reactions WHERE message_id = ?", [
    messageId,
  ]);
  const byEmoji = new Map();
  for (const r of rows) {
    if (!byEmoji.has(r.emoji)) byEmoji.set(r.emoji, []);
    byEmoji.get(r.emoji).push(r.user_id);
  }
  return [...byEmoji.entries()].map(([emoji, userIds]) => ({ emoji, userIds }));
}

function roomForKey(key) {
  // "dm:1:2" | "group:3" | "channel:4" -> nome de room igual ao usado no join
  const [kind, ...rest] = key.split(":");
  if (kind === "dm") return key;
  if (kind === "group") return `group:${rest[0]}`;
  if (kind === "channel") return `channel:${rest[0]}`;
  return key;
}

export function setupSocket(io) {
  io.use((socket, next) => {
    try {
      const token = socket.handshake.auth?.token;
      socket.user = jwt.verify(token, JWT_SECRET);
      next();
    } catch {
      next(new Error("unauthorized"));
    }
  });

  io.on("connection", (socket) => {
    socket.join(`user:${socket.user.id}`);
    socket.callRooms = new Set();

    if (!onlineUsers.has(socket.user.id)) onlineUsers.set(socket.user.id, new Set());
    const wasOffline = onlineUsers.get(socket.user.id).size === 0;
    onlineUsers.get(socket.user.id).add(socket.id);
    if (wasOffline) {
      io.emit("presence:update", { userId: socket.user.id, online: true });
    }
    socket.emit("presence:snapshot", { onlineUserIds: [...onlineUsers.keys()] });

    socket.on("channel:join", (channelId) => {
      socket.join(`channel:${channelId}`);
    });

    socket.on("channel:message", async ({ channelId, content, replyToId }) => {
      if (!content || !content.trim()) return;
      const info = await run(
        "INSERT INTO messages (sender_id, channel_id, content, reply_to_id) VALUES (?, ?, ?, ?)",
        [socket.user.id, channelId, content.trim(), replyToId || null]
      );
      const message = await shapeOne(info.lastInsertRowid);
      if (!message) {
        console.error("channel:message – falha ao montar a mensagem", info.lastInsertRowid);
        return;
      }
      io.to(`channel:${channelId}`).emit("channel:message", { channelId, message });
    });

    socket.on("dm:join", (otherUserId) => {
      socket.join(dmKey(socket.user.id, otherUserId));
    });

    socket.on("dm:message", async ({ recipientId, content, replyToId }) => {
      if (!content || !content.trim()) return;
      if (await isBlocked(socket.user.id, recipientId)) {
        socket.emit("dm:blocked", { recipientId });
        return;
      }
      const info = await run(
        "INSERT INTO messages (sender_id, recipient_id, content, reply_to_id) VALUES (?, ?, ?, ?)",
        [socket.user.id, recipientId, content.trim(), replyToId || null]
      );
      const message = await shapeOne(info.lastInsertRowid);
      if (!message) {
        console.error("dm:message – falha ao montar a mensagem", info.lastInsertRowid);
        return;
      }
      io.to(dmKey(socket.user.id, recipientId)).emit("dm:message", {
        withUserId: socket.user.id,
        message,
      });
      io.to(`user:${recipientId}`).emit("dm:notify", {
        fromUserId: socket.user.id,
        fromUsername: socket.user.username,
        preview: content.trim().slice(0, 80),
      });
      pushToUser(recipientId, {
        title: socket.user.username,
        body: content.trim().slice(0, 120),
        tag: `dm:${socket.user.id}`,
        url: "/",
      });
    });

    socket.on("group:join", (groupId) => {
      socket.join(`group:${groupId}`);
    });

    socket.on("group:message", async ({ groupId, content, replyToId }) => {
      if (!content || !content.trim()) return;
      const info = await run(
        "INSERT INTO messages (sender_id, group_id, content, reply_to_id) VALUES (?, ?, ?, ?)",
        [socket.user.id, groupId, content.trim(), replyToId || null]
      );
      const message = await shapeOne(info.lastInsertRowid);
      if (!message) {
        console.error("group:message – falha ao montar a mensagem", info.lastInsertRowid);
        return;
      }
      io.to(`group:${groupId}`).emit("group:message", { groupId, message });

      const members = await all("SELECT user_id FROM group_members WHERE group_id = ?", [groupId]);
      for (const m of members) {
        if (m.user_id === socket.user.id) continue;
        pushToUser(m.user_id, {
          title: `${socket.user.username} (grupo)`,
          body: content.trim().slice(0, 120),
          tag: `group:${groupId}`,
          url: "/",
        });
      }
    });

    // ---- Digitando... ----
    socket.on("typing", ({ key, active }) => {
      socket.to(roomForKey(key)).emit("typing", {
        key,
        userId: socket.user.id,
        username: socket.user.username,
        active: !!active,
      });
    });

    // ---- Confirmação de leitura ----
    socket.on("read:ack", async ({ key, lastMessageId }) => {
      await run(
        `INSERT INTO read_state (user_id, conversation_key, last_read_message_id) VALUES (?, ?, ?)
         ON CONFLICT(user_id, conversation_key) DO UPDATE SET last_read_message_id = excluded.last_read_message_id`,
        [socket.user.id, key, lastMessageId]
      );
      socket.to(roomForKey(key)).emit("read:update", { key, userId: socket.user.id, lastMessageId });
    });

    // ---- Editar / apagar mensagem ----
    socket.on("message:edit", async ({ id, content }) => {
      if (!content || !content.trim()) return;
      const row = await get("SELECT * FROM messages WHERE id = ?", [id]);
      if (!row || row.sender_id !== socket.user.id || row.deleted) return;
      await run("UPDATE messages SET content = ?, edited_at = datetime('now') WHERE id = ?", [
        content.trim(),
        id,
      ]);
      const updated = await shapeOne(id);
      io.to(roomForKey(keyForMessageRow(row))).emit("message:edited", updated);
    });

    socket.on("message:delete", async ({ id }) => {
      const row = await get("SELECT * FROM messages WHERE id = ?", [id]);
      if (!row || row.sender_id !== socket.user.id) return;
      await run("UPDATE messages SET deleted = 1, content = '' WHERE id = ?", [id]);
      io.to(roomForKey(keyForMessageRow(row))).emit("message:deleted", { id });
    });

    // ---- Reações ----
    socket.on("reaction:toggle", async ({ messageId, emoji }) => {
      const row = await get("SELECT * FROM messages WHERE id = ?", [messageId]);
      if (!row) return;
      const existing = await get(
        "SELECT emoji FROM reactions WHERE message_id = ? AND user_id = ?",
        [messageId, socket.user.id]
      );
      if (existing && existing.emoji === emoji) {
        await run("DELETE FROM reactions WHERE message_id = ? AND user_id = ?", [
          messageId,
          socket.user.id,
        ]);
      } else {
        await run(
          `INSERT INTO reactions (message_id, user_id, emoji) VALUES (?, ?, ?)
           ON CONFLICT(message_id, user_id) DO UPDATE SET emoji = excluded.emoji`,
          [messageId, socket.user.id, emoji]
        );
      }
      io.to(roomForKey(keyForMessageRow(row))).emit("reaction:update", {
        messageId,
        reactions: await reactionsFor(messageId),
      });
    });

    // ---- Bloqueio ----
    socket.on("block:user", async ({ userId }) => {
      await run("INSERT OR IGNORE INTO blocks (user_id, blocked_id) VALUES (?, ?)", [
        socket.user.id,
        userId,
      ]);
    });

    socket.on("unblock:user", async ({ userId }) => {
      await run("DELETE FROM blocks WHERE user_id = ? AND blocked_id = ?", [
        socket.user.id,
        userId,
      ]);
    });

    // ---- Chamadas de voz/vídeo (mesh WebRTC, sinalização via socket) ----

    socket.on("call:invite", ({ roomId, toUserId, kind, label }) => {
      io.to(`user:${toUserId}`).emit("call:incoming", {
        roomId,
        kind,
        label,
        fromUserId: socket.user.id,
        fromUsername: socket.user.username,
      });
      pushToUser(toUserId, {
        title: `${socket.user.username} está ligando`,
        body: kind === "video" ? "Chamada de vídeo" : "Chamada de voz",
        tag: "call",
        url: "/",
      });
    });

    socket.on("call:join", ({ roomId }) => {
      let participants = callRooms.get(roomId);
      if (!participants) {
        participants = new Map();
        callRooms.set(roomId, participants);
      }
      if (participants.size >= MAX_CALL_PARTICIPANTS && !participants.has(socket.user.id)) {
        socket.emit("call:full", { roomId });
        return;
      }

      const existing = [...participants.entries()]
        .filter(([userId]) => userId !== socket.user.id)
        .map(([userId, s]) => ({ userId, username: s.username }));

      participants.set(socket.user.id, { socketId: socket.id, username: socket.user.username });
      socket.join(`call:${roomId}`);
      socket.callRooms.add(roomId);

      socket.emit("call:participants", { roomId, participants: existing });
      socket.to(`call:${roomId}`).emit("call:peer-joined", {
        roomId,
        userId: socket.user.id,
        username: socket.user.username,
      });
    });

    socket.on("call:signal", ({ roomId, toUserId, data }) => {
      const participants = callRooms.get(roomId);
      const target = participants?.get(toUserId);
      if (!target) return;
      io.to(target.socketId).emit("call:signal", {
        roomId,
        fromUserId: socket.user.id,
        data,
      });
    });

    function leaveCallRoom(roomId) {
      const participants = callRooms.get(roomId);
      if (!participants) return;
      participants.delete(socket.user.id);
      if (participants.size === 0) callRooms.delete(roomId);
      socket.leave(`call:${roomId}`);
      socket.to(`call:${roomId}`).emit("call:peer-left", { roomId, userId: socket.user.id });
    }

    socket.on("call:leave", ({ roomId }) => {
      leaveCallRoom(roomId);
      socket.callRooms.delete(roomId);
    });

    socket.on("disconnect", async () => {
      for (const roomId of socket.callRooms) leaveCallRoom(roomId);

      const sockets = onlineUsers.get(socket.user.id);
      sockets?.delete(socket.id);
      if (sockets && sockets.size === 0) {
        onlineUsers.delete(socket.user.id);
        await run("UPDATE users SET last_seen = datetime('now') WHERE id = ?", [socket.user.id]);
        io.emit("presence:update", {
          userId: socket.user.id,
          online: false,
          lastSeen: new Date().toISOString(),
        });
      }
    });
  });
}
