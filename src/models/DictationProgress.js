import mongoose from "mongoose";

const DictationProgressSchema = new mongoose.Schema(
    {
        userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
        videoId: { type: String, required: true },
        idx: { type: Number, default: 0 },
        done: { type: Array, default: [] },
        stats: {
            correct: { type: Number, default: 0 },
            wrong: { type: Number, default: 0 }
        },
        notes: { type: Array, default: [] }
    },
    { timestamps: true }
);

export default mongoose.models.DictationProgress || mongoose.model("DictationProgress", DictationProgressSchema);
