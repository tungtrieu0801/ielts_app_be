import jwt from "jsonwebtoken";

export const generateToken = (user) => {
    return jwt.sign(
        {
            id: user.googleId,
            email: user.email,
            name: user.name
        },
        process.env.JWT_SECRET,
        { expiresIn: "7d" }
    );
};