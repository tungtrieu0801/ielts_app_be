import mongoose from "mongoose";

const studyLogSchema = new mongoose.Schema(
    {
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },
        // Ngày học — lưu ở dạng chỉ ngày (giờ = 00:00:00 UTC)
        date: {
            type: Date,
            required: true,
        },
        // Tổng số từ đã ôn trong ngày
        wordsReviewed: {
            type: Number,
            default: 0,
        },
        // Tổng thời gian học (phút) — tính gần đúng: mỗi lần submit = 0.5 phút
        minutesStudied: {
            type: Number,
            default: 0,
        },
    },
    {
        timestamps: true,
    }
);

// Mỗi user chỉ có 1 bản ghi per ngày
studyLogSchema.index({ userId: 1, date: 1 }, { unique: true });

const StudyLog = mongoose.model("StudyLog", studyLogSchema);

export default StudyLog;
