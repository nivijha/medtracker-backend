import jwt from "jsonwebtoken";
import crypto from "crypto";
import User from "../models/User.js";

const generateToken = (id) =>
  jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRE || "7d" });

export const registerUserService = async ({ name, email, phone, password }) => {
  const existing = await User.findOne({ email });
  if (existing) {
    throw new Error("User already exists");
  }

  const user = await User.create({
    name,
    email,
    phone,
    password,
  });

  const token = generateToken(user._id);
  return { user, token };
};

export const loginUserService = async ({ email, password }) => {
  const user = await User.findOne({ email });
  if (!user) {
    throw new Error("Invalid credentials");
  }

  const isMatch = await user.matchPassword(password);
  if (!isMatch) {
    throw new Error("Invalid credentials");
  }

  const token = generateToken(user._id);
  return { user, token };
};

export const forgotPasswordService = async (email) => {
  const user = await User.findOne({ email });
  if (!user) {
    throw new Error("There is no user with that email");
  }

  // Get reset token
  const resetToken = user.getResetPasswordToken();

  await user.save({ validateBeforeSave: false });

  return { user, resetToken };
};

export const resetPasswordService = async (resetToken, newPassword) => {
  // Get hashed token
  const resetPasswordToken = crypto
    .createHash("sha256")
    .update(resetToken)
    .digest("hex");

  const user = await User.findOne({
    resetPasswordToken,
    resetPasswordExpire: { $gt: Date.now() },
  });

  if (!user) {
    throw new Error("Invalid or expired token");
  }

  // Set new password
  user.password = newPassword;
  user.resetPasswordToken = undefined;
  user.resetPasswordExpire = undefined;

  await user.save();

  const token = generateToken(user._id);
  return { user, token };
};
