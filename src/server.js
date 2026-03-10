import dotenv from "dotenv";
dotenv.config();

import express from "express";
import cors from "cors";

import passport from "./middleware/passport.js";
import authRoutes from "./routes/auth.routes.js";
import connectDB from "./config/db.js";

const app = express();

app.use(cors());
app.use(express.json());

app.use(passport.initialize());

app.use("/auth", authRoutes);

const PORT = 5000;

const startServer = async () => {
    await connectDB();

    app.listen(PORT, () => {
        console.log(`Server running on port ${PORT}`);
    });
};

startServer();