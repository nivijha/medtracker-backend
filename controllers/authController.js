import jwt from "jsonwebtoken";
import User from "../models/User.js";

const generateToken = (id) =>
  jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: "7d" });

/* ================= REGISTER ================= */
export const registerUser = async (req, res) => {
  try {
    const { name, email, phone, password } = req.body;

    if (!name || !email || !phone || !password) {
      return res.status(400).json({
        message: "Name, email, phone and password are required",
      });
    }

    const existingUser = await User.findOne({
      $or: [{ email }, { phone }],
    });

    if (existingUser) {
      return res.status(400).json({
        message:
          existingUser.email === email
            ? "Email already registered"
            : "Phone number already registered",
      });
    }

    const user = await User.create({ name, email, phone, password });
    const token = generateToken(user._id);

    res.status(201).json({
      message: "Registration successful",
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
      },
      token,
    });
  } catch (err) {
    res.status(500).json({ message: "Registration failed" });
  }
};

/* ================= LOGIN (EMAIL OR PHONE) ================= */
export const loginUser = async (req, res) => {
  try {
    const { email, phone, password } = req.body;

    if ((!email && !phone) || !password) {
      return res.status(400).json({
        message: "Email/Phone and password are required",
      });
    }

    const user = await User.findOne(email ? { email } : { phone });

    if (!user) {
      return res.status(404).json({
        message: email ? "Email not registered" : "Phone number not registered",
      });
    }

    const isMatch = await user.matchPassword(password);
    if (!isMatch) {
      return res.status(401).json({
        message: "Incorrect password",
      });
    }

    const token = generateToken(user._id);

    res.json({
      message: "Login successful",
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
      },
      token,
    });
  } catch (err) {
    res.status(500).json({ message: "Login failed" });
  }
};
