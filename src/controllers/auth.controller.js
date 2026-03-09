import { handleGoogleLogin } from "../services/auth.service.js";

export const googleCallback = (req, res) => {

    const user = req.user;

    const { token } = handleGoogleLogin(user);

    const redirectUrl =
        `${process.env.FRONTEND_URL}/oauth-success?token=${token}`;

    res.redirect(redirectUrl);

};