import mongoose from "mongoose";

const synonymProgressSchema = new mongoose.Schema(
    {
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
            index: true,
        },
        // The cluster name (links to SynonymWord.cluster)
        cluster: {
            type: String,
            required: true,
            trim: true,
        },
        // Total number of attempts on this cluster
        totalAttempts: {
            type: Number,
            default: 0,
        },
        // Number of correct answers
        correctCount: {
            type: Number,
            default: 0,
        },
        // Number of wrong answers
        wrongCount: {
            type: Number,
            default: 0,
        },
        // Last time studied
        lastStudied: {
            type: Date,
            default: null,
        },
        // Mastery level: 0 = new, 1 = learning, 2 = familiar, 3 = mastered
        mastery: {
            type: Number,
            default: 0,
        },
    },
    {
        timestamps: true,
    }
);

// Unique compound: one progress record per user per cluster
synonymProgressSchema.index({ userId: 1, cluster: 1 }, { unique: true });
// For sorting: prioritize clusters with most wrong answers
synonymProgressSchema.index({ userId: 1, wrongCount: -1 });
synonymProgressSchema.index({ userId: 1, lastStudied: 1 });

const SynonymProgress = mongoose.model("SynonymProgress", synonymProgressSchema);

export default SynonymProgress;
