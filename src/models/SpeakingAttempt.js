import mongoose from "mongoose";

const speakingAttemptSchema = new mongoose.Schema(
    {
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
            index: true,
        },
        topicId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "SpeakingTopic",
            required: true,
        },
        draftText: {
            type: String,
            required: true,
        },
        timeSpentSeconds: {
            type: Number,
            required: true,
            min: 0,
        },
        submittedAt: {
            type: Date,
            default: Date.now,
        },
    },
    {
        timestamps: true,
    }
);

// Compound index for user attempts history querying
speakingAttemptSchema.index({ userId: 1, submittedAt: -1 });

const SpeakingAttempt = mongoose.models.SpeakingAttempt || mongoose.model("SpeakingAttempt", speakingAttemptSchema);

export default SpeakingAttempt;
