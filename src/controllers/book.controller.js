import Book from "../models/Book.js";
import BookProgress from "../models/BookProgress.js";
import Folder from "../models/Folder.js";
import WordSet from "../models/WordSet.js";
import User from "../models/User.js";

// Helper
const getUserMongoId = async (googleId) => {
    const user = await User.findOne({ googleId }).select("_id").lean();
    if (!user) throw new Error("User not found");
    return user;
};

// @desc    Upload a new book
// @route   POST /api/books/upload
// @access  Private
export const uploadBook = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ message: "Vui lòng chọn một file PDF" });
        }

        const title = req.body.title || req.file.originalname.replace(".pdf", "");
        const description = req.body.description || "";
        
        // file path will be like "uploads/books/filename.pdf"
        const fileUrl = `/uploads/books/${req.file.filename}`;
        const { _id: userId } = await getUserMongoId(req.user.id);

        const newBook = new Book({
            title,
            description,
            fileUrl,
            uploadedBy: userId,
        });

        await newBook.save();
        res.status(201).json(newBook);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Lỗi server khi upload sách" });
    }
};

// @desc    Get all books
// @route   GET /api/books
// @access  Private
export const getBooks = async (req, res) => {
    try {
        const books = await Book.find().sort({ createdAt: -1 });
        res.json(books);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Lỗi server khi tải danh sách sách" });
    }
};

// @desc    Get book details and initialize progress/wordset
// @route   GET /api/books/:id
// @access  Private
export const getBookDetails = async (req, res) => {
    try {
        const book = await Book.findById(req.params.id);
        if (!book) {
            return res.status(404).json({ message: "Không tìm thấy sách" });
        }

        const { _id: userId } = await getUserMongoId(req.user.id);

        // Ensure folder exists
        let folder = await Folder.findOne({ userId, name: "Từ vựng Đọc sách" });
        if (!folder) {
            folder = new Folder({
                name: "Từ vựng Đọc sách",
                description: "Thư mục tự động tạo để chứa các bộ từ vựng khi đọc sách",
                userId,
                color: "purple",
            });
            await folder.save();
        }

        // Ensure WordSet for this book exists
        let wordSet = await WordSet.findOne({ userId, folderId: folder._id, title: `Sách: ${book.title}` });
        if (!wordSet) {
            wordSet = new WordSet({
                title: `Sách: ${book.title}`,
                description: `Bộ từ vựng được tạo tự động khi đọc cuốn sách: ${book.title}`,
                userId,
                folderId: folder._id,
                color: "teal",
            });
            await wordSet.save();
        }

        // Get or initialize Progress
        let progress = await BookProgress.findOne({ userId, bookId: book._id });
        if (!progress) {
            progress = new BookProgress({
                userId,
                bookId: book._id,
                currentPage: 1,
                wordSetId: wordSet._id,
            });
            await progress.save();
        } else if (!progress.wordSetId || progress.wordSetId.toString() !== wordSet._id.toString()) {
            progress.wordSetId = wordSet._id;
            await progress.save();
        }

        res.json({ book, progress });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Lỗi server khi lấy chi tiết sách" });
    }
};

// @desc    Update book progress
// @route   POST /api/books/:id/progress
// @access  Private
export const updateProgress = async (req, res) => {
    try {
        const { currentPage } = req.body;
        const bookId = req.params.id;
        const { _id: userId } = await getUserMongoId(req.user.id);

        let progress = await BookProgress.findOne({ userId, bookId });
        if (!progress) {
            return res.status(404).json({ message: "Không tìm thấy tiến trình đọc" });
        }

        progress.currentPage = currentPage;
        progress.lastReadAt = Date.now();
        await progress.save();

        res.json(progress);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Lỗi server khi cập nhật tiến trình" });
    }
};
