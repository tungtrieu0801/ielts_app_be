import express from "express";
import { verifyToken } from "../middleware/auth.middleware.js";
import {
    getWordSets,
    createWordSet,
    updateWordSet,
    deleteWordSet,
} from "../controllers/wordset.controller.js";

const router = express.Router();

router.use(verifyToken); // Tất cả route ở đây đều cần auth

router.get("/", getWordSets);
router.post("/", createWordSet);
router.put("/:id", updateWordSet);
router.delete("/:id", deleteWordSet);

export default router;
