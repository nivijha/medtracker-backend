import User from "../models/User.js";
import Appointment from "../models/Appointment.js";
import Medication from "../models/Medication.js";
import Report from "../models/Report.js";

/* ---------------- GET PROFILE ---------------- */
export const getProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select("-password");

    if (!user) return res.status(404).json({ message: "User not found" });

    res.json(user);
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch profile" });
  }
};

/* ---------------- UPDATE PROFILE ---------------- */
export const updateProfile = async (req, res) => {
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
    res.status(500).json({ message: "Profile update failed" });
  }
};


/* ---------------- HEALTH SUMMARY ---------------- */
export const getHealthSummary = async (req, res) => {
  try {
    const [appointments, medications, reports] = await Promise.all([
      Appointment.countDocuments({ userId: req.user.id }),
      Medication.countDocuments({
        userId: req.user.id,
        status: "active",
      }),
      Report.countDocuments({ userId: req.user.id }),
    ]);

    res.json({
      appointments,
      activeMedications: medications,
      reports,
      healthScore: Math.min(100, 60 + medications * 5), 
    });
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch summary" });
  }
};
export const changePassword = async (req, res) => {
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

    const user = await User.findById(req.user._id);

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
    console.error("Change password error:", error);
    res.status(500).json({
      message: "Failed to update password",
    });
  }
};
