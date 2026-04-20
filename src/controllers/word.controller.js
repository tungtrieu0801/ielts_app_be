import Word from "../models/Word.js";
import WordSet from "../models/WordSet.js";
import User from "../models/User.js";

const getUserMongoId = async (googleId) => {
    const user = await User.findOne({ googleId }).select("_id").lean();
    if (!user) throw new Error("User not found");
    return user._id;
};

// GET /wordsets/:setId/words
export const getWords = async (req, res) => {
    try {
        const userId = await getUserMongoId(req.user.id);
        const { setId } = req.params;
        const { page = 1, limit = 50 } = req.query;

        // Verify ownership
        const set = await WordSet.findOne({ _id: setId, userId }).lean();
        if (!set) return res.status(404).json({ message: "Word set not found" });

        const skip = (Number(page) - 1) * Number(limit);
        const [words, total] = await Promise.all([
            Word.find({ setId, userId }).sort({ createdAt: -1 }).skip(skip).limit(Number(limit)).lean(),
            Word.countDocuments({ setId, userId }),
        ]);

        res.json({ data: words, total, page: Number(page), limit: Number(limit) });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

// POST /wordsets/:setId/words — thêm 1 từ
export const createWord = async (req, res) => {
    try {
        const userId = await getUserMongoId(req.user.id);
        const { setId } = req.params;
        const { english, vietnamese, pronunciation, partOfSpeech, example, synonyms, antonyms } = req.body;

        if (!english?.trim() || !vietnamese?.trim()) {
            return res.status(400).json({ message: "English and Vietnamese are required" });
        }

        const set = await WordSet.findOne({ _id: setId, userId });
        if (!set) return res.status(404).json({ message: "Word set not found" });

        const word = await Word.create({
            english: english.trim(),
            vietnamese: vietnamese.trim(),
            pronunciation: pronunciation?.trim() || "",
            partOfSpeech: partOfSpeech?.trim() || "",
            level: req.body.level?.trim() || "",
            example: example?.trim() || "",
            exampleTranslation: req.body.exampleTranslation?.trim() || "",
            synonyms: Array.isArray(synonyms) ? synonyms : [],
            antonyms: Array.isArray(antonyms) ? antonyms : [],
            setId,
            userId,
        });

        // Increment wordCount
        await WordSet.findByIdAndUpdate(setId, { $inc: { wordCount: 1 } });

        res.status(201).json({ data: word });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

// POST /wordsets/:setId/words/bulk — import nhiều từ cùng lúc từ Excel
export const bulkCreateWords = async (req, res) => {
    try {
        const userId = await getUserMongoId(req.user.id);
        const { setId } = req.params;
        const { words } = req.body; // Array of { english, vietnamese, example, synonyms, antonyms }

        if (!Array.isArray(words) || words.length === 0) {
            return res.status(400).json({ message: "Words array is required and must not be empty" });
        }

        const set = await WordSet.findOne({ _id: setId, userId });
        if (!set) return res.status(404).json({ message: "Word set not found" });

        const validWords = words
            .filter(w => w.english?.trim() && w.vietnamese?.trim())
            .map(w => ({
                english: w.english.trim(),
                vietnamese: w.vietnamese.trim(),
                pronunciation: w.pronunciation?.trim() || "",
                partOfSpeech: w.partOfSpeech?.trim() || "",
                level: w.level?.trim() || "",
                example: w.example?.trim() || "",
                exampleTranslation: w.exampleTranslation?.trim() || "",
                synonyms: w.synonyms ? (Array.isArray(w.synonyms) ? w.synonyms : w.synonyms.split(",").map(s => s.trim())) : [],
                antonyms: w.antonyms ? (Array.isArray(w.antonyms) ? w.antonyms : w.antonyms.split(",").map(s => s.trim())) : [],
                setId,
                userId,
            }));

        if (validWords.length === 0) {
            return res.status(400).json({ message: "No valid words to import" });
        }

        const inserted = await Word.insertMany(validWords);

        // Update wordCount
        await WordSet.findByIdAndUpdate(setId, { $inc: { wordCount: inserted.length } });

        res.status(201).json({
            data: inserted,
            imported: inserted.length,
            skipped: words.length - validWords.length,
        });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

// PUT /wordsets/:setId/words/:id — sửa từ
export const updateWord = async (req, res) => {
    try {
        const userId = await getUserMongoId(req.user.id);
        const { id, setId } = req.params;

        const word = await Word.findOneAndUpdate(
            { _id: id, setId, userId },
            { ...req.body },
            { new: true, runValidators: true }
        );

        if (!word) return res.status(404).json({ message: "Word not found" });
        res.json({ data: word });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

// DELETE /wordsets/:setId/words/:id — xóa từ
export const deleteWord = async (req, res) => {
    try {
        const userId = await getUserMongoId(req.user.id);
        const { id, setId } = req.params;

        const word = await Word.findOneAndDelete({ _id: id, setId, userId });
        if (!word) return res.status(404).json({ message: "Word not found" });

        await WordSet.findByIdAndUpdate(setId, { $inc: { wordCount: -1 } });

        res.json({ message: "Deleted successfully" });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};
