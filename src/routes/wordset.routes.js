import express from "express";
import { verifyToken } from "../middleware/auth.middleware.js";
import {
    getWordSets,
    getPublicSets,
    createWordSet,
    updateWordSet,
    deleteWordSet,
    forkWordSet,
    toggleDisableWordSet,
} from "../controllers/wordset.controller.js";

const router = express.Router();

router.use(verifyToken); // Tất cả route ở đây đều cần auth

router.get("/", getWordSets);
router.get("/public", getPublicSets);       // Bộ từ public của người khác
router.post("/", createWordSet);
router.put("/:id", updateWordSet);
router.patch("/:id/toggle-disable", toggleDisableWordSet); // Bật/tắt bộ từ
router.delete("/:id", deleteWordSet);
router.post("/:id/fork", forkWordSet);      // Fork bộ từ public về tài khoản

export default router;
