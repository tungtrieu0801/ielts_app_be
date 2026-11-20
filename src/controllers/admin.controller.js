import mongoose from "mongoose";
import User from "../models/User.js";
import DictationProgress, { RecentVideos } from "../models/DictationProgress.js";
import YoutubeCache from "../models/YoutubeCache.js";
import WordSet from "../models/WordSet.js";
import Word from "../models/Word.js";
import Folder from "../models/Folder.js";
import StudyLog from "../models/StudyLog.js";
import OnlineLog from "../models/OnlineLog.js";
import Book from "../models/Book.js";
import BookProgress from "../models/BookProgress.js";
import ChatMessage from "../models/ChatMessage.js";
import TranslationSession from "../models/TranslationSession.js";
import SynonymWord from "../models/SynonymWord.js";
import SynonymProgress from "../models/SynonymProgress.js";
import UserCard from "../models/UserCard.js";

/**
 * GET /api/admin/dashboard
 * Access restricted to tungvp@gmail.com
 */
export const getAdminDashboardData = async (req, res) => {
    try {
        // 1. Fetch all users (excluding system user)
        const usersList = await User.find({ email: { $ne: "system@ieltsapp.com" } })
            .select("name email picture role isActive lastLogin lastActive createdAt survivalHighScore currentStreak")
            .sort({ lastActive: -1, createdAt: -1 })
            .lean();

        // 2. Fetch all dictation progresses with user details
        const rawProgresses = await DictationProgress.find()
            .populate("userId", "name email picture")
            .sort({ updatedAt: -1 })
            .lean();

        // Map video titles from YoutubeCache
        const videoIds = Array.from(new Set(rawProgresses.map(p => p.videoId)));
        const videoCaches = await YoutubeCache.find({ videoId: { $in: videoIds } })
            .select("videoId title total")
            .lean();

        const videoCacheMap = {};
        videoCaches.forEach(v => {
            videoCacheMap[v.videoId] = v;
        });

        const videoProgresses = rawProgresses
            .filter(p => p.userId)
            .map(p => {
                const cache = videoCacheMap[p.videoId];
                const doneCount = Array.isArray(p.done) ? p.done.length : 0;
                const totalSentences = cache?.total || (p.idx ? p.idx + 1 : doneCount);
                const progressPercent = totalSentences > 0 ? Math.min(100, Math.round((doneCount / totalSentences) * 100)) : 0;

                return {
                    id: p._id,
                    user: {
                        id: p.userId._id,
                        name: p.userId.name,
                        email: p.userId.email,
                        picture: p.userId.picture
                    },
                    videoId: p.videoId,
                    videoTitle: cache?.title || `YouTube Video (${p.videoId})`,
                    doneCount,
                    totalSentences,
                    progressPercent,
                    stats: p.stats || { correct: 0, wrong: 0 },
                    updatedAt: p.updatedAt
                };
            });

        // 3. Fetch all word sets with author details
        const rawWordSets = await WordSet.find()
            .populate("userId", "name email picture")
            .sort({ createdAt: -1 })
            .lean();

        const wordSets = rawWordSets
            .filter(ws => ws.userId)
            .map(ws => ({
                id: ws._id,
                title: ws.title,
                description: ws.description,
                wordCount: ws.wordCount || 0,
                isPublic: !!ws.isPublic,
                color: ws.color || "blue",
                author: {
                    id: ws.userId._id,
                    name: ws.userId.name,
                    email: ws.userId.email,
                    picture: ws.userId.picture
                },
                createdAt: ws.createdAt
            }));

        // Compute per-user totals
        const now = Date.now();
        const FIVE_MINUTES_MS = 5 * 60 * 1000;

        const usersWithStats = usersList.map(u => {
            const lastActiveTime = u.lastActive ? new Date(u.lastActive).getTime() : 0;
            const isOnline = (now - lastActiveTime) < FIVE_MINUTES_MS;

            const userWordSetsCount = wordSets.filter(ws => ws.author.id.toString() === u._id.toString()).length;
            const userVideosCount = videoProgresses.filter(vp => vp.user.id.toString() === u._id.toString()).length;

            return {
                ...u,
                isOnline,
                userWordSetsCount,
                userVideosCount
            };
        });

        const activeUsersCount = usersWithStats.filter(u => u.isOnline).length;

        // 4. Summary response
        return res.json({
            summary: {
                totalUsers: usersList.length,
                activeUsersNow: activeUsersCount,
                totalDictationsStudied: videoProgresses.length,
                totalWordSets: wordSets.length
            },
            users: usersWithStats,
            videoProgresses,
            wordSets
        });
    } catch (err) {
        console.error("[admin] getAdminDashboardData error:", err);
        return res.status(500).json({ error: "Lỗi hệ thống khi tải dữ liệu Admin Dashboard." });
    }
};

