// Em dev, fica vazio e usa o proxy do Vite (/api -> localhost:4000).
// Em produção, defina VITE_API_URL com o endereço público do back-end (ex: https://chatapp-backend.onrender.com).
export const API_ORIGIN = import.meta.env.VITE_API_URL || "";
const BASE = `${API_ORIGIN}/api`;

function getToken() {
  return localStorage.getItem("token");
}

async function request(path, options = {}) {
  const res = await fetch(BASE + path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(getToken() ? { Authorization: `Bearer ${getToken()}` } : {}),
      ...(options.headers || {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Erro na requisição");
  return data;
}

export const api = {
  register: (username, email, password) =>
    request("/auth/register", {
      method: "POST",
      body: JSON.stringify({ username, email, password }),
    }),
  login: (identifier, password) =>
    request("/auth/login", { method: "POST", body: JSON.stringify({ identifier, password }) }),
  me: () => request("/users/me"),
  updateAvatar: (avatar) =>
    request("/users/me/avatar", { method: "PATCH", body: JSON.stringify({ avatar }) }),

  contacts: () => request("/users/contacts"),
  addContact: (accessNumber) =>
    request("/users/contacts", { method: "POST", body: JSON.stringify({ accessNumber }) }),

  blockedContacts: () => request("/users/blocked"),
  blockContact: (userId) => request(`/users/blocked/${userId}`, { method: "POST" }),
  unblockContact: (userId) => request(`/users/blocked/${userId}`, { method: "DELETE" }),

  myGroups: () => request("/groups"),
  createGroup: (name) => request("/groups", { method: "POST", body: JSON.stringify({ name }) }),
  groupMembers: (groupId) => request(`/groups/${groupId}/members`),
  addGroupMember: (groupId, accessNumber) =>
    request(`/groups/${groupId}/members`, {
      method: "POST",
      body: JSON.stringify({ accessNumber }),
    }),

  myServers: () => request("/servers"),
  allServers: () => request("/servers/all"),
  createServer: (name) => request("/servers", { method: "POST", body: JSON.stringify({ name }) }),
  joinServer: (id) => request(`/servers/${id}/join`, { method: "POST" }),
  channels: (serverId) => request(`/servers/${serverId}/channels`),
  createChannel: (serverId, name) =>
    request(`/servers/${serverId}/channels`, { method: "POST", body: JSON.stringify({ name }) }),

  channelHistory: (channelId) => request(`/messages/channel/${channelId}`),
  dmHistory: (userId) => request(`/messages/dm/${userId}`),
  groupHistory: (groupId) => request(`/messages/group/${groupId}`),
};
