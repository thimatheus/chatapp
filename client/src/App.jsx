import { useEffect, useState, useCallback, useMemo } from "react";
import Login from "./components/Login.jsx";
import ServerRail from "./components/ServerRail.jsx";
import Sidebar from "./components/Sidebar.jsx";
import ChatWindow from "./components/ChatWindow.jsx";
import PromptModal from "./components/PromptModal.jsx";
import PublicChannelsModal from "./components/PublicChannelsModal.jsx";
import CallPanel from "./components/CallPanel.jsx";
import { api } from "./api.js";
import { connectSocket, getSocket } from "./socket.js";
import {
  isSoundEnabled,
  setSoundEnabled,
  requestNotificationPermission,
  showNotification,
} from "./notifications.js";

function dmKey(a, b) {
  const [x, y] = [a, b].sort((n, m) => n - m);
  return `dm:${x}:${y}`;
}

function formatLastSeen(iso) {
  if (!iso) return "";
  return new Date(iso.replace(" ", "T") + "Z").toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function App() {
  const [auth, setAuth] = useState(() => {
    const token = localStorage.getItem("token");
    const user = localStorage.getItem("user");
    return token && user ? { token, user: JSON.parse(user) } : null;
  });

  const [view, setView] = useState("dm"); // dm | group | server
  const [servers, setServers] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [groups, setGroups] = useState([]);
  const [blockedIds, setBlockedIds] = useState(new Set());
  const [onlineUserIds, setOnlineUserIds] = useState(new Set());

  const [activeServerId, setActiveServerId] = useState(null);
  const [channels, setChannels] = useState([]);
  const [activeChannelId, setActiveChannelId] = useState(null);
  const [activeContactId, setActiveContactId] = useState(null);
  const [activeGroupId, setActiveGroupId] = useState(null);

  const [messages, setMessages] = useState([]);
  const [theirReadUpTo, setTheirReadUpTo] = useState({}); // contactId -> lastMessageId
  const [typingByKey, setTypingByKey] = useState({}); // key -> {userId: username}
  const [modal, setModal] = useState(null);
  const [soundEnabled, setSoundEnabledState] = useState(isSoundEnabled());

  const [incomingCall, setIncomingCall] = useState(null);
  const [activeCall, setActiveCall] = useState(null);

  function handleAuth(data) {
    localStorage.setItem("token", data.token);
    localStorage.setItem("user", JSON.stringify(data.user));
    setAuth(data);
  }

  function logout() {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    getSocket()?.disconnect();
    setAuth(null);
  }

  useEffect(() => {
    if (!auth) return;
    requestNotificationPermission();
    const socket = connectSocket(auth.token);
    api.myServers().then(setServers);
    api.contacts().then(setContacts);
    api.myGroups().then(setGroups);
    api.blockedContacts().then((rows) => setBlockedIds(new Set(rows.map((r) => r.id))));

    socket.on("presence:snapshot", ({ onlineUserIds: ids }) => setOnlineUserIds(new Set(ids)));
    socket.on("presence:update", ({ userId, online, lastSeen }) => {
      setOnlineUserIds((prev) => {
        const next = new Set(prev);
        online ? next.add(userId) : next.delete(userId);
        return next;
      });
      if (!online && lastSeen) {
        setContacts((prev) => prev.map((c) => (c.id === userId ? { ...c, lastSeen } : c)));
      }
    });

    socket.on("channel:message", ({ channelId, message }) => {
      setActiveChannelId((current) => {
        if (current === channelId) setMessages((prev) => [...prev, message]);
        return current;
      });
    });

    socket.on("dm:message", ({ message }) => {
      setActiveContactId((current) => {
        if (current === message.sender_id || message.sender_id === auth.user.id) {
          setMessages((prev) => [...prev, message]);
        }
        return current;
      });
    });

    socket.on("dm:notify", ({ fromUsername, preview, fromUserId }) => {
      setActiveContactId((current) => {
        if (current !== fromUserId) showNotification(fromUsername, preview);
        return current;
      });
    });

    socket.on("dm:blocked", () => {
      alert("Você não pode enviar mensagem para esse contato (bloqueio mútuo).");
    });

    socket.on("group:message", ({ groupId, message }) => {
      setActiveGroupId((current) => {
        if (current === groupId) setMessages((prev) => [...prev, message]);
        else if (message.sender_id !== auth.user.id)
          showNotification(message.username, message.content);
        return current;
      });
    });

    socket.on("message:edited", (updated) => {
      setMessages((prev) => prev.map((m) => (m.id === updated.id ? updated : m)));
    });

    socket.on("message:deleted", ({ id }) => {
      setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, deleted: true, content: "" } : m)));
    });

    socket.on("reaction:update", ({ messageId, reactions }) => {
      setMessages((prev) => prev.map((m) => (m.id === messageId ? { ...m, reactions } : m)));
    });

    socket.on("read:update", ({ userId, lastMessageId }) => {
      setTheirReadUpTo((prev) => ({ ...prev, [userId]: lastMessageId }));
    });

    socket.on("typing", ({ key, userId, username, active }) => {
      setTypingByKey((prev) => {
        const next = { ...prev };
        const forKey = { ...(next[key] || {}) };
        if (active) forKey[userId] = username;
        else delete forKey[userId];
        next[key] = forKey;
        return next;
      });
    });

    socket.on("call:incoming", (payload) => {
      setActiveCall((current) => {
        if (!current) setIncomingCall(payload);
        return current;
      });
    });

    return () => socket.disconnect();
  }, [auth]);

  const currentKey = useMemo(() => {
    if (view === "dm" && activeContactId) return dmKey(auth?.user.id, activeContactId);
    if (view === "group" && activeGroupId) return `group:${activeGroupId}`;
    if (view === "server" && activeChannelId) return `channel:${activeChannelId}`;
    return null;
  }, [view, activeContactId, activeGroupId, activeChannelId, auth]);

  // Confirmação de leitura: avisa que li as mensagens da conversa aberta
  useEffect(() => {
    if (view !== "dm" || !activeContactId || messages.length === 0) return;
    const last = messages[messages.length - 1];
    getSocket()?.emit("read:ack", { key: currentKey, lastMessageId: last.id });
  }, [messages, view, activeContactId, currentKey]);

  const openChannel = useCallback(async (channelId) => {
    setView("server");
    setActiveChannelId(channelId);
    setActiveContactId(null);
    setActiveGroupId(null);
    const socket = getSocket();
    socket.emit("channel:join", channelId);
    const history = await api.channelHistory(channelId);
    setMessages(history);
  }, []);

  async function selectServer(serverId) {
    setActiveServerId(serverId);
    setView("server");
    const ch = await api.channels(serverId);
    setChannels(ch);
    if (ch.length) openChannel(ch[0].id);
    else {
      setActiveChannelId(null);
      setMessages([]);
    }
  }

  async function selectContact(userId) {
    setView("dm");
    setActiveContactId(userId);
    setActiveGroupId(null);
    setActiveChannelId(null);
    const socket = getSocket();
    socket.emit("dm:join", userId);
    const { messages: history, theirReadUpTo: readUpTo } = await api.dmHistory(userId);
    setMessages(history);
    setTheirReadUpTo((prev) => ({ ...prev, [userId]: readUpTo }));
  }

  async function selectGroup(groupId) {
    setView("group");
    setActiveGroupId(groupId);
    setActiveContactId(null);
    setActiveChannelId(null);
    const socket = getSocket();
    socket.emit("group:join", groupId);
    const history = await api.groupHistory(groupId);
    setMessages(history);
  }

  async function addContact(accessNumber) {
    const contact = await api.addContact(accessNumber);
    setContacts((prev) => [...prev, contact]);
  }

  async function toggleBlock(userId) {
    if (blockedIds.has(userId)) {
      await api.unblockContact(userId);
      setBlockedIds((prev) => {
        const next = new Set(prev);
        next.delete(userId);
        return next;
      });
    } else {
      await api.blockContact(userId);
      setBlockedIds((prev) => new Set(prev).add(userId));
    }
  }

  async function handleAvatarChange(dataUrl) {
    await api.updateAvatar(dataUrl);
    const updatedUser = { ...auth.user, avatar: dataUrl };
    localStorage.setItem("user", JSON.stringify(updatedUser));
    setAuth({ ...auth, user: updatedUser });
  }

  async function confirmCreateServer(name) {
    setModal(null);
    const server = await api.createServer(name);
    const updated = await api.myServers();
    setServers(updated);
    selectServer(server.id);
  }

  async function confirmCreateChannel(name) {
    setModal(null);
    if (!activeServerId) return;
    await api.createChannel(activeServerId, name);
    const ch = await api.channels(activeServerId);
    setChannels(ch);
  }

  async function confirmCreateGroup(name) {
    setModal(null);
    const group = await api.createGroup(name);
    const updated = await api.myGroups();
    setGroups(updated);
    selectGroup(group.id);
  }

  async function confirmAddMember(accessNumber) {
    setModal(null);
    if (!activeGroupId) return;
    await api.addGroupMember(activeGroupId, accessNumber);
  }

  async function onJoinedPublicServer(serverId) {
    setModal(null);
    const updated = await api.myServers();
    setServers(updated);
    selectServer(serverId);
  }

  function sendMessage(text, replyToId) {
    const socket = getSocket();
    if (view === "dm" && activeContactId) {
      socket.emit("dm:message", { recipientId: activeContactId, content: text, replyToId });
    } else if (view === "group" && activeGroupId) {
      socket.emit("group:message", { groupId: activeGroupId, content: text, replyToId });
    } else if (view === "server" && activeChannelId) {
      socket.emit("channel:message", { channelId: activeChannelId, content: text, replyToId });
    }
  }

  function handleTyping(active) {
    if (!currentKey) return;
    getSocket()?.emit("typing", { key: currentKey, active });
  }

  function editMessage(id, content) {
    getSocket()?.emit("message:edit", { id, content });
  }

  function deleteMessage(id) {
    if (!confirm("Apagar essa mensagem?")) return;
    getSocket()?.emit("message:delete", { id });
  }

  function reactToMessage(id, emoji) {
    getSocket()?.emit("reaction:toggle", { messageId: id, emoji });
  }

  function toggleSound() {
    const next = !soundEnabled;
    setSoundEnabled(next);
    setSoundEnabledState(next);
  }

  function startCall(kind) {
    if (view === "dm" && activeContactId) {
      const roomId = dmKey(auth.user.id, activeContactId);
      getSocket().emit("call:invite", { roomId, toUserId: activeContactId, kind, label: title });
      setActiveCall({ roomId, kind, label: title });
    } else if (view === "group" && activeGroupId) {
      const roomId = `group:${activeGroupId}`;
      api.groupMembers(activeGroupId).then((members) => {
        members
          .filter((m) => m.id !== auth.user.id)
          .forEach((m) =>
            getSocket().emit("call:invite", { roomId, toUserId: m.id, kind, label: title })
          );
      });
      setActiveCall({ roomId, kind, label: title });
    }
  }

  function acceptIncomingCall() {
    setActiveCall({ roomId: incomingCall.roomId, kind: incomingCall.kind, label: incomingCall.label });
    setIncomingCall(null);
  }

  if (!auth) return <Login onAuth={handleAuth} />;

  const activeServer = servers.find((s) => s.id === activeServerId);
  const activeContact = contacts.find((c) => c.id === activeContactId);
  const activeGroup = groups.find((g) => g.id === activeGroupId);

  let title = "Selecione uma conversa";
  if (view === "dm" && activeContact) title = activeContact.username;
  if (view === "group" && activeGroup) title = activeGroup.name;
  if (view === "server" && activeChannelId) {
    const ch = channels.find((c) => c.id === activeChannelId);
    title = ch ? `# ${ch.name}` : title;
  }

  const canCall = (view === "dm" && activeContactId) || (view === "group" && activeGroupId);
  const typingUsernames = Object.values(typingByKey[currentKey] || {});
  const isContactOnline = view === "dm" && activeContactId && onlineUserIds.has(activeContactId);
  const subtitle =
    view === "dm" && activeContact
      ? isContactOnline
        ? "online"
        : activeContact.lastSeen
        ? `visto por último em ${formatLastSeen(activeContact.lastSeen)}`
        : ""
      : "";

  return (
    <div className="app">
      <ServerRail
        servers={servers}
        activeServerId={activeServerId}
        view={view}
        onSelectServer={selectServer}
        onSetView={setView}
        onCreateServer={() => setModal("public")}
      />
      <Sidebar
        view={view}
        serverName={activeServer?.name || ""}
        channels={channels}
        activeChannelId={activeChannelId}
        onSelectChannel={openChannel}
        onCreateChannel={() => setModal("channel")}
        contacts={contacts}
        activeContactId={activeContactId}
        onSelectContact={selectContact}
        onAddContact={addContact}
        onToggleBlock={toggleBlock}
        blockedIds={blockedIds}
        onlineUserIds={onlineUserIds}
        groups={groups}
        activeGroupId={activeGroupId}
        onSelectGroup={selectGroup}
        onCreateGroup={() => setModal("group")}
        me={auth.user}
        onAvatarChange={handleAvatarChange}
        soundEnabled={soundEnabled}
        onToggleSound={toggleSound}
      />
      <div className="main">
        <div className="topbar">
          <span>
            {title}
            {subtitle && <span className="topbar-subtitle"> · {subtitle}</span>}
          </span>
          <div className="topbar-actions">
            {canCall && (
              <>
                <button className="call-btn" title="Ligação de voz" onClick={() => startCall("audio")}>
                  📞
                </button>
                <button className="call-btn" title="Chamada de vídeo" onClick={() => startCall("video")}>
                  🎥
                </button>
              </>
            )}
            {view === "group" && activeGroupId && (
              <button className="call-btn" title="Adicionar pessoa" onClick={() => setModal("addMember")}>
                ➕
              </button>
            )}
            <button className="logout" onClick={logout}>
              Sair
            </button>
          </div>
        </div>
        <ChatWindow
          key={currentKey}
          messages={messages}
          onSend={sendMessage}
          me={auth.user}
          typingUsernames={typingUsernames}
          onTyping={handleTyping}
          onEditMessage={editMessage}
          onDeleteMessage={deleteMessage}
          onReact={reactToMessage}
          showReceipts={view === "dm"}
          theirReadUpTo={theirReadUpTo[activeContactId]}
        />
      </div>

      {modal === "server" && (
        <PromptModal
          title="Criar servidor"
          placeholder="Nome do servidor"
          onConfirm={confirmCreateServer}
          onCancel={() => setModal(null)}
        />
      )}
      {modal === "channel" && (
        <PromptModal
          title="Criar canal"
          placeholder="Nome do canal"
          onConfirm={confirmCreateChannel}
          onCancel={() => setModal(null)}
        />
      )}
      {modal === "group" && (
        <PromptModal
          title="Criar grupo"
          placeholder="Nome do grupo"
          onConfirm={confirmCreateGroup}
          onCancel={() => setModal(null)}
        />
      )}
      {modal === "addMember" && (
        <PromptModal
          title="Adicionar pessoa ao grupo"
          placeholder="Número de acesso (ex: 1112345)"
          onConfirm={confirmAddMember}
          onCancel={() => setModal(null)}
        />
      )}
      {modal === "public" && (
        <PublicChannelsModal onClose={() => setModal(null)} onJoined={onJoinedPublicServer} />
      )}

      {incomingCall && !activeCall && (
        <div className="incoming-call">
          <div>
            <b>{incomingCall.fromUsername}</b> está te ligando ({incomingCall.kind === "video" ? "vídeo" : "voz"})
          </div>
          <div className="incoming-call-actions">
            <button onClick={acceptIncomingCall}>Aceitar</button>
            <button className="ghost" onClick={() => setIncomingCall(null)}>
              Recusar
            </button>
          </div>
        </div>
      )}

      {activeCall && (
        <CallPanel call={activeCall} me={auth.user} onClose={() => setActiveCall(null)} />
      )}
    </div>
  );
}
