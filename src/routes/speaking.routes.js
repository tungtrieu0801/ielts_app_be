import express from "express";
import { verifyToken } from "../middleware/auth.middleware.js";
import {
    createTopic,
    getTopics,
    getTopicById,
    getRandomTopic,
    updateTopic,
    deleteTopic,
    submitAttempt,
    getAttempts,
} from "../controllers/speaking.controller.js";

const router = express.Router();

// Define /topics/random BEFORE /topics/:id to prevent overlaps
router.get("/topics/random", verifyToken, getRandomTopic);

router.get("/topics", verifyToken, getTopics);
router.get("/topics/:id", verifyToken, getTopicById);
router.post("/topics", verifyToken, createTopic);
router.put("/topics/:id", verifyToken, updateTopic);
router.delete("/topics/:id", verifyToken, deleteTopic);

router.post("/topics/:id/attempts", verifyToken, submitAttempt);
router.get("/attempts", verifyToken, getAttempts);

export default router;
