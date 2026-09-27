import { Router } from "express";
import { get, all, run } from "../db.js";
import { authMiddleware } from "../auth.js";

const router = Router();
router.use(authMiddleware);

router.get("/", async (req, res) => {
  const rows = await all(
    `SELECT g.id, g.name, g.owner_id
     FROM groups_ g JOIN group_members m ON m.group_id = g.id
     WHERE m.user_id = ? ORDER BY g.id`,
    [req.user.id]
  );
  res.json(rows);
});

router.post("/", async (req, res) => {
  const { name } = req.body || {};
  if (!name || !name.trim()) return res.status(400).json({ error: "Nome obrigatório" });

  const info = await run("INSERT INTO groups_ (name, owner_id) VALUES (?, ?)", [
    name.trim(),
    req.user.id,
  ]);
  await run("INSERT INTO group_members (group_id, user_id) VALUES (?, ?)", [
    info.lastInsertRowid,
    req.user.id,
  ]);
  res.json({ id: info.lastInsertRowid, name: name.trim(), owner_id: req.user.id });
});

router.get("/:id/members", async (req, res) => {
  const groupId = Number(req.params.id);
  const rows = await all(
    `SELECT u.id, u.username, u.access_number as accessNumber, u.avatar
     FROM group_members m JOIN users u ON u.id = m.user_id
     WHERE m.group_id = ? ORDER BY u.username`,
    [groupId]
  );
  res.json(rows);
});

router.post("/:id/members", async (req, res) => {
  const groupId = Number(req.params.id);
  const { accessNumber } = req.body || {};
  const clean = (accessNumber || "").trim();
  const target = await get("SELECT id, username FROM users WHERE access_number = ?", [clean]);
  if (!target) return res.status(404).json({ error: "Nenhum usuário com esse número" });

  await run("INSERT OR IGNORE INTO group_members (group_id, user_id) VALUES (?, ?)", [
    groupId,
    target.id,
  ]);
  res.json({ id: target.id, username: target.username });
});

export default router;
