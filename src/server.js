import dotenv from "dotenv";
dotenv.config();

import express from "express";
import cors from "cors";

import passport from "./middleware/passport.js";
import authRoutes from "./routes/auth.routes.js";
import wordSetRoutes from "./routes/wordset.routes.js";
import wordRoutes from "./routes/word.routes.js";
import studyRoutes from "./routes/study.routes.js";
import dictationRoutes from "./routes/dictation.routes.js";
import folderRoutes from "./routes/folder.routes.js";
import connectDB from "./config/db.js";

const app = express();

app.use(cors({
    origin: process.env.FRONTEND_URL || "http://localhost:5173",
    credentials: true,
}));
app.use(express.json());
app.use(passport.initialize());

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
    app.listen(PORT, () => {
        console.log(`✅ Server running on port ${PORT}`);
    });
};

startServer();