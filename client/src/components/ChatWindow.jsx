import { useEffect, useRef, useState } from "react";
import Avatar from "./Avatar.jsx";

const QUICK_EMOJIS = ["👍", "❤️", "😂", "😮", "😢", "🙏"];
const TYPING_IDLE_MS = 2000;

export default function ChatWindow({
  messages,
  onSend,
  me,
  typingUsernames,
  onTyping,
  onEditMessage,
  onDeleteMessage,
  onReact,
  showReceipts,
  theirReadUpTo,
}) {
  const [text, setText] = useState("");
  const [replyingTo, setReplyingTo] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [editText, setEditText] = useState("");
  const [reactingId, setReactingId] = useState(null);
  const bottomRef = useRef(null);
  const typingTimeoutRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  function handleTextChange(e) {
    setText(e.target.value);
    onTyping?.(true);
    clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => onTyping?.(false), TYPING_IDLE_MS);
  }

  function submit(e) {
    e.preventDefault();
    if (!text.trim()) return;
    onSend(text, replyingTo?.id || null);
    setText("");
    setReplyingTo(null);
    clearTimeout(typingTimeoutRef.current);
    onTyping?.(false);
  }

  function startEdit(m) {
    setEditingId(m.id);
    setEditText(m.content);
  }

  function saveEdit(e) {
    e.preventDefault();
    if (!editText.trim()) return;
    onEditMessage(editingId, editText.trim());
    setEditingId(null);
  }

  return (
    <div className="chat-window">
      <div className="chat-messages">
        {messages.map((m) => {
          const isOwn = m.sender_id === me.id;
          const read = showReceipts && isOwn && !m.deleted;
          return (
            <div key={m.id} className={`message-row ${isOwn ? "own" : ""}`}>
              {!isOwn && <Avatar username={m.username} avatar={m.avatar} size={28} />}
              <div className={`message ${isOwn ? "own" : ""}`}>
                <div className="message-author">{isOwn ? "Você" : m.username}</div>

                {m.replyTo && (
                  <div className="reply-quote">
                    <b>{m.replyTo.username}</b>: {m.replyTo.deleted ? "mensagem apagada" : m.replyTo.content}
                  </div>
                )}

                {editingId === m.id ? (
                  <form className="edit-form" onSubmit={saveEdit}>
                    <input
                      autoFocus
                      value={editText}
                      onChange={(e) => setEditText(e.target.value)}
                    />
                    <button type="submit">Salvar</button>
                    <button type="button" className="ghost" onClick={() => setEditingId(null)}>
                      Cancelar
                    </button>
                  </form>
                ) : (
                  <div className="message-bubble">
                    {m.deleted ? <i>Mensagem apagada</i> : m.content}
                    {m.editedAt && !m.deleted && <span className="edited-tag"> (editado)</span>}
                  </div>
                )}

                {m.reactions?.length > 0 && (
                  <div className="reaction-row">
                    {m.reactions.map((r) => (
                      <button
                        key={r.emoji}
                        className={`reaction-pill ${r.userIds.includes(me.id) ? "mine" : ""}`}
                        onClick={() => onReact(m.id, r.emoji)}
                      >
                        {r.emoji} {r.userIds.length}
                      </button>
                    ))}
                  </div>
                )}

                {!m.deleted && (
                  <div className="message-toolbar">
                    <button onClick={() => setReplyingTo(m)}>↩</button>
                    <button onClick={() => setReactingId(reactingId === m.id ? null : m.id)}>
                      😊
                    </button>
                    {isOwn && <button onClick={() => startEdit(m)}>✏️</button>}
                    {isOwn && <button onClick={() => onDeleteMessage(m.id)}>🗑️</button>}
                  </div>
                )}

                {reactingId === m.id && (
                  <div className="emoji-picker">
                    {QUICK_EMOJIS.map((e) => (
                      <button
                        key={e}
                        onClick={() => {
                          onReact(m.id, e);
                          setReactingId(null);
                        }}
                      >
                        {e}
                      </button>
                    ))}
                  </div>
                )}

                {read && (
                  <div className="read-tick">
                    {m.id <= theirReadUpTo ? (
                      <span className="tick tick-read">✓✓</span>
                    ) : (
                      <span className="tick">✓</span>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {typingUsernames?.length > 0 && (
        <div className="typing-indicator">
          {typingUsernames.join(", ")} {typingUsernames.length > 1 ? "estão" : "está"} digitando...
        </div>
      )}

      {replyingTo && (
        <div className="reply-composer">
          <span>
            Respondendo <b>{replyingTo.username}</b>: {replyingTo.content.slice(0, 60)}
          </span>
          <button onClick={() => setReplyingTo(null)}>✕</button>
        </div>
      )}

      <form className="chat-input" onSubmit={submit}>
        <input value={text} onChange={handleTextChange} placeholder="Escreva uma mensagem..." />
        <button type="submit">Enviar</button>
      </form>
    </div>
  );
}
