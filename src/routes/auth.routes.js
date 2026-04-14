import express from "express";
import passport from "../middleware/passport.js";
import { googleCallback } from "../controllers/auth.controller.js";
import { generateToken } from "../utils/jwt.js";

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
router.get("/me", (req, res) => {
    console.log(">>> [BE] Đang có request gọi /auth/me");
    const fakeUser = {
        name: "Tùng Triệu",
        email: "tungtrieu.dev@gmail.com",
        picture: "https://bit.ly/dan-abramov",
        role: "Nhân tài cõi sỏi"
    };
    res.json({ user: fakeUser });
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