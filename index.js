const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");

const app = express();
app.use(cors());

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

/* ================= STORAGE ================= */
const chats = new Map();
const userSockets = new Map();

/* ================= SOCKET ================= */
io.on("connection", (socket) => {
  console.log("🔌 Connected:", socket.id);

  socket.on("start_chat", ({ userId, name }) => {
    userSockets.set(userId, socket.id);

    if (!chats.has(userId)) {
      chats.set(userId, {
        userId,
        user: { name },
        messages: [],
        status: "online"
      });
    } else {
      chats.get(userId).status = "online";
    }

    socket.join(userId);
    io.to("agents").emit("chat_list", [...chats.values()]);
  });

  socket.on("user_activity", ({ userId, page, device }) => {
    const chat = chats.get(userId);
    if (!chat) return;

    chat.page = page;
    chat.device = device;

    io.to("agents").emit("chat_list", [...chats.values()]);
  });

  socket.on("user_message", ({ userId, text }) => {
    const chat = chats.get(userId);
    if (!chat) return;

    const message = { sender: "user", text };
    chat.messages.push(message);

    io.to("agents").emit("new_message", { userId, message });
  });

  socket.on("agent_join", () => {
    socket.join("agents");
    socket.emit("chat_list", [...chats.values()]);
  });

  socket.on("agent_message", ({ userId, text }) => {
    const chat = chats.get(userId);
    if (!chat) return;

    const message = { sender: "agent", text };
    chat.messages.push(message);

    const userSocketId = userSockets.get(userId);
    if (userSocketId) {
      io.to(userSocketId).emit("agent_reply", text);
    }

    io.to("agents").emit("new_message", { userId, message });
  });

  socket.on("disconnect", () => {
    for (const [userId, sid] of userSockets.entries()) {
      if (sid === socket.id) {
        const chat = chats.get(userId);
        if (chat) chat.status = "offline";
        userSockets.delete(userId);
        io.to("agents").emit("chat_list", [...chats.values()]);
        break;
      }
    }
  });
});

/* ================= START ================= */
const PORT = process.env.PORT || 8080;
server.listen(PORT, () => {
  console.log(`✅ LiveChat server running on port ${PORT}`);
});
