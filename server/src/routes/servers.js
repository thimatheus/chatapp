import { Router } from "express";
import { get, all, run } from "../db.js";
import { authMiddleware } from "../auth.js";

const router = Router();
router.use(authMiddleware);

// Servidores que o usuário participa
router.get("/", async (req, res) => {
  const rows = await all(
    `SELECT s.id, s.name, s.owner_id
     FROM servers s
     JOIN server_members m ON m.server_id = s.id
     WHERE m.user_id = ?
     ORDER BY s.id`,
    [req.user.id]
  );
  res.json(rows);
});

// Todos os servidores existentes (pra poder entrar, estilo comunidade pública)
router.get("/all", async (req, res) => {
  const rows = await all("SELECT id, name, owner_id FROM servers ORDER BY id");
  res.json(rows);
});

router.post("/", async (req, res) => {
  const { name } = req.body || {};
  if (!name || !name.trim()) return res.status(400).json({ error: "Nome obrigatório" });

  const info = await run("INSERT INTO servers (name, owner_id) VALUES (?, ?)", [
    name.trim(),
    req.user.id,
  ]);
  const serverId = info.lastInsertRowid;

  await run("INSERT INTO server_members (server_id, user_id) VALUES (?, ?)", [
    serverId,
    req.user.id,
  ]);
  await run("INSERT INTO channels (server_id, name) VALUES (?, ?)", [serverId, "geral"]);

  res.json({ id: serverId, name: name.trim(), owner_id: req.user.id });
});

router.post("/:id/join", async (req, res) => {
  const serverId = Number(req.params.id);
  const server = await get("SELECT id FROM servers WHERE id = ?", [serverId]);
  if (!server) return res.status(404).json({ error: "Servidor não encontrado" });

  await run("INSERT OR IGNORE INTO server_members (server_id, user_id) VALUES (?, ?)", [
    serverId,
    req.user.id,
  ]);
  res.json({ ok: true });
});

router.get("/:id/channels", async (req, res) => {
  const serverId = Number(req.params.id);
  const rows = await all("SELECT id, name FROM channels WHERE server_id = ? ORDER BY id", [
    serverId,
  ]);
  res.json(rows);
});

router.post("/:id/channels", async (req, res) => {
  const serverId = Number(req.params.id);
  const { name } = req.body || {};
  if (!name || !name.trim()) return res.status(400).json({ error: "Nome obrigatório" });

  const info = await run("INSERT INTO channels (server_id, name) VALUES (?, ?)", [
    serverId,
    name.trim(),
  ]);
  res.json({ id: info.lastInsertRowid, name: name.trim() });
});

export default router;
