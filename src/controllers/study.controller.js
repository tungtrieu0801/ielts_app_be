import Word from "../models/Word.js";
import WordSet from "../models/WordSet.js";
import User from "../models/User.js";
import { calculateSM2 } from "../utils/sm2.js";

const getUserMongoId = async (googleId) => {
    const user = await User.findOne({ googleId }).select("_id").lean();
    if (!user) throw new Error("User not found");
    return user._id;
};

// GET /study/:setId/session — lấy danh sách thẻ cần ôn hôm nay trong bộ từ
export const getStudySession = async (req, res) => {
    try {
        const userId = await getUserMongoId(req.user.id);
        const { setId } = req.params;
        const { limit = 20 } = req.query;

        const now = new Date();

        const words = await Word.find({
            userId,
            setId,
            nextReview: { $lte: now },
        })
            .sort({ nextReview: 1 })
            .limit(Number(limit))
            .lean();

        // Nếu không có thẻ cần ôn, trả về toàn bộ thẻ trong set (mode: học mới)
        if (words.length === 0) {
            const allWords = await Word.find({ userId, setId })
                .sort({ createdAt: 1 })
                .limit(Number(limit))
                .lean();
            return res.json({ data: allWords, mode: "review_new", total: allWords.length });
        }

        res.json({ data: words, mode: "srs_review", total: words.length });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

// POST /study/:wordId/review — submit kết quả (quality: 0=Again, 1=Hard, 2=Good, 3=Easy)
export const submitReview = async (req, res) => {
    try {
        const userId = await getUserMongoId(req.user.id);
        const { wordId } = req.params;
        const { quality } = req.body;

        if (quality === undefined || quality === null || ![0, 1, 2, 3].includes(Number(quality))) {
            return res.status(400).json({ message: "quality must be 0, 1, 2, or 3" });
        }

        const word = await Word.findOne({ _id: wordId, userId });
        if (!word) return res.status(404).json({ message: "Word not found" });

        const srsData = calculateSM2(
            {
                repetition: word.repetition,
                interval: word.interval,
                easeFactor: word.easeFactor,
            },
            Number(quality)
        );

        const updated = await Word.findByIdAndUpdate(wordId, srsData, { new: true }).lean();

        res.json({ data: updated, srs: srsData });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

// GET /study/stats — thống kê tổng quan của user
export const getStudyStats = async (req, res) => {
    try {
        const userId = await getUserMongoId(req.user.id);
        const now = new Date();

        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);

        const [
            totalWords,
            dueToday,
            reviewedToday,
            totalSets,
            masteredWords,
        ] = await Promise.all([
            Word.countDocuments({ userId }),
            Word.countDocuments({ userId, nextReview: { $lte: now } }),
            Word.countDocuments({ userId, lastReviewed: { $gte: todayStart } }),
            WordSet.countDocuments({ userId }),
            // Những từ có interval >= 21 ngày coi là "mastered"
            Word.countDocuments({ userId, interval: { $gte: 21 } }),
        ]);

        res.json({
            data: {
                totalWords,
                dueToday,
                reviewedToday,
                totalSets,
                masteredWords,
            },
        });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};
