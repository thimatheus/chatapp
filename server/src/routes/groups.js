import { Router } from "express";
import db from "../db.js";
import { authMiddleware } from "../auth.js";

const router = Router();
router.use(authMiddleware);

router.get("/", (req, res) => {
  const rows = db
    .prepare(
      `SELECT g.id, g.name, g.owner_id
       FROM groups_ g JOIN group_members m ON m.group_id = g.id
       WHERE m.user_id = ? ORDER BY g.id`
    )
    .all(req.user.id);
  res.json(rows);
});

router.post("/", (req, res) => {
  const { name } = req.body || {};
  if (!name || !name.trim()) return res.status(400).json({ error: "Nome obrigatório" });

  const info = db
    .prepare("INSERT INTO groups_ (name, owner_id) VALUES (?, ?)")
    .run(name.trim(), req.user.id);
  db.prepare("INSERT INTO group_members (group_id, user_id) VALUES (?, ?)").run(
    info.lastInsertRowid,
    req.user.id
  );
  res.json({ id: info.lastInsertRowid, name: name.trim(), owner_id: req.user.id });
});

router.get("/:id/members", (req, res) => {
  const groupId = Number(req.params.id);
  const rows = db
    .prepare(
      `SELECT u.id, u.username, u.access_number as accessNumber, u.avatar
       FROM group_members m JOIN users u ON u.id = m.user_id
       WHERE m.group_id = ? ORDER BY u.username`
    )
    .all(groupId);
  res.json(rows);
});

router.post("/:id/members", (req, res) => {
  const groupId = Number(req.params.id);
  const { accessNumber } = req.body || {};
  const clean = (accessNumber || "").trim();
  const target = db.prepare("SELECT id, username FROM users WHERE access_number = ?").get(clean);
  if (!target) return res.status(404).json({ error: "Nenhum usuário com esse número" });

  db.prepare("INSERT OR IGNORE INTO group_members (group_id, user_id) VALUES (?, ?)").run(
    groupId,
    target.id
  );
  res.json({ id: target.id, username: target.username });
});

export default router;
