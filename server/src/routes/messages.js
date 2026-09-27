import { Router } from "express";
import db from "../db.js";
import { authMiddleware } from "../auth.js";
import { shapeMessages } from "../messageShape.js";
import { dmKey, groupKey, channelKey } from "../conversation.js";

const router = Router();
router.use(authMiddleware);

function readStateFor(userId, conversationKey) {
  const row = db
    .prepare("SELECT last_read_message_id FROM read_state WHERE user_id = ? AND conversation_key = ?")
    .get(userId, conversationKey);
  return row?.last_read_message_id || 0;
}

// Histórico de um canal
router.get("/channel/:channelId", (req, res) => {
  const channelId = Number(req.params.channelId);
  const rows = db
    .prepare(
      `SELECT m.*, u.username, u.avatar
       FROM messages m JOIN users u ON u.id = m.sender_id
       WHERE m.channel_id = ?
       ORDER BY m.id ASC LIMIT 200`
    )
    .all(channelId);
  res.json(shapeMessages(rows));
});

// Histórico de uma conversa direta com outro usuário
router.get("/dm/:userId", (req, res) => {
  const otherId = Number(req.params.userId);
  const meId = req.user.id;
  const rows = db
    .prepare(
      `SELECT m.*, u.username, u.avatar
       FROM messages m JOIN users u ON u.id = m.sender_id
       WHERE (m.sender_id = ? AND m.recipient_id = ?)
          OR (m.sender_id = ? AND m.recipient_id = ?)
       ORDER BY m.id ASC LIMIT 200`
    )
    .all(meId, otherId, otherId, meId);
  res.json({
    messages: shapeMessages(rows),
    theirReadUpTo: readStateFor(otherId, dmKey(meId, otherId)),
  });
});

// Histórico de um grupo
router.get("/group/:groupId", (req, res) => {
  const groupId = Number(req.params.groupId);
  const rows = db
    .prepare(
      `SELECT m.*, u.username, u.avatar
       FROM messages m JOIN users u ON u.id = m.sender_id
       WHERE m.group_id = ?
       ORDER BY m.id ASC LIMIT 200`
    )
    .all(groupId);
  res.json(shapeMessages(rows));
});

export default router;
