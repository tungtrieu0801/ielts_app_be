import mongoose from "mongoose";

const bookProgressSchema = new mongoose.Schema(
    {
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
            index: true,
        },
        bookId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Book",
            required: true,
            index: true,
        },
        currentPage: {
            type: Number,
            default: 1,
        },
        wordSetId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "WordSet",
            default: null,
        },
        lastReadAt: {
            type: Date,
            default: Date.now,
        },
    },
    {
        timestamps: true,
    }
);

// Each user can have only one progress per book
bookProgressSchema.index({ userId: 1, bookId: 1 }, { unique: true });

const BookProgress = mongoose.model("BookProgress", bookProgressSchema);

export default BookProgress;
