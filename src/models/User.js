import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
    {
        // ID duy nhất từ Google trả về để định danh user
        googleId: {
            type: String,
            required: true,
            unique: true,
            index: true, // Đánh index để tìm kiếm (login) nhanh hơn
        },
        // Email từ Google
        email: {
            type: String,
            required: true,
            unique: true,
            lowercase: true,
            trim: true,
        },
        // Tên hiển thị (displayName)
        name: {
            type: String,
            required: true,
        },
        // URL ảnh đại diện
        picture: {
            type: String,
        },
        // Phân quyền (mặc định là user, có thể thêm admin sau này)
        role: {
            type: String,
            enum: ["user", "admin"],
            default: "user",
        },
        // Trạng thái tài khoản (dùng để khóa tài khoản nếu cần)
        isActive: {
            type: Boolean,
            default: true,
        },
        // Lưu lần cuối đăng nhập để theo dõi hoạt động
        lastLogin: {
            type: Date,
            default: Date.now,
        },
        currentStreak: {
            type: Number,
            default: 0,
            index: true,
        },
        longestStreak: {
            type: Number,
            default: 0,
        },
    },
    {
        // Tự động tạo trường createdAt (ngày tham gia) và updatedAt (ngày cập nhật)
        timestamps: true,
    }
);

const User = mongoose.model("User", userSchema);

export default User;