import dotenv from "dotenv";
dotenv.config({ path: "./.env" });

import express from "express";


import cors from "cors";

import passport from "./middleware/passport.js";
import authRoutes from "./routes/auth.routes.js";

const app = express();

app.use(cors());
app.use(express.json());

app.use(passport.initialize());

app.use("/auth", authRoutes);

const PORT = 5000;

app.listen(PORT, () => {
    console.log("CLIENT:", process.env.GOOGLE_CLIENT_ID);
    console.log(`Server running on port ${PORT}`);
});