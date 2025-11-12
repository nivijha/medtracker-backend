import express from "express";
import {
  getNotifications,
  getNotificationById,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  deleteNotification,
  createMedicationReminders,
  createAppointmentReminders,
  createRefillReminders,
  sendTestNotification,
} from "../controllers/notificationController.js";
import protect from "../middleware/authMiddleware.js";

const router = express.Router();

// All notification routes are protected
router.use(protect);

// @route   GET /api/notifications
// @desc    Get all notifications for a user
// @access  Private
router.get("/", getNotifications);

// @route   GET /api/notifications/:id
// @desc    Get single notification
// @access  Private
router.get("/:id", getNotificationById);

// @route   PUT /api/notifications/:id/read
// @desc    Mark notification as read
// @access  Private
router.put("/:id/read", markNotificationAsRead);

// @route   PUT /api/notifications/read-all
// @desc    Mark all notifications as read
// @access  Private
router.put("/read-all", markAllNotificationsAsRead);

// @route   DELETE /api/notifications/:id
// @desc    Delete a notification
// @access  Private
router.delete("/:id", deleteNotification);

// @route   POST /api/notifications/medication-reminders
// @desc    Create medication reminders
// @access  Private
router.post("/medication-reminders", createMedicationReminders);

// @route   POST /api/notifications/appointment-reminders
// @desc    Create appointment reminders
// @access  Private
router.post("/appointment-reminders", createAppointmentReminders);

// @route   POST /api/notifications/refill-reminders
// @desc    Create refill reminders
// @access  Private
router.post("/refill-reminders", createRefillReminders);

// @route   POST /api/notifications/test
// @desc    Send test notification
// @access  Private
router.post("/test", sendTestNotification);

export default router;