/**
 * GET /api/admin/users/:userId/videos
 * Lấy danh sách video (DictationProgress) của một user cụ thể.
 */
export const getUserVideos = async (req, res) => {
    try {
        const { userId } = req.params;

        const rawProgresses = await DictationProgress.find({ userId })
            .sort({ updatedAt: -1 })
            .lean();

        if (rawProgresses.length === 0) {
            return res.json({ videos: [] });
        }

        // Map titles from YoutubeCache
        const videoIds = Array.from(new Set(rawProgresses.map(p => p.videoId)));
        const videoCaches = await YoutubeCache.find({ videoId: { $in: videoIds } })
            .select("videoId title total")
            .lean();

        const cacheMap = {};
        videoCaches.forEach(v => { cacheMap[v.videoId] = v; });

        const videos = rawProgresses.map(p => {
            const cache = cacheMap[p.videoId];
            const doneCount = Array.isArray(p.done) ? p.done.length : 0;
            const totalSentences = cache?.total || (p.idx ? p.idx + 1 : doneCount);
            const progressPercent = totalSentences > 0
                ? Math.min(100, Math.round((doneCount / totalSentences) * 100))
                : 0;

            return {
                id: p._id,
                videoId: p.videoId,
                videoTitle: cache?.title || `YouTube Video (${p.videoId})`,
                doneCount,
                totalSentences,
                progressPercent,
                stats: p.stats || { correct: 0, wrong: 0 },
                updatedAt: p.updatedAt
            };
        });

        return res.json({ videos });
    } catch (err) {
        console.error("[admin] getUserVideos error:", err);
        return res.status(500).json({ error: "Lỗi khi tải danh sách video của người dùng." });
    }
};

/**
 * GET /api/admin/videos
 * Lấy danh sách tất cả các video YouTube có trên hệ thống (YoutubeCache)
 * kèm số lượng người học và thông tin thống kê.
 */
export const getAllSystemVideos = async (req, res) => {
    try {
        const videos = await YoutubeCache.find()
            .sort({ createdAt: -1 })
            .lean();

        // Get learner count per videoId
        const progresses = await DictationProgress.find()
            .select("videoId userId done")
            .lean();

        const learnerCountMap = {};
        const totalDoneMap = {};

        progresses.forEach(p => {
            if (!p.videoId) return;
            if (!learnerCountMap[p.videoId]) learnerCountMap[p.videoId] = new Set();
            if (p.userId) learnerCountMap[p.videoId].add(p.userId.toString());

            const doneCount = Array.isArray(p.done) ? p.done.length : 0;
            totalDoneMap[p.videoId] = (totalDoneMap[p.videoId] || 0) + doneCount;
        });

        const videoList = videos.map(v => ({
            id: v._id,
            videoId: v.videoId,
            title: v.title || `YouTube Video (${v.videoId})`,
            url: v.url,
            totalSentences: v.total || (Array.isArray(v.exercises) ? v.exercises.length : 0),
            totalLearners: learnerCountMap[v.videoId] ? learnerCountMap[v.videoId].size : 0,
            totalDoneSentences: totalDoneMap[v.videoId] || 0,
            createdAt: v.createdAt,
            updatedAt: v.updatedAt
        }));

        return res.json({ videos: videoList });
    } catch (err) {
        console.error("[admin] getAllSystemVideos error:", err);
        return res.status(500).json({ error: "Lỗi khi tải danh sách video hệ thống." });
    }
};

