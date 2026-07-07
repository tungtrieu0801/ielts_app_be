import express from "express";
import { verifyToken } from "../middleware/auth.middleware.js";
import {
    getSurvivalQuestions,
    submitSurvivalScore,
    getSurvivalLeaderboard,
    getSurvivalStats,
    triggerSeeding,
    getSeedingStatus
} from "../controllers/game.controller.js";

const router = express.Router();

// CEFR seeding endpoints - public (no token verification required)
router.post("/survival/seed", triggerSeeding);
router.get("/survival/seed-status", getSeedingStatus);

// Authenticated routes below this point
router.use(verifyToken);

router.get("/survival/questions", getSurvivalQuestions);
router.post("/survival/score", submitSurvivalScore);
router.get("/survival/leaderboard", getSurvivalLeaderboard);
router.get("/survival/stats", getSurvivalStats);

export default router;
