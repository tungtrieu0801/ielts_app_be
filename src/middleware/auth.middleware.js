import jwt from "jsonwebtoken";

export const verifyToken = (req, res, next) => {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return res.status(401).json({ message: "Unauthorized: No token provided" });
    }

    const token = authHeader.split(" ")[1];

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        // decoded: { id (googleId), email, name,... }
        req.user = decoded;
        next();
    }
};

export const adminOnly = (req, res, next) => {
    if (!req.user || req.user.email?.toLowerCase() !== "tungvp@gmail.com") {
        return res.status(403).json({ message: "Access Denied: Only tungvp@gmail.com has access to this dashboard." });
    }
    next();
};

