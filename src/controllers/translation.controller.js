import mongoose from "mongoose";
import translate from "google-translate-api-x";
import TranslationSession from "../models/TranslationSession.js";
import User from "../models/User.js";

const wordCache = new Map();

// GET /translation/lookup-word?word=...
export const lookupWord = async (req, res) => {
    try {
        const { word } = req.query;
        if (!word || !word.trim()) {
            return res.status(400).json({ message: "Thiếu từ cần tra" });
        }
        const cleanWord = word.trim().toLowerCase();

        if (wordCache.has(cleanWord)) {
            return res.json({ word: cleanWord, translation: wordCache.get(cleanWord) });
        }

        const transRes = await translate(cleanWord, { to: "vi" });
        const translationText = transRes?.text || "";

        if (translationText) {
            wordCache.set(cleanWord, translationText);
        }

        return res.json({ word: cleanWord, translation: translationText });
    } catch (error) {
        console.error("Backend word lookup error:", error.message);
        return res.status(500).json({ message: "Lỗi tra từ máy chủ", translation: "" });
    }
};

const getMongoUserId = async (userObj) => {
    if (!userObj) throw new Error("Unauthorized");
    if (userObj._id) return userObj._id;
    if (userObj.id) {
        const user = await User.findOne({ googleId: userObj.id }).select("_id").lean();
        if (user) return user._id;
        if (mongoose.Types.ObjectId.isValid(userObj.id)) return userObj.id;
    }
    throw new Error("User not found");
};

/**
 * Split text into sentences using English punctuation regex while preserving basic structure.
 */
function splitIntoSentences(text) {
    if (!text || typeof text !== "string") return [];
    // Split by newlines or sentence-ending punctuation (. ! ?) followed by space/newline
    const rawUnits = text.split(/(?<=[.!?])\s+|\n+/);
    const sentences = rawUnits
        .map(s => s.trim())
        .filter(s => s.length > 0)
        .map(s => ({
            original: s,
            roughTranslation: "",
            polishedTranslation: "",
            notes: ""
        }));
    return sentences;
}

// POST /translation - Create new session
export const createSession = async (req, res) => {
    try {
        const userId = await getMongoUserId(req.user);
        const { title, text, sentences: customSentences } = req.body;

        if (!title || !title.trim()) {
            return res.status(400).json({ message: "Vui lòng nhập tiêu đề bài dịch" });
        }

        let parsedSentences = [];
        if (Array.isArray(customSentences) && customSentences.length > 0) {
            parsedSentences = customSentences.map(s => typeof s === "string" ? {
                original: s.trim(),
                roughTranslation: "",
                polishedTranslation: "",
                notes: ""
            } : s);
        } else if (text && text.trim()) {
            parsedSentences = splitIntoSentences(text);
        }

        if (parsedSentences.length === 0) {
            return res.status(400).json({ message: "Nội dung bài báo/đoạn văn không được để trống" });
        }

        const session = await TranslationSession.create({
            userId,
            title: title.trim(),
            originalText: text || "",
            sentences: parsedSentences,
            vocab: [],
            grammarNotes: "",
            currentIdx: 0,
            status: "in_progress"
        });

        return res.status(201).json({
            message: "Tạo bài luyện dịch thành công",
            session
        });
    } catch (error) {
        console.error("Error creating translation session:", error);
        return res.status(500).json({ message: error.message || "Lỗi khi tạo bài dịch" });
    }
};

// GET /translation - Get list of user's sessions
export const getSessions = async (req, res) => {
    try {
        const userId = await getMongoUserId(req.user);
        const sessions = await TranslationSession.find({ userId })
            .select("title currentIdx sentences vocab status createdAt updatedAt")
            .sort({ updatedAt: -1 })
            .lean();

        // Calculate progress stats for summary
        const list = sessions.map(s => {
            const total = s.sentences ? s.sentences.length : 0;
            const completedCount = s.sentences ? s.sentences.filter(st => st.polishedTranslation || st.roughTranslation).length : 0;
            return {
                _id: s._id,
                title: s.title,
                totalSentences: total,
                completedSentences: completedCount,
                vocabCount: s.vocab ? s.vocab.length : 0,
                status: s.status,
                updatedAt: s.updatedAt,
                createdAt: s.createdAt
            };
        });

        return res.json({ sessions: list });
    } catch (error) {
        console.error("Error fetching translation sessions:", error);
        return res.status(500).json({ message: error.message || "Lỗi khi lấy danh sách bài dịch" });
    }
};

// GET /translation/:id - Get session by ID
export const getSessionById = async (req, res) => {
    try {
        const userId = await getMongoUserId(req.user);
        const { id } = req.params;

        const session = await TranslationSession.findOne({ _id: id, userId });
        if (!session) {
            return res.status(404).json({ message: "Không tìm thấy bài dịch" });
        }

        return res.json({ session });
    } catch (error) {
        console.error("Error fetching session by ID:", error);
        return res.status(500).json({ message: error.message || "Lỗi khi tải chi tiết bài dịch" });
    }
};

// PUT /translation/:id - Update session
export const updateSession = async (req, res) => {
    try {
        const userId = await getMongoUserId(req.user);
        const { id } = req.params;
        const { title, currentIdx, sentences, vocab, grammarNotes, status } = req.body;

        const session = await TranslationSession.findOne({ _id: id, userId });
        if (!session) {
            return res.status(404).json({ message: "Không tìm thấy bài dịch" });
        }

        if (title !== undefined) session.title = title.trim();
        if (currentIdx !== undefined) session.currentIdx = currentIdx;
        if (sentences !== undefined) session.sentences = sentences;
        if (vocab !== undefined) session.vocab = vocab;
        if (grammarNotes !== undefined) session.grammarNotes = grammarNotes;
        if (status !== undefined) session.status = status;

        await session.save();

        return res.json({
            message: "Lưu tiến độ bài dịch thành công",
            session
        });
    } catch (error) {
        console.error("Error updating translation session:", error);
        return res.status(500).json({ message: error.message || "Lỗi khi lưu bài dịch" });
    }
};

// DELETE /translation/:id - Delete session
export const deleteSession = async (req, res) => {
    try {
        const userId = await getMongoUserId(req.user);
        const { id } = req.params;

        const result = await TranslationSession.deleteOne({ _id: id, userId });
        if (result.deletedCount === 0) {
            return res.status(404).json({ message: "Không tìm thấy bài dịch để xóa" });
        }

        return res.json({ message: "Đã xóa bài dịch thành công" });
    } catch (error) {
        console.error("Error deleting translation session:", error);
        return res.status(500).json({ message: error.message || "Lỗi khi xóa bài dịch" });
    }
};
