import Folder from "../models/Folder.js";
import WordSet from "../models/WordSet.js";
import User from "../models/User.js";

const getUserMongoId = async (googleId) => {
    const user = await User.findOne({ googleId }).select("_id").lean();
    if (!user) throw new Error("User not found");
    return user._id;
};

// GET /folders — Lấy danh sách thư mục của user
export const getFolders = async (req, res) => {
    try {
        const userId = await getUserMongoId(req.user.id);
        const folders = await Folder.find({ userId }).sort({ createdAt: -1 }).lean();

        // Get set count for each folder
        const foldersWithCount = await Promise.all(folders.map(async (f) => {
            const setCount = await WordSet.countDocuments({ folderId: f._id, userId });
            return { ...f, setCount };
        }));

        res.json({ data: foldersWithCount });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

// POST /folders — Tạo thư mục mới
export const createFolder = async (req, res) => {
    try {
        const userId = await getUserMongoId(req.user.id);
        const { name, description, color } = req.body;

        if (!name?.trim()) {
            return res.status(400).json({ message: "Name is required" });
        }

        const folder = await Folder.create({
            name: name.trim(),
            description: description?.trim() || "",
            color: color || "purple",
            userId,
        });
        res.status(201).json({ data: folder });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

// PUT /folders/:id — Cập nhật thư mục
export const updateFolder = async (req, res) => {
    try {
        const userId = await getUserMongoId(req.user.id);
        const { name, description, color } = req.body;

        const folder = await Folder.findOneAndUpdate(
            { _id: req.params.id, userId },
            { name, description, color },
            { new: true, runValidators: true }
        );

        if (!folder) return res.status(404).json({ message: "Folder not found" });
        res.json({ data: folder });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

// DELETE /folders/:id — Xóa thư mục (Các bộ từ bên trong sẽ được đưa ra ngoài Root)
export const deleteFolder = async (req, res) => {
    try {
        const userId = await getUserMongoId(req.user.id);

        const folder = await Folder.findOneAndDelete({ _id: req.params.id, userId });
        if (!folder) return res.status(404).json({ message: "Folder not found" });

        // Move all sets in this folder to root
        await WordSet.updateMany({ folderId: req.params.id, userId }, { folderId: null });

        res.json({ message: "Deleted folder successfully, sets moved to root" });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};
