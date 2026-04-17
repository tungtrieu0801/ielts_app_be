import Word from "../models/Word.js";
import WordSet from "../models/WordSet.js";
import User from "../models/User.js";
import StudyLog from "../models/StudyLog.js";
import { calculateSM2 } from "../utils/sm2.js";

const getUserMongoId = async (googleId) => {
    const user = await User.findOne({ googleId }).select("_id").lean();
    if (!user) throw new Error("User not found");
    return user._id;
};

// Helper: lấy ngày UTC (00:00:00) của một Date
const toUTCDay = (date = new Date()) => {
    const d = new Date(date);
    d.setUTCHours(0, 0, 0, 0);
    return d;
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

        const updated = await Word.findByIdAndUpdate(wordId, srsData, { returnDocument: "after" }).lean();

        // Upsert StudyLog cho ngày hôm nay
        const today = toUTCDay();
        await StudyLog.findOneAndUpdate(
            { userId, date: today },
            {
                $inc: {
                    wordsReviewed: 1,
                    minutesStudied: 0.5, // ~30 giây per từ
                },
                $setOnInsert: { userId, date: today },
            },
            { upsert: true, returnDocument: "after" }
        );

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

// GET /study/heatmap — dữ liệu heatmap 365 ngày gần nhất
export const getStreakHeatmap = async (req, res) => {
    try {
        const userId = await getUserMongoId(req.user.id);

        const today = toUTCDay();
        const oneYearAgo = new Date(today);
        oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

        const logs = await StudyLog.find({
            userId,
            date: { $gte: oneYearAgo, $lte: today },
        })
            .select("date wordsReviewed minutesStudied -_id")
            .sort({ date: 1 })
            .lean();

        // Format date thành chuỗi YYYY-MM-DD
        const data = logs.map((log) => ({
            date: log.date.toISOString().split("T")[0],
            wordsReviewed: log.wordsReviewed,
            minutesStudied: Math.round(log.minutesStudied),
        }));

        res.json({ data });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

// GET /study/streak — thông tin streak học liên tiếp
export const getStreakInfo = async (req, res) => {
    try {
        const userId = await getUserMongoId(req.user.id);

        const today = toUTCDay();
        const oneYearAgo = new Date(today);
        oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

        const logs = await StudyLog.find({
            userId,
            date: { $gte: oneYearAgo },
            wordsReviewed: { $gt: 0 },
        })
            .select("date -_id")
            .sort({ date: -1 }) // Mới nhất trước
            .lean();

        if (logs.length === 0) {
            return res.json({ data: { currentStreak: 0, longestStreak: 0, totalStudyDays: 0 } });
        }

        // Chuyển thành Set các chuỗi ngày
        const daySet = new Set(logs.map((l) => l.date.toISOString().split("T")[0]));

        // Tính current streak
        let currentStreak = 0;
        const todayStr = today.toISOString().split("T")[0];
        const yesterdayDate = new Date(today);
        yesterdayDate.setUTCDate(yesterdayDate.getUTCDate() - 1);
        const yesterdayStr = yesterdayDate.toISOString().split("T")[0];

        // Streak bắt đầu từ hôm nay hoặc hôm qua (nếu hôm nay chưa học)
        const startFromToday = daySet.has(todayStr);
        const startFromYesterday = !startFromToday && daySet.has(yesterdayStr);

        if (startFromToday || startFromYesterday) {
            const checkDate = new Date(startFromToday ? today : yesterdayDate);
            while (true) {
                const checkStr = checkDate.toISOString().split("T")[0];
                if (daySet.has(checkStr)) {
                    currentStreak++;
                    checkDate.setUTCDate(checkDate.getUTCDate() - 1);
                } else {
                    break;
                }
            }
        }

        // Tính longest streak (duyệt toàn bộ logs đã sort desc)
        const sortedDays = [...daySet].sort(); // asc
        let longestStreak = 0;
        let tempStreak = 1;

        for (let i = 1; i < sortedDays.length; i++) {
            const prev = new Date(sortedDays[i - 1]);
            const curr = new Date(sortedDays[i]);
            const diffDays = (curr - prev) / (1000 * 60 * 60 * 24);
            if (diffDays === 1) {
                tempStreak++;
                longestStreak = Math.max(longestStreak, tempStreak);
            } else {
                tempStreak = 1;
            }
        }
        longestStreak = Math.max(longestStreak, 1);

        res.json({
            data: {
                currentStreak,
                longestStreak,
                totalStudyDays: daySet.size,
            },
        });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};
