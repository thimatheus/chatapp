import { Router } from "express";
import db from "../db.js";
import { authMiddleware } from "../auth.js";

const router = Router();
router.use(authMiddleware);

// Servidores que o usuário participa
router.get("/", (req, res) => {
  const rows = db
    .prepare(
      `SELECT s.id, s.name, s.owner_id
       FROM servers s
       JOIN server_members m ON m.server_id = s.id
       WHERE m.user_id = ?
       ORDER BY s.id`
    )
    .all(req.user.id);
  res.json(rows);
});

// Todos os servidores existentes (pra poder entrar, estilo comunidade pública)
router.get("/all", (req, res) => {
  const rows = db.prepare("SELECT id, name, owner_id FROM servers ORDER BY id").all();
  res.json(rows);
});

router.post("/", (req, res) => {
  const { name } = req.body || {};
  if (!name || !name.trim()) return res.status(400).json({ error: "Nome obrigatório" });

  const info = db
    .prepare("INSERT INTO servers (name, owner_id) VALUES (?, ?)")
    .run(name.trim(), req.user.id);
  const serverId = info.lastInsertRowid;

  db.prepare("INSERT INTO server_members (server_id, user_id) VALUES (?, ?)").run(
    serverId,
    req.user.id
  );
  db.prepare("INSERT INTO channels (server_id, name) VALUES (?, ?)").run(serverId, "geral");

  res.json({ id: serverId, name: name.trim(), owner_id: req.user.id });
});

router.post("/:id/join", (req, res) => {
  const serverId = Number(req.params.id);
  const server = db.prepare("SELECT id FROM servers WHERE id = ?").get(serverId);
  if (!server) return res.status(404).json({ error: "Servidor não encontrado" });

  db.prepare(
    "INSERT OR IGNORE INTO server_members (server_id, user_id) VALUES (?, ?)"
  ).run(serverId, req.user.id);
  res.json({ ok: true });
});

router.get("/:id/channels", (req, res) => {
  const serverId = Number(req.params.id);
  const rows = db
    .prepare("SELECT id, name FROM channels WHERE server_id = ? ORDER BY id")
    .all(serverId);
  res.json(rows);
});

router.post("/:id/channels", (req, res) => {
  const serverId = Number(req.params.id);
  const { name } = req.body || {};
  if (!name || !name.trim()) return res.status(400).json({ error: "Nome obrigatório" });

  const info = db
    .prepare("INSERT INTO channels (server_id, name) VALUES (?, ?)")
    .run(serverId, name.trim());
  res.json({ id: info.lastInsertRowid, name: name.trim() });
});

export default router;
