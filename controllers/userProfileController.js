import User from "../models/User.js";
import Doctor from "../models/Doctor.js";
import Medication from "../models/Medication.js";
import Appointment from "../models/Appointment.js";
import HealthMetrics from "../models/HealthMetrics.js";

// @desc    Get user profile
// @route   GET /api/profile
// @access  Private
export const getUserProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user.id)
      .select("-password")
      .populate("profile.primaryCarePhysician", "firstName lastName specialty")
      .populate("providers.providerId", "firstName lastName specialty");

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Get additional data for profile
    const [activeMedications, upcomingAppointments, recentHealthMetrics] = await Promise.all([
      Medication.find({ userId: req.user.id, status: "active" }),
      Appointment.find({ 
        patientId: req.user.id, 
        date: { $gte: new Date() },
        status: { $in: ["scheduled", "confirmed"] }
      }).populate("doctorId", "firstName lastName specialty").limit(3),
      HealthMetrics.find({ userId: req.user.id })
        .sort({ date: -1 })
        .limit(5)
    ]);

    res.json({
      user,
      stats: {
        activeMedications: activeMedications.length,
        upcomingAppointments: upcomingAppointments.length,
        recentHealthMetrics: recentHealthMetrics.length,
      },
      recentData: {
        medications: activeMedications.slice(0, 3),
        appointments: upcomingAppointments,
        healthMetrics: recentHealthMetrics,
      }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server Error", error: error.message });
  }
};

// @desc    Update user profile
// @route   PUT /api/profile
// @access  Private
export const updateUserProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Extract profile data from request body
    const {
      profile,
      preferences,
      security,
      health,
    } = req.body;

    // Update profile fields
    if (profile) {
      Object.keys(profile).forEach(key => {
        if (user.profile[key] !== undefined) {
          user.profile[key] = profile[key];
        }
      });
    }

    // Update preferences
    if (preferences) {
      Object.keys(preferences).forEach(key => {
        if (user.preferences[key] !== undefined) {
          user.preferences[key] = preferences[key];
        }
      });
    }

    // Update security settings (with restrictions)
    if (security) {
      if (security.sessionTimeout !== undefined) {
        user.security.sessionTimeout = security.sessionTimeout;
      }
      // Note: Two-factor and password changes should be handled separately
    }

    // Update health information
    if (health) {
      Object.keys(health).forEach(key => {
        if (user.health[key] !== undefined) {
          user.health[key] = health[key];
        }
      });
    }

    await user.save();

    // Return updated user without password
    const updatedUser = await User.findById(req.user.id)
      .select("-password")
      .populate("profile.primaryCarePhysician", "firstName lastName specialty")
      .populate("providers.providerId", "firstName lastName specialty");

    res.json(updatedUser);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server Error", error: error.message });
  }
};

// @desc    Update user preferences
// @route   PUT /api/profile/preferences
// @access  Private
export const updatePreferences = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const { preferences } = req.body;

    if (preferences) {
      Object.keys(preferences).forEach(key => {
        if (user.preferences[key] !== undefined) {
          user.preferences[key] = preferences[key];
        }
      });
    }

    await user.save();

    res.json({ message: "Preferences updated successfully", preferences: user.preferences });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server Error", error: error.message });
  }
};

// @desc    Update security settings
// @route   PUT /api/profile/security
// @access  Private
export const updateSecuritySettings = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const { currentPassword, newPassword, sessionTimeout } = req.body;

    // If changing password, verify current password
    if (newPassword) {
      if (!currentPassword) {
        return res.status(400).json({ message: "Current password is required" });
      }

      const isMatch = await user.matchPassword(currentPassword);
      if (!isMatch) {
        return res.status(400).json({ message: "Current password is incorrect" });
      }

      // Update password (will be hashed by pre-save middleware)
      user.password = newPassword;
      user.security.lastPasswordChange = new Date();
    }

    // Update session timeout
    if (sessionTimeout !== undefined) {
      user.security.sessionTimeout = sessionTimeout;
    }

    await user.save();

    res.json({ message: "Security settings updated successfully" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server Error", error: error.message });
  }
};

