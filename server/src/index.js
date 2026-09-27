import express from "express";
import cors from "cors";
import http from "http";
import { Server } from "socket.io";
import authRoutes from "./routes/auth.js";
import userRoutes from "./routes/users.js";
import serverRoutes from "./routes/servers.js";
import messageRoutes from "./routes/messages.js";
import groupRoutes from "./routes/groups.js";
import { setupSocket } from "./socket.js";
import { ready } from "./db.js";

const app = express();
app.use(cors());
app.use(express.json());

app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/servers", serverRoutes);
app.use("/api/messages", messageRoutes);
app.use("/api/groups", groupRoutes);

const httpServer = http.createServer(app);
const io = new Server(httpServer, { cors: { origin: "*" } });
setupSocket(io);

const PORT = process.env.PORT || 4000;
ready.then(() => {
  httpServer.listen(PORT, () => console.log(`Server rodando em http://localhost:${PORT}`));
});
