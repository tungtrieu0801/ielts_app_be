import mongoose from "mongoose";

/**
 * YoutubeCache — lưu kết quả đã xử lý cho một video YouTube.
 * Mục đích: Tránh spam YouTube API, chia sẻ thư viện video cho mọi user.
 */
const youtubeCacheSchema = new mongoose.Schema(
    {
        videoId: {
            type: String,
            required: true,
            unique: true,
            index: true,
            trim: true,
        },
        url: {
            type: String,
            required: true,
            trim: true,
        },
        // Tiêu đề video (lấy từ YouTube oEmbed API nếu được, không thì để "YouTube Video")
        title: {
            type: String,
            default: "YouTube Video",
            trim: true,
        },
        // Toàn bộ danh sách câu đã xử lý: [{ original, start, end, mode }]
        exercises: {
            type: mongoose.Schema.Types.Mixed,
            required: true,
        },
        total: {
            type: Number,
            required: true,
        },
    },
    {
        timestamps: true, // createdAt, updatedAt
    }
);

// Index phụ để sort danh sách thư viện theo thời gian mới nhất
youtubeCacheSchema.index({ createdAt: -1 });

const YoutubeCache = mongoose.model("YoutubeCache", youtubeCacheSchema);

export default YoutubeCache;