// @desc    Add provider to user's profile
// @route   POST /api/profile/providers
// @access  Private
export const addProvider = async (req, res) => {
  try {
    const { providerId, relationship } = req.body;

    if (!providerId || !relationship) {
      return res.status(400).json({ message: "Provider ID and relationship are required" });
    }

    // Check if provider exists
    const provider = await Doctor.findById(providerId);
    if (!provider) {
      return res.status(404).json({ message: "Provider not found" });
    }

    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Check if provider is already added
    const existingProvider = user.providers.find(
      p => p.providerId.toString() === providerId
    );

    if (existingProvider) {
      return res.status(400).json({ message: "Provider already added" });
    }

    // Add provider
    user.providers.push({
      providerId,
      relationship,
      since: new Date(),
      status: "active",
    });

    await user.save();

    // Return updated user with providers populated
    const updatedUser = await User.findById(req.user.id)
      .select("-password")
      .populate("providers.providerId", "firstName lastName specialty");

    res.status(201).json({
      message: "Provider added successfully",
      user: updatedUser,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server Error", error: error.message });
  }
};

// @desc    Remove provider from user's profile
// @route   DELETE /api/profile/providers/:providerId
// @access  Private
export const removeProvider = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const providerId = req.params.providerId;

    // Remove provider
    user.providers = user.providers.filter(
      p => p.providerId.toString() !== providerId
    );

    await user.save();

    res.json({ message: "Provider removed successfully" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server Error", error: error.message });
  }
};

// @desc    Get user's health summary
// @route   GET /api/profile/health-summary
// @access  Private
export const getHealthSummary = async (req, res) => {
  try {
    const userId = req.user.id;
    const days = parseInt(req.query.days) || 30;

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    // Get data for the specified period
    const [medications, appointments, healthMetrics] = await Promise.all([
      Medication.find({ userId }),
      Appointment.find({ 
        patientId: userId,
        date: { $gte: startDate }
      }),
      HealthMetrics.find({ 
        userId,
        date: { $gte: startDate }
      })
    ]);

    // Calculate summary statistics
    const activeMeds = medications.filter(m => m.status === "active").length;
    const upcomingAppts = appointments.filter(a => 
      a.date >= new Date() && ["scheduled", "confirmed"].includes(a.status)
    ).length;
    const completedAppts = appointments.filter(a => a.status === "completed").length;

    // Health metrics summary
    const bpReadings = healthMetrics.filter(m => m.bloodPressure?.systolic);
    const avgBP = bpReadings.length > 0 ? {
      systolic: Math.round(bpReadings.reduce((sum, m) => sum + m.bloodPressure.systolic, 0) / bpReadings.length),
      diastolic: Math.round(bpReadings.reduce((sum, m) => sum + m.bloodPressure.diastolic, 0) / bpReadings.length),
    } : null;

    const weightReadings = healthMetrics.filter(m => m.weight?.value);
    const avgWeight = weightReadings.length > 0 ? 
      Math.round(weightReadings.reduce((sum, m) => sum + m.weight.value, 0) / weightReadings.length * 100) / 100 : null;

    res.json({
      period: `Last ${days} days`,
      summary: {
        medications: {
          active: activeMeds,
          total: medications.length,
        },
        appointments: {
          upcoming: upcomingAppts,
          completed: completedAppts,
          total: appointments.length,
        },
        healthMetrics: {
          totalReadings: healthMetrics.length,
          averageBloodPressure: avgBP,
          averageWeight: avgWeight,
        },
      },
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server Error", error: error.message });
  }
};

// @desc    Delete user account
// @route   DELETE /api/profile
// @access  Private
export const deleteAccount = async (req, res) => {
  try {
    const { password, confirmation } = req.body;

    if (!password || !confirmation) {
      return res.status(400).json({ 
        message: "Password and confirmation are required" 
      });
    }

    if (confirmation !== "DELETE") {
      return res.status(400).json({ 
        message: "Confirmation must be 'DELETE'" 
      });
    }

    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Verify password
    const isMatch = await user.matchPassword(password);
    if (!isMatch) {
      return res.status(400).json({ message: "Password is incorrect" });
    }

    // Delete user's data
    await Promise.all([
      Medication.deleteMany({ userId: req.user.id }),
      Appointment.deleteMany({ patientId: req.user.id }),
      HealthMetrics.deleteMany({ userId: req.user.id }),
      User.findByIdAndDelete(req.user.id),
    ]);

    res.json({ message: "Account deleted successfully" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server Error", error: error.message });
  }
};