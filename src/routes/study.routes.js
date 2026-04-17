import express from "express";
import { verifyToken } from "../middleware/auth.middleware.js";
import {
    getStudySession,
    submitReview,
    getStudyStats,
    getStreakHeatmap,
    getStreakInfo,
} from "../controllers/study.controller.js";

const router = express.Router();

router.use(verifyToken);

router.get("/stats", getStudyStats);
router.get("/heatmap", getStreakHeatmap);
router.get("/streak", getStreakInfo);
router.get("/:setId/session", getStudySession);
router.post("/:wordId/review", submitReview);

export default router;
