import mongoose from "mongoose";

const userCardSchema = new mongoose.Schema(
    {
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
            index: true,
        },
        wordId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Word",
            required: true,
        },

        // "NEW" | "LEARNING" | "REVIEW"
        status: {
            type: String,
            enum: ["NEW", "LEARNING", "REVIEW"],
            default: "NEW",
        },

        // SRS 5-level
        level: { type: Number, default: 0, min: 0, max: 5 },
        easeFactor: { type: Number, default: 2.5 },
        interval: { type: Number, default: 0 }, // days
        repetition: { type: Number, default: 0 },

        lastReviewed: { type: Date, default: null },
        nextReview: { type: Date, default: null }, // null = NEW, never scheduled yet
    },
    { timestamps: true }
);

// Prevent duplicate (userId, wordId) pairs
userCardSchema.index({ userId: 1, wordId: 1 }, { unique: true });
// Fast querying for due cards
userCardSchema.index({ userId: 1, nextReview: 1, status: 1 });

const UserCard = mongoose.model("UserCard", userCardSchema);
export default UserCard;
