import { useEffect, useState } from "react";
import { api } from "../api.js";

export default function PublicChannelsModal({ onClose, onJoined }) {
  const [all, setAll] = useState([]);
  const [newName, setNewName] = useState("");

  useEffect(() => {
    api.allServers().then(setAll);
  }, []);

  async function join(id) {
    await api.joinServer(id);
    onJoined(id);
  }

  async function create(e) {
    e.preventDefault();
    if (!newName.trim()) return;
    const server = await api.createServer(newName.trim());
    setNewName("");
    onJoined(server.id);
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card wide" onClick={(e) => e.stopPropagation()}>
        <h3>Canais públicos</h3>
        <p className="subtitle">
          Como um canal de rádio: qualquer um pode criar e qualquer um pode entrar e conversar.
        </p>
        <div className="public-channel-list">
          {all.map((s) => (
            <div key={s.id} className="public-channel-item">
              <span># {s.name}</span>
              <button onClick={() => join(s.id)}>Entrar</button>
            </div>
          ))}
          {all.length === 0 && <div className="empty">Nenhum canal público ainda.</div>}
        </div>
        <form onSubmit={create} className="inline-form">
          <input
            placeholder="Nome do novo canal público"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
          />
          <button type="submit">Criar</button>
        </form>
        <div className="modal-actions">
          <button type="button" className="ghost" onClick={onClose}>
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}
