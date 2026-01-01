import User from "../models/User.js";

export const registerUser = async (req, res) => {
  try {
    const { name, email, password, role } = req.body;
    const user = await User.create({ name, email, password, role });
    res.status(201).json(user);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

export const updateUserPreferences = async (req, res) => {
  try {
    const { notifications, privacy, appearance } = req.body;

    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    user.preferences = {
      notifications,
      privacy,
      appearance,
    };

    await user.save();

    res.json({
      message: "Preferences updated successfully",
      preferences: user.preferences,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to update preferences" });
  }
};

export const updateUserSecurity = async (req, res) => {
  try {
    const { currentPassword, newPassword, twoFactor } = req.body;

    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    if (currentPassword && newPassword) {
      const isMatch = await bcrypt.compare(currentPassword, user.password);
      if (!isMatch) {
        return res.status(400).json({ message: "Current password incorrect" });
      }

      user.password = newPassword; 
    }

    if (typeof twoFactor === "boolean") {
      user.preferences.privacy.twoFactor = twoFactor;
    }

    await user.save();
    res.json({ message: "Security settings updated" });
  } catch (err) {
    res.status(500).json({ message: "Failed to update security settings" });
  }
};

export const deleteUserAccount = async (req, res) => {
  try {
    await User.findByIdAndDelete(req.user._id);
    res.json({ message: "Account deleted successfully" });
  } catch (err) {
    res.status(500).json({ message: "Failed to delete account" });
  }
};

export const changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ message: "All fields required" });
    }

    const user = await User.findById(req.user._id);

    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) {
      return res.status(401).json({ message: "Current password incorrect" });
    }

    user.password = newPassword; // hashed by pre-save hook
    await user.save();

    res.json({ message: "Password updated successfully" });
  } catch (err) {
    res.status(500).json({ message: "Failed to update password" });
  }
};

export const exportUserData = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select("-password");

    const exportData = {
      profile: user,
      exportedAt: new Date().toISOString(),
    };

    res.json(exportData);
  } catch (err) {
    res.status(500).json({ message: "Failed to export data" });
  }
};
    
export const getUserSettings = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select("preferences");
    res.json(user.preferences);
  } catch (err) {
    res.status(500).json({ message: "Failed to load settings" });
  }
};
