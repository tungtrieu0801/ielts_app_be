import express from "express";
import { verifyToken } from "../middleware/auth.middleware.js";
import {
    getStudySession,
    submitReview,
    getStudyStats,
} from "../controllers/study.controller.js";

const router = express.Router();

router.use(verifyToken);

router.get("/stats", getStudyStats);
router.get("/:setId/session", getStudySession);
router.post("/:wordId/review", submitReview);

export default router;
