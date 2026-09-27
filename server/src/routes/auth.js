import { Router } from "express";
import bcrypt from "bcryptjs";
import { get, run, generateAccessNumber } from "../db.js";
import { signToken } from "../auth.js";

const router = Router();

function publicUser(row) {
  return {
    id: row.id,
    username: row.username,
    email: row.email,
    accessNumber: row.access_number,
    avatar: row.avatar || null,
  };
}

router.post("/register", async (req, res) => {
  const { username, email, password } = req.body || {};
  if (!username || !email || !password || password.length < 4) {
    return res
      .status(400)
      .json({ error: "Nome, e-mail e senha (min 4 caracteres) são obrigatórios" });
  }
  const emailNorm = email.trim().toLowerCase();
  const existing = await get("SELECT id FROM users WHERE email = ?", [emailNorm]);
  if (existing) return res.status(409).json({ error: "E-mail já cadastrado" });

  const accessNumber = await generateAccessNumber();
  const hash = bcrypt.hashSync(password, 10);
  const info = await run(
    "INSERT INTO users (username, email, access_number, password_hash) VALUES (?, ?, ?, ?)",
    [username.trim(), emailNorm, accessNumber, hash]
  );

  const user = publicUser({
    id: info.lastInsertRowid,
    username: username.trim(),
    email: emailNorm,
    access_number: accessNumber,
  });
  res.json({ token: signToken(user), user });
});

router.post("/login", async (req, res) => {
  const { identifier, password } = req.body || {};
  const id = (identifier || "").trim().toLowerCase();
  const row = await get("SELECT * FROM users WHERE email = ? OR access_number = ?", [
    id,
    (identifier || "").trim(),
  ]);
  if (!row || !bcrypt.compareSync(password || "", row.password_hash)) {
    return res.status(401).json({ error: "Credenciais inválidas" });
  }
  const user = publicUser(row);
  res.json({ token: signToken(user), user });
});

export default router;
