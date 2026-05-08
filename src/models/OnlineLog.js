import mongoose from "mongoose";

// Mỗi document = 1 user x 1 ngày
const onlineLogSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true,
        index: true,
    },
    // Ngày theo dạng YYYY-MM-DD (UTC) để dễ query
    date: {
        type: String,
        required: true,
        index: true,
    },
    // Tổng số giây online trong ngày
    totalSeconds: {
        type: Number,
        default: 0,
    },
    // Timestamp session đang mở (null nếu offline)
    sessionStart: {
        type: Date,
        default: null,
    },
}, { timestamps: true });

// Unique per user per day
onlineLogSchema.index({ user: 1, date: 1 }, { unique: true });

const OnlineLog = mongoose.model("OnlineLog", onlineLogSchema);
export default OnlineLog;
