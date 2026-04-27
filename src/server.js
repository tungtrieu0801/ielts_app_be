import dotenv from "dotenv";
dotenv.config();

import express from "express";
import cors from "cors";
import { createServer } from "http";
import { Server } from "socket.io";

import passport from "./middleware/passport.js";
import authRoutes from "./routes/auth.routes.js";
import wordSetRoutes from "./routes/wordset.routes.js";
import wordRoutes from "./routes/word.routes.js";
import studyRoutes from "./routes/study.routes.js";
import dictationRoutes from "./routes/dictation.routes.js";
import folderRoutes from "./routes/folder.routes.js";
import connectDB from "./config/db.js";
import ChatMessage from "./models/ChatMessage.js";

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
    cors: {
        origin: process.env.FRONTEND_URL || "http://localhost:5173",
        credentials: true,
    },
});

app.use(cors({
    origin: process.env.FRONTEND_URL || "http://localhost:5173",
    credentials: true,
}));
app.use(express.json());
app.use(passport.initialize());

// Socket.io logic
io.on("connection", async (socket) => {
    console.log("⚡ User connected:", socket.id);

    try {
        const history = await ChatMessage.find().sort({ timestamp: -1 }).limit(15).lean();
        socket.emit("chat_history", history.reverse());
    } catch (err) {
        console.error("Error loading chat history:", err);
    }

    socket.on("load_more_history", async (skip) => {
        try {
            const older = await ChatMessage.find().sort({ timestamp: -1 }).skip(skip).limit(15).lean();
            socket.emit("older_messages", older.reverse());
        } catch (err) {
            console.error("Error loading older messages:", err);
        }
    });

    socket.on("send_message", async (data) => {
        try {
            const newMsg = await ChatMessage.create({
                userId: data.userId,
                sender: data.sender,
                picture: data.picture,
                text: data.text,
                isAdmin: data.isAdmin || false,
                replyTo: data.replyTo || null,
            });
            io.emit("receive_message", newMsg);
        } catch (err) {
            console.error("Error saving message:", err);
        }
    });

    socket.on("disconnect", () => {
        console.log("🔥 User disconnected:", socket.id);
    });
});

// Routes
app.use("/auth", authRoutes);
app.use("/wordsets", wordSetRoutes);
app.use("/wordsets/:setId/words", wordRoutes);
app.use("/study", studyRoutes);
app.use("/dictation", dictationRoutes);
app.use("/folders", folderRoutes);

// Health & Status check
app.get("/", (req, res) => res.json({
    message: "IELTS App Backend is running! 🚀",
    status: "ok",
    timestamp: new Date()
}));
app.get("/health", (req, res) => res.json({ status: "ok" }));

const PORT = process.env.PORT || 5000;

const startServer = async () => {
    await connectDB();
    httpServer.listen(PORT, () => {
        console.log(`✅ Server running on port ${PORT}`);
    });
};

startServer();