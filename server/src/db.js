import { createClient } from "@libsql/client";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Em produção (Render), usa o Turso via TURSO_DATABASE_URL/TURSO_AUTH_TOKEN
// (persiste de verdade). Sem essas variáveis, cai num arquivo SQLite local
// pra desenvolvimento (perde os dados a cada redeploy, mas isso não importa
// rodando na sua máquina).
const client = process.env.TURSO_DATABASE_URL
  ? createClient({
      url: process.env.TURSO_DATABASE_URL,
      authToken: process.env.TURSO_AUTH_TOKEN,
    })
  : createClient({ url: `file:${path.join(__dirname, "..", "data.sqlite")}` });

export async function run(sql, params = []) {
  const res = await client.execute({ sql, args: params });
  return { lastInsertRowid: Number(res.lastInsertRowid), changes: res.rowsAffected };
}

export async function get(sql, params = []) {
  const res = await client.execute({ sql, args: params });
  return res.rows[0];
}

export async function all(sql, params = []) {
  const res = await client.execute({ sql, args: params });
  return res.rows;
}

async function migrate() {
  const statements = [
    `CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      access_number TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      avatar TEXT,
      last_seen TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )`,
    `CREATE TABLE IF NOT EXISTS contacts (
      user_id INTEGER NOT NULL,
      contact_id INTEGER NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      PRIMARY KEY (user_id, contact_id)
    )`,
    `CREATE TABLE IF NOT EXISTS blocks (
      user_id INTEGER NOT NULL,
      blocked_id INTEGER NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      PRIMARY KEY (user_id, blocked_id)
    )`,
    `CREATE TABLE IF NOT EXISTS groups_ (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      owner_id INTEGER NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    )`,
    `CREATE TABLE IF NOT EXISTS group_members (
      group_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      PRIMARY KEY (group_id, user_id)
    )`,
    `CREATE TABLE IF NOT EXISTS servers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      owner_id INTEGER NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    )`,
    `CREATE TABLE IF NOT EXISTS server_members (
      server_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      PRIMARY KEY (server_id, user_id)
    )`,
    `CREATE TABLE IF NOT EXISTS channels (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      server_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    )`,
    `CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sender_id INTEGER NOT NULL,
      channel_id INTEGER,
      recipient_id INTEGER,
      group_id INTEGER,
      content TEXT NOT NULL,
      reply_to_id INTEGER,
      edited_at TEXT,
      deleted INTEGER NOT NULL DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    )`,
    `CREATE TABLE IF NOT EXISTS reactions (
      message_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      emoji TEXT NOT NULL,
      PRIMARY KEY (message_id, user_id)
    )`,
    `CREATE TABLE IF NOT EXISTS read_state (
      user_id INTEGER NOT NULL,
      conversation_key TEXT NOT NULL,
      last_read_message_id INTEGER NOT NULL,
      PRIMARY KEY (user_id, conversation_key)
    )`,
    `CREATE TABLE IF NOT EXISTS push_subscriptions (
      user_id INTEGER NOT NULL,
      endpoint TEXT NOT NULL UNIQUE,
      p256dh TEXT NOT NULL,
      auth TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    )`,
    `CREATE INDEX IF NOT EXISTS idx_messages_channel ON messages(channel_id)`,
    `CREATE INDEX IF NOT EXISTS idx_messages_dm ON messages(sender_id, recipient_id)`,
    `CREATE INDEX IF NOT EXISTS idx_messages_group ON messages(group_id)`,
  ];
  for (const sql of statements) {
    await client.execute(sql);
  }
}

export const ready = migrate();

export async function generateAccessNumber() {
  let code;
  let exists;
  do {
    code = String(Math.floor(1000000 + Math.random() * 9000000));
    exists = await get("SELECT id FROM users WHERE access_number = ?", [code]);
  } while (exists);
  return code;
}

export default client;
