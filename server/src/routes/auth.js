import { Router } from "express";
import bcrypt from "bcryptjs";
import db, { generateAccessNumber } from "../db.js";
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

router.post("/register", (req, res) => {
  const { username, email, password } = req.body || {};
  if (!username || !email || !password || password.length < 4) {
    return res
      .status(400)
      .json({ error: "Nome, e-mail e senha (min 4 caracteres) são obrigatórios" });
  }
  const emailNorm = email.trim().toLowerCase();
  const existing = db.prepare("SELECT id FROM users WHERE email = ?").get(emailNorm);
  if (existing) return res.status(409).json({ error: "E-mail já cadastrado" });

  const accessNumber = generateAccessNumber();
  const hash = bcrypt.hashSync(password, 10);
  const info = db
    .prepare(
      "INSERT INTO users (username, email, access_number, password_hash) VALUES (?, ?, ?, ?)"
    )
    .run(username.trim(), emailNorm, accessNumber, hash);

  const user = publicUser({
    id: info.lastInsertRowid,
    username: username.trim(),
    email: emailNorm,
    access_number: accessNumber,
  });
  res.json({ token: signToken(user), user });
});

router.post("/login", (req, res) => {
  const { identifier, password } = req.body || {};
  const id = (identifier || "").trim().toLowerCase();
  const row = db
    .prepare("SELECT * FROM users WHERE email = ? OR access_number = ?")
    .get(id, (identifier || "").trim());
  if (!row || !bcrypt.compareSync(password || "", row.password_hash)) {
    return res.status(401).json({ error: "Credenciais inválidas" });
  }
  const user = publicUser(row);
  res.json({ token: signToken(user), user });
});

export default router;
