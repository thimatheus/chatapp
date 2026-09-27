import { Router } from "express";
import { get, all } from "../db.js";
import { authMiddleware } from "../auth.js";
import { shapeMessages } from "../messageShape.js";
import { dmKey } from "../conversation.js";

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

export default router;
