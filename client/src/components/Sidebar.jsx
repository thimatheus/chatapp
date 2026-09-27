import { useRef, useState } from "react";
import Avatar from "./Avatar.jsx";
import { fileToAvatarDataUrl } from "../avatar.js";

export default function Sidebar({
  view,
  serverName,
  channels,
  activeChannelId,
  onSelectChannel,
  onCreateChannel,
  contacts,
  activeContactId,
  onSelectContact,
  onAddContact,
  onToggleBlock,
  blockedIds,
  onlineUserIds,
  groups,
  activeGroupId,
  onSelectGroup,
  onCreateGroup,
  me,
  onAvatarChange,
  soundEnabled,
  onToggleSound,
}) {
  const [accessNumber, setAccessNumber] = useState("");
  const [addError, setAddError] = useState("");
  const fileInputRef = useRef(null);

  async function submitAddContact(e) {
    e.preventDefault();
    setAddError("");
    try {
      await onAddContact(accessNumber.trim());
      setAccessNumber("");
    } catch (err) {
      setAddError(err.message);
    }
  }

  async function handleAvatarPick(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const dataUrl = await fileToAvatarDataUrl(file);
    onAvatarChange(dataUrl);
  }

  return (
    <div className="sidebar">
      <div className="sidebar-header">
        {view === "dm" && "Conversas"}
        {view === "group" && "Grupos"}
        {view === "server" && serverName}
      </div>

      {view === "dm" && (
        <form className="inline-form small" onSubmit={submitAddContact}>
          <input
            placeholder="nº de acesso (ex: 1112345)"
            value={accessNumber}
            onChange={(e) => setAccessNumber(e.target.value)}
            maxLength={7}
          />
          <button type="submit">+</button>
        </form>
      )}
      {addError && <div className="error small">{addError}</div>}

      {view === "group" && (
        <div className="sidebar-item add-channel" onClick={onCreateGroup}>
          + novo grupo
        </div>
      )}

      <div className="sidebar-list">
        {view === "dm" &&
          contacts.map((c) => (
            <div
              key={c.id}
              className={`sidebar-item ${activeContactId === c.id ? "active" : ""}`}
              onClick={() => onSelectContact(c.id)}
            >
              <Avatar username={c.username} avatar={c.avatar} online={onlineUserIds.has(c.id)} />
              <span className="sidebar-item-label">
                {c.username}
                {blockedIds.has(c.id) && <span className="blocked-tag">bloqueado</span>}
              </span>
              <button
                className="block-btn"
                title={blockedIds.has(c.id) ? "Desbloquear" : "Bloquear"}
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleBlock(c.id);
                }}
              >
                {blockedIds.has(c.id) ? "✅" : "🚫"}
              </button>
            </div>
          ))}

        {view === "group" &&
          groups.map((g) => (
            <div
              key={g.id}
              className={`sidebar-item ${activeGroupId === g.id ? "active" : ""}`}
              onClick={() => onSelectGroup(g.id)}
            >
              👥 {g.name}
            </div>
          ))}

        {view === "server" &&
          channels.map((c) => (
            <div
              key={c.id}
              className={`sidebar-item ${activeChannelId === c.id ? "active" : ""}`}
              onClick={() => onSelectChannel(c.id)}
            >
              # {c.name}
            </div>
          ))}
        {view === "server" && (
          <div className="sidebar-item add-channel" onClick={onCreateChannel}>
            + novo canal
          </div>
        )}
      </div>

      <div className="sidebar-footer">
        <div className="me-row" onClick={() => fileInputRef.current?.click()} title="Trocar foto de perfil">
          <Avatar username={me.username} avatar={me.avatar} size={32} />
          <div>
            <div>
              Logado como <b>{me.username}</b>
            </div>
            <div className="my-access-number">Nº de acesso: {me.accessNumber}</div>
          </div>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          hidden
          onChange={handleAvatarPick}
        />
        <label className="sound-toggle">
          <input type="checkbox" checked={soundEnabled} onChange={onToggleSound} />
          Notificação sonora
        </label>
      </div>
    </div>
  );
}
