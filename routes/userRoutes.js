import express from "express";
import protect from "../middleware/authMiddleware.js";
import {
  updateUserPreferences,
  updateUserSecurity,
  deleteUserAccount,
  changePassword,
  exportUserData,
  getUserSettings,
} from "../controllers/userController.js";

const router = express.Router();

router.get("/settings", protect, getUserSettings);
router.put("/preferences", protect, updateUserPreferences);
router.put("/security", protect, updateUserSecurity);
router.put("/password", protect, changePassword);
router.get("/export", protect, exportUserData);
router.delete("/", protect, deleteUserAccount);

export default router;
