import express from "express";
import { verifyToken } from "../middleware/auth.middleware.js";
import {
    getWords,
    createWord,
    bulkCreateWords,
    updateWord,
    deleteWord,
} from "../controllers/word.controller.js";

const router = express.Router({ mergeParams: true }); // mergeParams để lấy setId từ parent route

router.use(verifyToken);

router.get("/", getWords);
router.post("/", createWord);
router.post("/bulk", bulkCreateWords);
router.put("/:id", updateWord);
router.delete("/:id", deleteWord);

export default router;
