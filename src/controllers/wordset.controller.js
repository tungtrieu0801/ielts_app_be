import WordSet from "../models/WordSet.js";
import Word from "../models/Word.js";
import User from "../models/User.js";

// Helper: lấy MongoDB _id của user từ JWT payload (googleId)
const getUserMongoId = async (googleId) => {
    const user = await User.findOne({ googleId }).select("_id name picture").lean();
    if (!user) throw new Error("User not found");
    return user;
};

// GET /wordsets — lấy tất cả bộ từ của user hiện tại
export const getWordSets = async (req, res) => {
    try {
        const { _id: userId } = await getUserMongoId(req.user.id);
        const sets = await WordSet.find({ userId }).sort({ updatedAt: -1 }).lean();
        res.json({ data: sets });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

// GET /wordsets/public — bộ từ public của người dùng khác
export const getPublicSets = async (req, res) => {
    try {
        const { _id: userId } = await getUserMongoId(req.user.id);

        const sets = await WordSet.find({
            isPublic: true,
            userId: { $ne: userId },
        })
            .sort({ updatedAt: -1 })
            .limit(100)
            .lean();

        // Attach owner info
        const ownerIds = [...new Set(sets.map((s) => s.userId.toString()))];
        const owners = await User.find({ _id: { $in: ownerIds } })
            .select("_id name picture")
            .lean();
        const ownerMap = Object.fromEntries(owners.map((o) => [o._id.toString(), o]));

        const result = sets.map((s) => ({
            ...s,
            owner: ownerMap[s.userId.toString()] || null,
        }));

        res.json({ data: result });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

// POST /wordsets — tạo bộ từ mới
export const createWordSet = async (req, res) => {
    try {
        const { _id: userId } = await getUserMongoId(req.user.id);
        const { title, description, color, isPublic } = req.body;

        if (!title?.trim()) {
            return res.status(400).json({ message: "Title is required" });
        }

        const set = await WordSet.create({
            title: title.trim(),
            description: description?.trim() || "",
            color: color || "blue",
            isPublic: isPublic === true,
            userId,
        });
        res.status(201).json({ data: set });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

// PUT /wordsets/:id — cập nhật bộ từ
export const updateWordSet = async (req, res) => {
    try {
        const { _id: userId } = await getUserMongoId(req.user.id);
        const { title, description, color, isPublic } = req.body;

        const updateFields = { title, description, color };
        if (typeof isPublic === "boolean") updateFields.isPublic = isPublic;

        const set = await WordSet.findOneAndUpdate(
            { _id: req.params.id, userId },
            updateFields,
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
        const { _id: userId } = await getUserMongoId(req.user.id);

        const set = await WordSet.findOneAndDelete({ _id: req.params.id, userId });
        if (!set) return res.status(404).json({ message: "Word set not found" });

        // Cascade delete all words in this set
        await Word.deleteMany({ setId: req.params.id });

        res.json({ message: "Deleted successfully" });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

// POST /wordsets/:id/fork — copy bộ từ public về tài khoản của mình
export const forkWordSet = async (req, res) => {
    try {
        const { _id: userId } = await getUserMongoId(req.user.id);
        const sourceId = req.params.id;

        // Verify source set is public and not owned by current user
        const source = await WordSet.findOne({ _id: sourceId, isPublic: true }).lean();
        if (!source) {
            return res.status(404).json({ message: "Bộ từ không tồn tại hoặc không phải public." });
        }
        if (source.userId.toString() === userId.toString()) {
            return res.status(400).json({ message: "Đây là bộ từ của bạn, không cần fork." });
        }

        // Check if user already forked this set
        const alreadyForked = await WordSet.findOne({ userId, forkedFrom: sourceId }).lean();
        if (alreadyForked) {
            return res.json({
                data: alreadyForked,
                message: "Bạn đã fork bộ từ này trước đó.",
                alreadyForked: true,
            });
        }

        // Create new WordSet for user (private by default after fork)
        const newSet = await WordSet.create({
            title: source.title,
            description: source.description,
            color: source.color,
            isPublic: false,
            forkedFrom: source._id,
            wordCount: 0,
            userId,
        });

        // Copy all words from source set
        const sourceWords = await Word.find({ setId: sourceId }).lean();
        if (sourceWords.length > 0) {
            const wordCopies = sourceWords.map(({ _id, setId, userId: _uid, createdAt, updatedAt, __v, ...rest }) => ({
                ...rest,
                setId: newSet._id,
                userId,
                // Reset SRS fields
                level: 0,
                interval: 0,
                easeFactor: 2.5,
                repetition: 0,
                lastReviewed: null,
                nextReview: null,
            }));
            await Word.insertMany(wordCopies);

            // Update wordCount
            await WordSet.findByIdAndUpdate(newSet._id, { wordCount: sourceWords.length });
            newSet.wordCount = sourceWords.length;
        }

        res.status(201).json({
            data: { ...newSet.toObject(), wordCount: sourceWords.length },
            message: `Đã fork bộ từ "${source.title}" (${sourceWords.length} từ) về tài khoản của bạn!`,
        });
    } catch (err) {
        console.error("[wordset] forkWordSet error:", err);
        res.status(500).json({ message: err.message });
    }
};
