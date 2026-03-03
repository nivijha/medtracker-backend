import { registerUserService, loginUserService, forgotPasswordService, resetPasswordService } from "../services/authService.js";
import { validationResult } from "express-validator";
import sendEmail from "../utils/sendEmail.js";

/**
 * @desc    Send token in cookie and response
 * @param   {object} res - Response object
 * @param   {object} user - User object
 * @param   {string} token - JWT Token
 * @param   {string} message - Success message
 */
const sendToken = (res, user, token, message) => {
  const isProduction = process.env.NODE_ENV === "production";
  
  res.cookie("token", token, {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? "none" : "lax",
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });

  res.status(201).json({
    message,
    user: {
      id: user._id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      profileImage: user.profileImage || "",
    },
    token, // Keeping for backward compatibility if needed, but cookie is primary
  });
};

/**
 * @desc    Register a new user
 * @route   POST /api/auth/register
 * @access  Public
 */
export const registerUser = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { name, email, phone, password } = req.body;
    const { user, token } = await registerUserService({ name, email, phone, password });

    sendToken(res, user, token, "Registration successful");
  } catch (err) {
    next(err);
  }
};

/**
 * @desc    Login user
 * @route   POST /api/auth/login
 * @access  Public
 */
export const loginUser = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { email, password } = req.body;
    const { user, token } = await loginUserService({ email, password });

    sendToken(res, user, token, "Login successful");
  } catch (err) {
    if (err.message === "Invalid credentials") {
      return res.status(401).json({ message: "Invalid credentials" });
    }
    next(err);
  }
};

/**
 * @desc    Get current user profile
 * @route   GET /api/auth/me
 * @access  Private
 */
export const getUserProfile = async (req, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: "Not authorized" });
    }
    res.json(req.user);
  } catch (err) {
    next(err);
  }
};

/**
 * @desc    Logout user / clear cookie
 * @route   POST /api/auth/logout
 * @access  Private
 */
export const logoutUser = (req, res) => {
  const isProduction = process.env.NODE_ENV === "production";
  res.cookie("token", "", {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? "none" : "lax",
    expires: new Date(0),
  });
  res.status(200).json({ message: "Logged out successfully" });
};

/**
 * @desc    Forgot Password
 * @route   POST /api/auth/forgotpassword
 * @access  Public
 */
export const forgotPassword = async (req, res, next) => {
  try {
    const { email } = req.body;
    let serviceResult;
    try {
      serviceResult = await forgotPasswordService(email);
    } catch (error) {
      return res.status(404).json({ message: error.message });
    }

    const { user, resetToken } = serviceResult;

    // Create reset URL (Client-facing URL)
    const clientUrl = process.env.CLIENT_URL || "http://localhost:3000";
    const resetUrl = `${clientUrl}/resetpassword/${resetToken}`;

    const message = `You are receiving this email because you (or someone else) requested a password reset. Please click on the following link, or paste this into your browser to complete the process:\n\n${resetUrl}`;

    try {
      await sendEmail({
        email: user.email,
        subject: "Password Reset Token",
        message,
      });

      res.status(200).json({ success: true, message: "Email sent" });
    } catch (err) {
      user.resetPasswordToken = undefined;
      user.resetPasswordExpire = undefined;
      await user.save({ validateBeforeSave: false });

      console.error("Email send error:", err);
      return res.status(500).json({ message: "Email could not be sent" });
    }
  } catch (err) {
    next(err);
  }
};

/**
 * @desc    Reset Password
 * @route   PUT /api/auth/resetpassword/:resettoken
 * @access  Public
 */
export const resetPassword = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { password } = req.body;
    let serviceResult;
    try {
      serviceResult = await resetPasswordService(req.params.resettoken, password);
    } catch (error) {
      return res.status(400).json({ message: error.message });
    }

    const { user, token } = serviceResult;

    sendToken(res, user, token, "Password reset successful");
  } catch (err) {
    next(err);
  }
};
