import { io } from "socket.io-client";
import { API_ORIGIN } from "./api.js";

let socket = null;

// Em dev, sem VITE_API_URL, cai no back-end local. Em produção, usa o mesmo
// endereço público configurado em VITE_API_URL.
const SOCKET_URL = API_ORIGIN || "http://localhost:4000";

export function connectSocket(token) {
  if (socket) socket.disconnect();
  socket = io(SOCKET_URL, { auth: { token } });
  return socket;
}

export function getSocket() {
  return socket;
}
