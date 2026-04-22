import express from "express";
import passport from "../middleware/passport.js";
import { googleCallback } from "../controllers/auth.controller.js";
import { generateToken } from "../utils/jwt.js";
import { verifyToken } from "../middleware/auth.middleware.js";
import User from "../models/User.js";

const router = express.Router();

/* redirect tới Google */
router.get(
    "/google",
    passport.authenticate("google", { scope: ["profile", "email"] })
);

/* callback */
router.get(
    "/google/callback",
    passport.authenticate("google", { session: false }),
    googleCallback
);

/* /me — trả về user từ token */
router.get("/me", verifyToken, async (req, res) => {
    try {
        const user = await User.findOne({ googleId: req.user.id });
        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }
        res.json({ user });
    } catch (error) {
        console.error("Error fetching /auth/me:", error);
        res.status(500).json({ message: "Server Error" });
    }
});

/* /dev-login — chỉ dùng trong development để bypass Google OAuth */
router.get("/dev-login", (req, res) => {
    if (process.env.NODE_ENV === "production") {
        return res.status(403).json({ message: "Not available in production" });
    }
    const devUser = {
        _id: "dev-user-001",
        googleId: "dev-google-id",
        name: "Dev User",
        email: "dev@ielts-vocab.local",
        picture: "https://api.dicebear.com/7.x/avataaars/svg?seed=DevUser",
    };
    const token = generateToken(devUser);
    const redirectUrl = `${process.env.FRONTEND_URL}/oauth-success?token=${token}`;
    res.redirect(redirectUrl);
});

export default router;