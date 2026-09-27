export default function Avatar({ username, avatar, online, size = 24 }) {
  const style = { width: size, height: size, fontSize: size * 0.5 };
  return (
    <span className="avatar-wrap" style={{ width: size, height: size }}>
      {avatar ? (
        <img className="avatar-img" src={avatar} style={style} alt={username} />
      ) : (
        <span className="avatar" style={style}>
          {(username || "?").slice(0, 1).toUpperCase()}
        </span>
      )}
      {online && <span className="online-dot" />}
    </span>
  );
}