/**
 * DELETE /api/admin/videos/:videoId
 * Xóa video khỏi thư viện hệ thống và xóa sạch toàn bộ lịch sử học, tiến trình của tất cả người dùng.
 * Bắt buộc chỉ trieutungvp@gmail.com được phép gọi API này.
 */
export const deleteSystemVideo = async (req, res) => {
    try {
        const { videoId } = req.params;
        const reqEmail = req.user?.email?.toLowerCase();

        if (reqEmail !== "trieutungvp@gmail.com") {
            return res.status(403).json({ error: "Chỉ tài khoản trieutungvp@gmail.com mới có quyền xóa video." });
        }

        if (!videoId) {
            return res.status(400).json({ error: "Thiếu tham số videoId." });
        }

        const isObjId = mongoose.isValidObjectId(videoId);
        const matchCondition = isObjId ? { $or: [{ videoId: videoId }, { _id: videoId }] } : { videoId: videoId };

        // Find actual target videoId string if ObjectId was passed
        let targetVideoId = videoId;
        if (isObjId) {
            const foundCache = await YoutubeCache.findOne(matchCondition).lean();
            if (foundCache) targetVideoId = foundCache.videoId;
        }

        // 1. Delete YoutubeCache entry
        const cacheResult = await YoutubeCache.deleteMany({
            $or: [{ videoId: targetVideoId }, { videoId: videoId }]
        });

        // 2. Delete all DictationProgress entries matching targetVideoId or videoId
        const progressResult = await DictationProgress.deleteMany({
            $or: [{ videoId: targetVideoId }, { videoId: videoId }]
        });

        // 3. Pull videoId from RecentVideos videoIds array across all users
        const recentResult = await RecentVideos.updateMany(
            { $or: [{ videoIds: targetVideoId }, { videoIds: videoId }] },
            { $pull: { videoIds: { $in: [targetVideoId, videoId] } } }
        );

        console.log(`[admin] Deleted video (${targetVideoId}): YoutubeCache=${cacheResult.deletedCount}, DictationProgress=${progressResult.deletedCount}, RecentVideos=${recentResult.modifiedCount}`);

        return res.json({
            success: true,
            message: `Đã xóa thành công video (${targetVideoId}) cùng toàn bộ tiến trình học của tất cả người dùng.`,
            deletedCacheCount: cacheResult.deletedCount,
            deletedProgressCount: progressResult.deletedCount,
            modifiedRecentCount: recentResult.modifiedCount
        });
    } catch (err) {
        console.error("[admin] deleteSystemVideo error:", err);
        return res.status(500).json({ error: "Lỗi khi xóa video khỏi hệ thống." });
    }
};

/**
 * GET /api/admin/backup/export
 * Export toàn bộ dữ liệu MongoDB ra file JSON để backup.
 * Chỉ admin (trieutungvp@gmail.com) mới được phép.
 */
