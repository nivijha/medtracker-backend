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
    const updates = {
      name: req.body.name,
      phone: req.body.phone,
      address: req.body.address,
      dateOfBirth: req.body.dateOfBirth,
      bloodType: req.body.bloodType,
      emergencyContact: req.body.emergencyContact,
    };

    const user = await User.findByIdAndUpdate(
      req.user.id,
      updates,
      { new: true, runValidators: true }
    ).select("-password");

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
      healthScore: Math.min(100, 60 + medications * 5), // simple logic
    });
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch summary" });
  }
};
