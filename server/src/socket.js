import jwt from "jsonwebtoken";
import db from "./db.js";
import { JWT_SECRET } from "./auth.js";
import { shapeOne } from "./messageShape.js";
import { dmKey, groupKey, channelKey, keyForMessageRow } from "./conversation.js";

const MAX_CALL_PARTICIPANTS = 7;

// roomId -> Map<userId, socketId>
const callRooms = new Map();
// userId -> Set<socketId> (presença online)
const onlineUsers = new Map();

function isBlocked(a, b) {
  return !!db
    .prepare(
      "SELECT 1 FROM blocks WHERE (user_id = ? AND blocked_id = ?) OR (user_id = ? AND blocked_id = ?)"
    )
    .get(a, b, b, a);
}

function reactionsFor(messageId) {
  const rows = db
    .prepare("SELECT user_id, emoji FROM reactions WHERE message_id = ?")
    .all(messageId);
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

    socket.on("channel:message", ({ channelId, content, replyToId }) => {
      if (!content || !content.trim()) return;
      const info = db
        .prepare(
          "INSERT INTO messages (sender_id, channel_id, content, reply_to_id) VALUES (?, ?, ?, ?)"
        )
        .run(socket.user.id, channelId, content.trim(), replyToId || null);
      io.to(`channel:${channelId}`).emit("channel:message", {
        channelId,
        message: shapeOne(info.lastInsertRowid),
      });
    });

    socket.on("dm:join", (otherUserId) => {
      socket.join(dmKey(socket.user.id, otherUserId));
    });

    socket.on("dm:message", ({ recipientId, content, replyToId }) => {
      if (!content || !content.trim()) return;
      if (isBlocked(socket.user.id, recipientId)) {
        socket.emit("dm:blocked", { recipientId });
        return;
      }
      const info = db
        .prepare(
          "INSERT INTO messages (sender_id, recipient_id, content, reply_to_id) VALUES (?, ?, ?, ?)"
        )
        .run(socket.user.id, recipientId, content.trim(), replyToId || null);
      const message = shapeOne(info.lastInsertRowid);
      io.to(dmKey(socket.user.id, recipientId)).emit("dm:message", {
        withUserId: socket.user.id,
        message,
      });
      io.to(`user:${recipientId}`).emit("dm:notify", {
        fromUserId: socket.user.id,
        fromUsername: socket.user.username,
        preview: content.trim().slice(0, 80),
      });
    });

    socket.on("group:join", (groupId) => {
      socket.join(`group:${groupId}`);
    });

    socket.on("group:message", ({ groupId, content, replyToId }) => {
      if (!content || !content.trim()) return;
      const info = db
        .prepare(
          "INSERT INTO messages (sender_id, group_id, content, reply_to_id) VALUES (?, ?, ?, ?)"
        )
        .run(socket.user.id, groupId, content.trim(), replyToId || null);
      io.to(`group:${groupId}`).emit("group:message", {
        groupId,
        message: shapeOne(info.lastInsertRowid),
      });
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
    socket.on("read:ack", ({ key, lastMessageId }) => {
      db.prepare(
        `INSERT INTO read_state (user_id, conversation_key, last_read_message_id) VALUES (?, ?, ?)
         ON CONFLICT(user_id, conversation_key) DO UPDATE SET last_read_message_id = excluded.last_read_message_id`
      ).run(socket.user.id, key, lastMessageId);
      socket.to(roomForKey(key)).emit("read:update", { key, userId: socket.user.id, lastMessageId });
    });

    // ---- Editar / apagar mensagem ----
    socket.on("message:edit", ({ id, content }) => {
      if (!content || !content.trim()) return;
      const row = db.prepare("SELECT * FROM messages WHERE id = ?").get(id);
      if (!row || row.sender_id !== socket.user.id || row.deleted) return;
      db.prepare("UPDATE messages SET content = ?, edited_at = datetime('now') WHERE id = ?").run(
        content.trim(),
        id
      );
      const updated = shapeOne(id);
      io.to(roomForKey(keyForMessageRow(row))).emit("message:edited", updated);
    });

    socket.on("message:delete", ({ id }) => {
      const row = db.prepare("SELECT * FROM messages WHERE id = ?").get(id);
      if (!row || row.sender_id !== socket.user.id) return;
      db.prepare("UPDATE messages SET deleted = 1, content = '' WHERE id = ?").run(id);
      io.to(roomForKey(keyForMessageRow(row))).emit("message:deleted", { id });
    });

    // ---- Reações ----
    socket.on("reaction:toggle", ({ messageId, emoji }) => {
      const row = db.prepare("SELECT * FROM messages WHERE id = ?").get(messageId);
      if (!row) return;
      const existing = db
        .prepare("SELECT emoji FROM reactions WHERE message_id = ? AND user_id = ?")
        .get(messageId, socket.user.id);
      if (existing && existing.emoji === emoji) {
        db.prepare("DELETE FROM reactions WHERE message_id = ? AND user_id = ?").run(
          messageId,
          socket.user.id
        );
      } else {
        db.prepare(
          `INSERT INTO reactions (message_id, user_id, emoji) VALUES (?, ?, ?)
           ON CONFLICT(message_id, user_id) DO UPDATE SET emoji = excluded.emoji`
        ).run(messageId, socket.user.id, emoji);
      }
      io.to(roomForKey(keyForMessageRow(row))).emit("reaction:update", {
        messageId,
        reactions: reactionsFor(messageId),
      });
    });

    // ---- Bloqueio ----
    socket.on("block:user", ({ userId }) => {
      db.prepare("INSERT OR IGNORE INTO blocks (user_id, blocked_id) VALUES (?, ?)").run(
        socket.user.id,
        userId
      );
    });

    socket.on("unblock:user", ({ userId }) => {
      db.prepare("DELETE FROM blocks WHERE user_id = ? AND blocked_id = ?").run(
        socket.user.id,
        userId
      );
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

    socket.on("disconnect", () => {
      for (const roomId of socket.callRooms) leaveCallRoom(roomId);

      const sockets = onlineUsers.get(socket.user.id);
      sockets?.delete(socket.id);
      if (sockets && sockets.size === 0) {
        onlineUsers.delete(socket.user.id);
        db.prepare("UPDATE users SET last_seen = datetime('now') WHERE id = ?").run(socket.user.id);
        io.emit("presence:update", { userId: socket.user.id, online: false, lastSeen: new Date().toISOString() });
      }
    });
  });
}
