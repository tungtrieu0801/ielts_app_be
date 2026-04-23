import express from "express";
import { verifyToken } from "../middleware/auth.middleware.js";
import {
    getStudySession,
    batchSubmit,
    getStudyStats,
    getStreakHeatmap,
    getStreakInfo,
    getStudySchedule,
} from "../controllers/study.controller.js";

const router = express.Router();

router.use(verifyToken);

router.get("/stats", getStudyStats);
router.get("/heatmap", getStreakHeatmap);
router.get("/streak", getStreakInfo);
router.get("/schedule", getStudySchedule);
router.get("/:setId/session", getStudySession);
router.post("/batch-submit", batchSubmit);

export default router;
