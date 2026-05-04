import express from "express";
import { verifyToken } from "../middleware/auth.middleware.js";
import {
    getStudySession,
    getGlobalStudySession,
    batchSubmit,
    getStudyStats,
    getSetStats,
    getStreakHeatmap,
    getStreakInfo,
    getStudySchedule,
    getRanking,
} from "../controllers/study.controller.js";

const router = express.Router();

router.use(verifyToken);

router.get("/stats", getStudyStats);
router.get("/heatmap", getStreakHeatmap);
router.get("/streak", getStreakInfo);
router.get("/schedule", getStudySchedule);
router.get("/ranking", getRanking);
router.get("/global-session", getGlobalStudySession);
router.get("/:setId/stats", getSetStats);
router.get("/:setId/session", getStudySession);
router.post("/batch-submit", batchSubmit);

export default router;
