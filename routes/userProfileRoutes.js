import express from "express";
import {
  getUserProfile,
  updateUserProfile,
  updatePreferences,
  updateSecuritySettings,
  addProvider,
  removeProvider,
  getHealthSummary,
  deleteAccount,
} from "../controllers/userProfileController.js";
import protect from "../middleware/authMiddleware.js";

const router = express.Router();

// All user profile routes are protected
router.use(protect);

// @route   GET /api/profile
// @desc    Get user profile
// @access  Private
router.get("/", getUserProfile);

// @route   PUT /api/profile
// @desc    Update user profile
// @access  Private
router.put("/", updateUserProfile);

// @route   PUT /api/profile/preferences
// @desc    Update user preferences
// @access  Private
router.put("/preferences", updatePreferences);

// @route   PUT /api/profile/security
// @desc    Update security settings
// @access  Private
router.put("/security", updateSecuritySettings);

// @route   GET /api/profile/health-summary
// @desc    Get user's health summary
// @access  Private
router.get("/health-summary", getHealthSummary);

// @route   POST /api/profile/providers
// @desc    Add provider to user's profile
// @access  Private
router.post("/providers", addProvider);

// @route   DELETE /api/profile/providers/:providerId
// @desc    Remove provider from user's profile
// @access  Private
router.delete("/providers/:providerId", removeProvider);

// @route   DELETE /api/profile
// @desc    Delete user account
// @access  Private
router.delete("/", deleteAccount);

export default router;