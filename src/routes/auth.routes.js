import express from "express";
import passport from "../middleware/passport.js";
import { googleCallback } from "../controllers/auth.controller.js";

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

export default router;