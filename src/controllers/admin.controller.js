import User from "../models/User.js";
import DictationProgress from "../models/DictationProgress.js";
import YoutubeCache from "../models/YoutubeCache.js";
import WordSet from "../models/WordSet.js";

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
