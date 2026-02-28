import User from "../models/User.js";
import Appointment from "../models/Appointment.js";
import Medication from "../models/Medication.js";
import Report from "../models/Report.js";

/**
 * @desc    Get user profile
 * @route   GET /api/profile
 * @access  Private
 */
export const getProfile = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id).select("-password");

    if (!user) return res.status(404).json({ message: "User not found" });

    res.json(user);
  } catch (err) {
    next(err);
  }
};

/**
 * @desc    Update user profile
 * @route   PUT /api/profile
 * @access  Private
 */
export const updateProfile = async (req, res, next) => {
  try {
    const { name, email, phone, address, profileImage } = req.body;

    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: "User not found" });

    user.name = name ?? user.name;
    user.email = email ?? user.email;
    user.phone = phone ?? user.phone;
    user.address = address ?? user.address;
    user.profileImage = profileImage ?? user.profileImage;

    await user.save();
    res.json(user);
  } catch (err) {
    next(err);
  }
};

/**
 * @desc    Get health summary statistics
 * @route   GET /api/profile/summary
 * @access  Private
 */
export const getHealthSummary = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id);

    const [appointments, medications, reports] = await Promise.all([
      Appointment.countDocuments({ user: req.user.id }),
      Medication.countDocuments({ user: req.user.id, status: "active" }),
      Report.countDocuments({ user: req.user.id }),
    ]);

    let score = 40;

    if (user.phone || user.address || user.profileImage) score += 10;
    if (reports > 0) score += 15;
    if (appointments > 0) score += 15;
    if (medications > 0) score += 10;

    score = Math.min(100, score);

    res.json({
      appointments,
      activeMedications: medications,
      reports,
      wellnessScore: score,
      scoreLabel:
        score >= 81
          ? "Highly Engaged"
          : score >= 61
          ? "Actively Managing"
          : score >= 41
          ? "On Track"
          : "Getting Started",
    });
  } catch (err) {
    next(err);
  }
};

/**
 * @desc    Change user password
 * @route   PUT /api/profile/change-password
 * @access  Private
 */
export const changePassword = async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        message: "Current password and new password are required",
      });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({
        message: "New password must be at least 6 characters long",
      });
    }

    const user = await User.findById(req.user.id);

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const isMatch = await user.matchPassword(currentPassword);
    if (!isMatch) {
      return res.status(401).json({
        message: "Current password is incorrect",
      });
    }

    const isSame = await user.matchPassword(newPassword);
    if (isSame) {
      return res.status(400).json({
        message: "New password must be different from current password",
      });
    }

    user.password = newPassword;
    await user.save();

    res.json({
      message: "Password updated successfully",
    });
  } catch (error) {
    next(error);
  }
};
