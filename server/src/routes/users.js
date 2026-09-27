import { Router } from "express";
import { get, all, run } from "../db.js";
import { authMiddleware } from "../auth.js";

const router = Router();
router.use(authMiddleware);

router.get("/me", async (req, res) => {
  const row = await get(
    "SELECT id, username, email, access_number, avatar FROM users WHERE id = ?",
    [req.user.id]
  );
  res.json({
    id: row.id,
    username: row.username,
    email: row.email,
    accessNumber: row.access_number,
    avatar: row.avatar || null,
  });
});

router.patch("/me/avatar", async (req, res) => {
  const { avatar } = req.body || {};
  if (avatar && avatar.length > 400000) {
    return res.status(400).json({ error: "Imagem muito grande" });
  }
  await run("UPDATE users SET avatar = ? WHERE id = ?", [avatar || null, req.user.id]);
  res.json({ avatar: avatar || null });
});

// Meus contatos (adicionados por número de acesso)
router.get("/contacts", async (req, res) => {
  const rows = await all(
    `SELECT u.id, u.username, u.access_number as accessNumber, u.avatar, u.last_seen as lastSeen
     FROM contacts c JOIN users u ON u.id = c.contact_id
     WHERE c.user_id = ? ORDER BY u.username`,
    [req.user.id]
  );
  res.json(rows);
});

// Adiciona um contato pelo número de acesso (estilo WhatsApp)
router.post("/contacts", async (req, res) => {
  const { accessNumber } = req.body || {};
  const clean = (accessNumber || "").trim();
  if (!/^\d{1,7}$/.test(clean)) {
    return res.status(400).json({ error: "Número de acesso inválido" });
  }
  const target = await get(
    "SELECT id, username, access_number, avatar FROM users WHERE access_number = ?",
    [clean]
  );
  if (!target) return res.status(404).json({ error: "Nenhum usuário com esse número" });
  if (target.id === req.user.id) return res.status(400).json({ error: "Esse número é o seu" });

  await run("INSERT OR IGNORE INTO contacts (user_id, contact_id) VALUES (?, ?)", [
    req.user.id,
    target.id,
  ]);
  res.json({
    id: target.id,
    username: target.username,
    accessNumber: target.access_number,
    avatar: target.avatar,
  });
});

router.get("/blocked", async (req, res) => {
  const rows = await all(
    `SELECT u.id, u.username, u.access_number as accessNumber
     FROM blocks b JOIN users u ON u.id = b.blocked_id
     WHERE b.user_id = ? ORDER BY u.username`,
    [req.user.id]
  );
  res.json(rows);
});

router.post("/blocked/:userId", async (req, res) => {
  const targetId = Number(req.params.userId);
  await run("INSERT OR IGNORE INTO blocks (user_id, blocked_id) VALUES (?, ?)", [
    req.user.id,
    targetId,
  ]);
  res.json({ ok: true });
});

router.delete("/blocked/:userId", async (req, res) => {
  const targetId = Number(req.params.userId);
  await run("DELETE FROM blocks WHERE user_id = ? AND blocked_id = ?", [req.user.id, targetId]);
  res.json({ ok: true });
});

export default router;
