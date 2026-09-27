import { Router } from "express";
import { get, all } from "../db.js";
import { authMiddleware } from "../auth.js";
import { shapeMessages } from "../messageShape.js";
import { dmKey, groupKey } from "../conversation.js";

const router = Router();
router.use(authMiddleware);

async function readStateFor(userId, conversationKey) {
  const row = await get(
    "SELECT last_read_message_id FROM read_state WHERE user_id = ? AND conversation_key = ?",
    [userId, conversationKey]
  );
  return row?.last_read_message_id || 0;
}

// Histórico de um canal
router.get("/channel/:channelId", async (req, res) => {
  const channelId = Number(req.params.channelId);
  const rows = await all(
    `SELECT m.*, u.username, u.avatar
     FROM messages m JOIN users u ON u.id = m.sender_id
     WHERE m.channel_id = ?
     ORDER BY m.id ASC LIMIT 200`,
    [channelId]
  );
  res.json(await shapeMessages(rows));
});

// Histórico de uma conversa direta com outro usuário
router.get("/dm/:userId", async (req, res) => {
  const otherId = Number(req.params.userId);
  const meId = req.user.id;
  const rows = await all(
    `SELECT m.*, u.username, u.avatar
     FROM messages m JOIN users u ON u.id = m.sender_id
     WHERE (m.sender_id = ? AND m.recipient_id = ?)
        OR (m.sender_id = ? AND m.recipient_id = ?)
     ORDER BY m.id ASC LIMIT 200`,
    [meId, otherId, otherId, meId]
  );
  res.json({
    messages: await shapeMessages(rows),
    theirReadUpTo: await readStateFor(otherId, dmKey(meId, otherId)),
  });
});

// Histórico de um grupo
router.get("/group/:groupId", async (req, res) => {
  const groupId = Number(req.params.groupId);
  const rows = await all(
    `SELECT m.*, u.username, u.avatar
     FROM messages m JOIN users u ON u.id = m.sender_id
     WHERE m.group_id = ?
     ORDER BY m.id ASC LIMIT 200`,
    [groupId]
  );
  res.json(await shapeMessages(rows));
});

// Quantidade de mensagens não lidas por conversa (DMs e grupos)
router.get("/unread", async (req, res) => {
  const meId = req.user.id;
  const contacts = await all("SELECT contact_id FROM contacts WHERE user_id = ?", [meId]);
  const groups = await all("SELECT group_id FROM group_members WHERE user_id = ?", [meId]);

  const dm = {};
  for (const c of contacts) {
    const lastRead = await readStateFor(meId, dmKey(meId, c.contact_id));
    const row = await get(
      "SELECT COUNT(*) as cnt FROM messages WHERE sender_id = ? AND recipient_id = ? AND id > ?",
      [c.contact_id, meId, lastRead]
    );
    if (row.cnt > 0) dm[c.contact_id] = row.cnt;
  }

  const group = {};
  for (const g of groups) {
    const lastRead = await readStateFor(meId, groupKey(g.group_id));
    const row = await get(
      "SELECT COUNT(*) as cnt FROM messages WHERE group_id = ? AND sender_id != ? AND id > ?",
      [g.group_id, meId, lastRead]
    );
    if (row.cnt > 0) group[g.group_id] = row.cnt;
  }

  res.json({ dm, group });
});

export default router;
