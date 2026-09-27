export default function ServerRail({ servers, activeServerId, view, onSelectServer, onSetView, onCreateServer }) {
  return (
    <div className="server-rail">
      <button
        className={`server-icon home ${view === "dm" ? "active" : ""}`}
        title="Conversas diretas"
        onClick={() => onSetView("dm")}
      >
        💬
      </button>
      <button
        className={`server-icon home ${view === "group" ? "active" : ""}`}
        title="Grupos"
        onClick={() => onSetView("group")}
      >
        👥
      </button>
      <div className="rail-divider" />
      {servers.map((s) => (
        <button
          key={s.id}
          className={`server-icon ${view === "server" && activeServerId === s.id ? "active" : ""}`}
          title={s.name}
          onClick={() => onSelectServer(s.id)}
        >
          {s.name.slice(0, 2).toUpperCase()}
        </button>
      ))}
      <button className="server-icon add" title="Canais públicos" onClick={onCreateServer}>
        📡
      </button>
    </div>
  );
}
