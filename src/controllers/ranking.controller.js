import OnlineLog from "../models/OnlineLog.js";
import User from "../models/User.js";

// Lấy ngày hiện tại theo UTC dạng YYYY-MM-DD
const todayUTC = () => new Date().toISOString().slice(0, 10);

/**
 * Gọi khi user connect socket.
 * Ghi nhận sessionStart cho hôm nay.
 */
export const markOnline = async (userId) => {
    const date = todayUTC();
    const log = await OnlineLog.findOne({ user: userId, date });

    if (log) {
        // Nếu đang có session cũ (refresh trang / reconnect socket),
        // cộng elapsed cũ vào totalSeconds trước khi đặt sessionStart mới
        if (log.sessionStart) {
            const elapsed = Math.floor((Date.now() - new Date(log.sessionStart).getTime()) / 1000);
            if (elapsed > 0 && elapsed < 86400) {
                log.totalSeconds += elapsed;
            }
        }
        log.sessionStart = new Date();
        await log.save();
    } else {
        await OnlineLog.create({ user: userId, date, sessionStart: new Date(), totalSeconds: 0 });
    }
};

/**
 * Gọi khi user disconnect socket.
 * Cộng dồn thời gian vào totalSeconds, xoá sessionStart.
 */
export const markOffline = async (userId) => {
    const date = todayUTC();
    const log = await OnlineLog.findOne({ user: userId, date });
    if (!log) return;

    if (log.sessionStart) {
        const elapsed = Math.floor((Date.now() - new Date(log.sessionStart).getTime()) / 1000);
        log.totalSeconds += Math.max(0, elapsed);
        log.sessionStart = null;
        await log.save();
    }
};

/**
 * GET /ranking?period=day|week|month
 * Trả về top 50 người dùng theo tổng thời gian online trong khoảng
 * cùng trạng thái online hiện tại.
 */
export const getRanking = async (req, res) => {
    try {
        const { period = "day" } = req.query;

        const now = new Date();
        let startDate;

        if (period === "day") {
            startDate = todayUTC();
        } else if (period === "week") {
            const d = new Date(now);
            d.setUTCDate(d.getUTCDate() - 6); // 7 ngày gần nhất
            startDate = d.toISOString().slice(0, 10);
        } else { // month
            const d = new Date(now);
            d.setUTCDate(d.getUTCDate() - 29); // 30 ngày gần nhất
            startDate = d.toISOString().slice(0, 10);
        }

        // Aggregate tổng totalSeconds theo user trong khoảng ngày
        const agg = await OnlineLog.aggregate([
            { $match: { date: { $gte: startDate } } },
            {
                $group: {
                    _id: "$user",
                    totalSeconds: { $sum: "$totalSeconds" },
                    // Nếu có sessionStart hôm nay thì user đang online → cộng thêm elapsed
                    sessionStart: {
                        $max: {
                            $cond: [{ $eq: ["$date", todayUTC()] }, "$sessionStart", null]
                        }
                    }
                }
            },
            { $sort: { totalSeconds: -1 } },
            { $limit: 50 },
            {
                $lookup: {
                    from: "users",
                    localField: "_id",
                    foreignField: "_id",
                    as: "user"
                }
            },
            { $unwind: "$user" },
            {
                $project: {
                    _id: 0,
                    userId: "$_id",
                    name: "$user.name",
                    picture: "$user.picture",
                    email: "$user.email",
                    totalSeconds: 1,
                    sessionStart: 1,
                }
            }
        ]);

        // Cộng thêm elapsed cho người đang có sessionStart (đang online)
        const nowMs = Date.now();
        let result = agg.map((r) => {
            let seconds = r.totalSeconds;
            let isOnline = false;
            if (r.sessionStart) {
                const elapsed = Math.floor((nowMs - new Date(r.sessionStart).getTime()) / 1000);
                if (elapsed >= 0 && elapsed < 86400) { // chỉ tính nếu hợp lệ (< 1 ngày)
                    seconds += elapsed;
                    isOnline = true;
                }
            }
            return {
                userId: r.userId,
                name: r.name,
                picture: r.picture,
                totalSeconds: seconds,
                isOnline,
            };
        });

        // Sắp xếp lại sau khi cộng dồn thời gian online hiện tại
        result.sort((a, b) => b.totalSeconds - a.totalSeconds);

        // Gán lại rank
        result = result.map((item, idx) => ({
            ...item,
            rank: idx + 1
        }));

        return res.json({ data: result, period });
    } catch (err) {
        console.error("[ranking] getRanking error:", err);
        return res.status(500).json({ error: "Lỗi tải bảng xếp hạng." });
    }
};
