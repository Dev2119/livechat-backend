const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
const geoip = require("geoip-lite");

const app = express();
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" }
});

const chats = new Map();

io.on("connection", (socket) => {
  /* ================= START CHAT ================= */
  socket.on("start_chat", ({ userId, name }) => {
    if (!userId) return;

    let chat = chats.get(userId);

    if (!chat) {
      chat = {
        userId,
        socketId: socket.id,
        user: { name: name || "Guest" },
        messages: [],
        status: "online",
        lastSeen: null,
        page: "",
        device: "",
        country: ""
      };
      chats.set(userId, chat);
    } else {
      chat.socketId = socket.id;
      chat.status = "online";
    }

    socket.emit("chat_history", chat.messages);
    io.emit("chat_list", [...chats.values()]);
  });

  /* ================= USER MESSAGE ================= */
  socket.on("user_message", (text) => {
    const chat = [...chats.values()].find(c => c.socketId === socket.id);
    if (!chat) return;

    chat.messages.push({ sender: "user", text });
    io.emit("chat_list", [...chats.values()]);
  });

  /* ================= AGENT MESSAGE ================= */
  socket.on("agent_message", ({ userId, text }) => {
    const chat = chats.get(userId);
    if (!chat) return;

    chat.messages.push({ sender: "agent", text });
    io.to(chat.socketId).emit("agent_reply", text);
    io.emit("chat_list", [...chats.values()]);
  });

  /* ================= USER ACTIVITY ================= */
  socket.on("user_activity", ({ userId, page, device }) => {
    const chat = chats.get(userId);
    if (!chat) return;

    chat.page = page;
    chat.device = device;

    const ip =
      socket.handshake.headers["x-forwarded-for"]?.split(",")[0] ||
      socket.handshake.address;

    const geo = geoip.lookup(ip);
    chat.country = geo?.country || "Unknown";

    io.emit("chat_list", [...chats.values()]);
  });

  /* ================= DISCONNECT ================= */
  socket.on("disconnect", () => {
    for (const chat of chats.values()) {
      if (chat.socketId === socket.id) {
        chat.status = "offline";
        chat.lastSeen = Date.now();
        io.emit("chat_list", [...chats.values()]);
        break;
      }
    }
  });

  socket.on("delete_chat", (userId) => {
    chats.delete(userId);
    io.emit("chat_list", [...chats.values()]);
  });
});

/* ✅ USE RAILWAY PORT */
const PORT = process.env.PORT || 4000;

server.listen(PORT, () => {
  console.log(`✅ LiveChat server running on port ${PORT}`);
});