export const exportDatabase = async (req, res) => {
    try {
        const reqEmail = req.user?.email?.toLowerCase();
        if (reqEmail !== "trieutungvp@gmail.com") {
            return res.status(403).json({ error: "Chỉ tài khoản trieutungvp@gmail.com mới có quyền export database." });
        }

        const [
            users,
            wordSets,
            words,
            dictationProgresses,
            recentVideos,
            youtubeCaches,
            folders,
            studyLogs,
            onlineLogs,
            books,
            bookProgresses,
            chatMessages,
            translationSessions,
            synonymWords,
            synonymProgresses,
            userCards,
        ] = await Promise.all([
            User.find().lean(),
            WordSet.find().lean(),
            Word.find().lean(),
            DictationProgress.find().lean(),
            RecentVideos.find().lean(),
            YoutubeCache.find().lean(),
            Folder.find().lean(),
            StudyLog.find().lean(),
            OnlineLog.find().lean(),
            Book.find().lean(),
            BookProgress.find().lean(),
            ChatMessage.find().lean(),
            TranslationSession.find().lean(),
            SynonymWord.find().lean(),
            SynonymProgress.find().lean(),
            UserCard.find().lean(),
        ]);

        const backup = {
            exportedAt: new Date().toISOString(),
            exportedBy: req.user.email,
            version: "1.0",
            collections: {
                users,
                wordSets,
                words,
                dictationProgresses,
                recentVideos,
                youtubeCaches,
                folders,
                studyLogs,
                onlineLogs,
                books,
                bookProgresses,
                chatMessages,
                translationSessions,
                synonymWords,
                synonymProgresses,
                userCards,
            }
        };

        const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
        const filename = `ielts_backup_${timestamp}.json`;

        res.setHeader("Content-Type", "application/json");
        res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
        res.json(backup);

        console.log(`[admin] Database exported by ${req.user.email} at ${new Date().toISOString()}`);
    } catch (err) {
        console.error("[admin] exportDatabase error:", err);
        return res.status(500).json({ error: "Lỗi khi export database." });
    }
};

/**
 * POST /api/admin/backup/import
 * Import dữ liệu từ file JSON backup vào MongoDB (upsert theo _id).
 * Chỉ admin (trieutungvp@gmail.com) mới được phép.
 */
export const importDatabase = async (req, res) => {
    try {
        const reqEmail = req.user?.email?.toLowerCase();
        if (reqEmail !== "trieutungvp@gmail.com") {
            return res.status(403).json({ error: "Chỉ tài khoản trieutungvp@gmail.com mới có quyền import database." });
        }

        if (!req.body || !req.body.collections) {
            return res.status(400).json({ error: "Dữ liệu backup không hợp lệ. Thiếu trường 'collections'." });
        }

        const { collections } = req.body;

        const MODEL_MAP = [
            { key: "users",                Model: User },
            { key: "wordSets",             Model: WordSet },
            { key: "words",                Model: Word },
            { key: "dictationProgresses",  Model: DictationProgress },
            { key: "recentVideos",         Model: RecentVideos },
            { key: "youtubeCaches",        Model: YoutubeCache },
            { key: "folders",             Model: Folder },
            { key: "studyLogs",            Model: StudyLog },
            { key: "onlineLogs",           Model: OnlineLog },
            { key: "books",                Model: Book },
            { key: "bookProgresses",       Model: BookProgress },
            { key: "chatMessages",         Model: ChatMessage },
            { key: "translationSessions",  Model: TranslationSession },
            { key: "synonymWords",         Model: SynonymWord },
            { key: "synonymProgresses",    Model: SynonymProgress },
            { key: "userCards",            Model: UserCard },
        ];

        const results = {};

        for (const { key, Model } of MODEL_MAP) {
            const docs = collections[key];
            if (!Array.isArray(docs) || docs.length === 0) {
                results[key] = { upserted: 0, skipped: true };
                continue;
            }

            const ops = docs.map(doc => ({
                updateOne: {
                    filter: { _id: doc._id },
                    update: { $set: doc },
                    upsert: true
                }
            }));

            const result = await Model.bulkWrite(ops, { ordered: false });
            results[key] = {
                upserted: (result.upsertedCount || 0) + (result.modifiedCount || 0),
                total: docs.length
            };
        }

        console.log(`[admin] Database imported by ${req.user.email} at ${new Date().toISOString()}`);

        return res.json({
            success: true,
            message: "Import database thành công!",
            importedAt: new Date().toISOString(),
            results
        });
    } catch (err) {
        console.error("[admin] importDatabase error:", err);
        return res.status(500).json({ error: "Lỗi khi import database: " + err.message });
    }
};
