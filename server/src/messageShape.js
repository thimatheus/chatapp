import { get, all } from "./db.js";

// Recebe linhas cruas de `messages` (já com sender_id, username, avatar, content, etc.)
// e devolve o formato enviado ao cliente, com preview de resposta e reações agregadas.
export async function shapeMessages(rows) {
  rows = rows.filter(Boolean);
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);
  const replyIds = [...new Set(rows.map((r) => r.reply_to_id).filter(Boolean))];

  const replyMap = new Map();
  if (replyIds.length) {
    const placeholders = replyIds.map(() => "?").join(",");
    const replies = await all(
      `SELECT m.id, m.content, m.deleted, u.username
       FROM messages m JOIN users u ON u.id = m.sender_id
       WHERE m.id IN (${placeholders})`,
      replyIds
    );
    for (const r of replies) replyMap.set(r.id, r);
  }

  const reactionMap = new Map(); // messageId -> Map(emoji -> [userId])
  const placeholders = ids.map(() => "?").join(",");
  const reactions = await all(
    `SELECT message_id, user_id, emoji FROM reactions WHERE message_id IN (${placeholders})`,
    ids
  );
  for (const r of reactions) {
    if (!reactionMap.has(r.message_id)) reactionMap.set(r.message_id, new Map());
    const byEmoji = reactionMap.get(r.message_id);
    if (!byEmoji.has(r.emoji)) byEmoji.set(r.emoji, []);
    byEmoji.get(r.emoji).push(r.user_id);
  }

  return rows.map((row) => {
    const reply = row.reply_to_id ? replyMap.get(row.reply_to_id) : null;
    const byEmoji = reactionMap.get(row.id);
    return {
      id: row.id,
      content: row.deleted ? "" : row.content,
      created_at: row.created_at,
      sender_id: row.sender_id,
      username: row.username,
      avatar: row.avatar || null,
      editedAt: row.edited_at || null,
      deleted: !!row.deleted,
      replyTo: reply
        ? {
            id: row.reply_to_id,
            username: reply.username,
            content: reply.deleted ? "" : reply.content,
            deleted: !!reply.deleted,
          }
        : null,
      reactions: byEmoji
        ? [...byEmoji.entries()].map(([emoji, userIds]) => ({ emoji, userIds }))
        : [],
    };
  });
}

export async function shapeOne(id) {
  const row = await get(
    `SELECT m.*, u.username, u.avatar FROM messages m JOIN users u ON u.id = m.sender_id WHERE m.id = ?`,
    [id]
  );
  const shaped = await shapeMessages([row]);
  return shaped[0];
}
