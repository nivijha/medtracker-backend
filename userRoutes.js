import express from "express";
import protect from "../middleware/authMiddleware.js";
import {
  updateUserPreferences,
  updateUserSecurity,
  deleteUserAccount,
} from "../controllers/userController.js";

const router = express.Router();

router.put("/preferences", protect, updateUserPreferences);
router.put("/security", protect, updateUserSecurity);
router.delete("/", protect, deleteUserAccount);

export default router;
