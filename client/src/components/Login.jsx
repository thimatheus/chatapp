import { useState } from "react";
import { api } from "../api.js";

export default function Login({ onAuth }) {
  const [mode, setMode] = useState("login");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [registered, setRegistered] = useState(null);

  async function submit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      if (mode === "login") {
        const data = await api.login(identifier.trim(), password);
        onAuth(data);
      } else {
        const data = await api.register(username.trim(), email.trim(), password);
        setRegistered(data);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  if (registered) {
    return (
      <div className="auth-screen">
        <div className="auth-card">
          <h1>Conta criada!</h1>
          <p className="subtitle">
            Seu número de acesso (compartilhe pra receberem contato, como um número do WhatsApp):
          </p>
          <div className="access-number-display">{registered.user.accessNumber}</div>
          <button onClick={() => onAuth(registered)}>Entrar no app</button>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-screen">
      <form className="auth-card" onSubmit={submit}>
        <h1>ChatApp</h1>
        <p className="subtitle">Servidores estilo Discord + conversas diretas estilo WhatsApp</p>

        {mode === "register" && (
          <input
            placeholder="seu nome"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoFocus
          />
        )}
        {mode === "register" ? (
          <input
            placeholder="e-mail"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        ) : (
          <input
            placeholder="e-mail ou número de acesso"
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            autoFocus
          />
        )}
        <input
          placeholder="senha"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        {error && <div className="error">{error}</div>}
        <button type="submit" disabled={loading}>
          {mode === "login" ? "Entrar" : "Criar conta"}
        </button>
        <button
          type="button"
          className="link"
          onClick={() => setMode(mode === "login" ? "register" : "login")}
        >
          {mode === "login" ? "Não tem conta? Criar uma" : "Já tem conta? Entrar"}
        </button>
      </form>
    </div>
  );
}
