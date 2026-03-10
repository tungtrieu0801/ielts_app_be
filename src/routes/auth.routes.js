import express from "express";
import passport from "../middleware/passport.js";
import { googleCallback } from "../controllers/auth.controller.js";

/*
    Trong express, router khai báo endpoint URL + method
    Controller xử lí logic khi endpoint được gọi
    Service xử lí business logic
 */

const router = express.Router();

/* redirect tới Google */

router.get(
    "/google",
    passport.authenticate("google", {
        scope: ["profile", "email"]
    })
);

/* callback */

router.get(
    "/google/callback",
    passport.authenticate("google", { session: false }),
    googleCallback
);

router.get("/me", (req, res) => {
    console.log(">>> [BE] Đang có request gọi /auth/me");

    // Fake dữ liệu giống hệt cấu trúc Google trả về
    const fakeUser = {
        name: "Tùng Triệu",
        email: "tungtrieu.dev@gmail.com",
        picture: "https://bit.ly/dan-abramov", // Hoặc để trống để test chữ cái đầu
        role: "Nhân tài cõi sỏi"
    };

    // Trả về đúng cấu trúc mà FE đang mong đợi
    res.json({
        user: fakeUser
    });
});

export default router;