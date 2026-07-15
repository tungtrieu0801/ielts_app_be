import express from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import { verifyToken } from "../middleware/auth.middleware.js";
import { uploadBook, getBooks, getBookDetails, updateProgress } from "../controllers/book.controller.js";

const router = express.Router();

// Setup Multer for PDF upload
const storage = multer.diskStorage({
    destination(req, file, cb) {
        const dir = "uploads/books";
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        cb(null, dir);
    },
    filename(req, file, cb) {
        const ext = path.extname(file.originalname);
        const name = path.basename(file.originalname, ext);
        cb(null, `${name}-${Date.now()}${ext}`);
    },
});

const upload = multer({
    storage,
    fileFilter: function (req, file, cb) {
        if (file.mimetype === "application/pdf") {
            cb(null, true);
        } else {
            cb(new Error("Chỉ hỗ trợ file PDF!"), false);
        }
    },
    limits: { fileSize: 50 * 1024 * 1024 }, // 50MB limit
});

// Routes
router.post("/upload", verifyToken, upload.single("pdf"), uploadBook);
router.get("/", verifyToken, getBooks);
router.get("/:id", verifyToken, getBookDetails);
router.post("/:id/progress", verifyToken, updateProgress);

export default router;
