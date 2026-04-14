import WordSet from "../models/WordSet.js";
import Word from "../models/Word.js";
import User from "../models/User.js";

// Helper: lấy MongoDB _id của user từ JWT payload (googleId)
const getUserMongoId = async (googleId) => {
    const user = await User.findOne({ googleId }).select("_id").lean();
    if (!user) throw new Error("User not found");
    return user._id;
};

// GET /wordsets — lấy tất cả bộ từ của user hiện tại
export const getWordSets = async (req, res) => {
    try {
        const userId = await getUserMongoId(req.user.id);
        const sets = await WordSet.find({ userId }).sort({ updatedAt: -1 }).lean();
        res.json({ data: sets });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

// POST /wordsets — tạo bộ từ mới
export const createWordSet = async (req, res) => {
    try {
        const userId = await getUserMongoId(req.user.id);
        const { title, description, color } = req.body;

        if (!title?.trim()) {
            return res.status(400).json({ message: "Title is required" });
        }

        const set = await WordSet.create({ title: title.trim(), description: description?.trim() || "", color: color || "blue", userId });
        res.status(201).json({ data: set });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

// PUT /wordsets/:id — cập nhật bộ từ
export const updateWordSet = async (req, res) => {
    try {
        const userId = await getUserMongoId(req.user.id);
        const { title, description, color } = req.body;

        const set = await WordSet.findOneAndUpdate(
            { _id: req.params.id, userId },
            { title, description, color },
            { new: true, runValidators: true }
        );

        if (!set) return res.status(404).json({ message: "Word set not found" });
        res.json({ data: set });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

// DELETE /wordsets/:id — xóa bộ từ và cascade xóa toàn bộ words
export const deleteWordSet = async (req, res) => {
    try {
        const userId = await getUserMongoId(req.user.id);

        const set = await WordSet.findOneAndDelete({ _id: req.params.id, userId });
        if (!set) return res.status(404).json({ message: "Word set not found" });

        // Cascade delete all words in this set
        await Word.deleteMany({ setId: req.params.id });

        res.json({ message: "Deleted successfully" });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};
