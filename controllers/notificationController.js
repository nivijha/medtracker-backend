import User from "../models/User.js";
import Medication from "../models/Medication.js";
import Appointment from "../models/Appointment.js";
import Prescription from "../models/Prescription.js";
import mongoose from "mongoose";

// @desc    Get all notifications for a user
// @route   GET /api/notifications
// @access  Private
export const getNotifications = async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 10, 
      type, 
      read = false 
    } = req.query;
    const userId = req.user.id;

    // Build query
    const query = { userId, read };
    
    if (type && type !== "all") {
      query.type = type;
    }

    // Execute query with pagination
    const notifications = await Notification.find(query)
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    // Get total count for pagination
    const total = await Notification.countDocuments(query);

    res.json({
      notifications,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server Error", error: error.message });
  }
};

// @desc    Get single notification
// @route   GET /api/notifications/:id
// @access  Private
export const getNotificationById = async (req, res) => {
  try {
    const notification = await Notification.findById(req.params.id);

    if (!notification) {
      return res.status(404).json({ message: "Notification not found" });
    }

    // Check if notification belongs to user
    if (notification.userId.toString() !== req.user.id) {
      return res.status(401).json({ message: "Not authorized" });
    }

    res.json(notification);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server Error", error: error.message });
  }
};

// @desc    Mark notification as read
// @route   PUT /api/notifications/:id/read
// @access  Private
export const markNotificationAsRead = async (req, res) => {
  try {
    const notification = await Notification.findById(req.params.id);

    if (!notification) {
      return res.status(404).json({ message: "Notification not found" });
    }

    // Check if notification belongs to user
    if (notification.userId.toString() !== req.user.id) {
      return res.status(401).json({ message: "Not authorized" });
    }

    notification.read = true;
    await notification.save();

    res.json({ message: "Notification marked as read", notification });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server Error", error: error.message });
  }
};

// @desc    Mark all notifications as read
// @route   PUT /api/notifications/read-all
// @access  Private
export const markAllNotificationsAsRead = async (req, res) => {
  try {
    const userId = req.user.id;

    await Notification.updateMany(
      { userId, read: false },
      { read: true }
    );

    res.json({ message: "All notifications marked as read" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server Error", error: error.message });
  }
};

// @desc    Delete a notification
// @route   DELETE /api/notifications/:id
// @access  Private
export const deleteNotification = async (req, res) => {
  try {
    const notification = await Notification.findById(req.params.id);

    if (!notification) {
      return res.status(404).json({ message: "Notification not found" });
    }

    // Check if notification belongs to user
    if (notification.userId.toString() !== req.user.id) {
      return res.status(401).json({ message: "Not authorized" });
    }

    await notification.remove();

    res.json({ message: "Notification deleted" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server Error", error: error.message });
  }
};

// @desc    Create medication reminders
// @route   POST /api/notifications/medication-reminders
// @access  Private
export const createMedicationReminders = async (req, res) => {
  try {
    const { medicationIds, times, days = 30 } = req.body;
    const userId = req.user.id;

    if (!medicationIds || medicationIds.length === 0) {
      return res.status(400).json({ message: "Medication IDs are required" });
    }

    // Get medications
    const medications = await Medication.find({
      _id: { $in: medicationIds },
      userId,
      status: "active",
    });

    if (medications.length !== medicationIds.length) {
      return res.status(404).json({ message: "One or more medications not found" });
    }

    // Create notifications for each medication
    const notifications = [];
    const now = new Date();

    for (const medication of medications) {
      for (const time of times) {
        // Calculate next reminder date
        const nextReminder = new Date(now);
        nextReminder.setDate(now.getDate() + days);
        nextReminder.setHours(parseInt(time.split(":")[0]));
        nextReminder.setMinutes(parseInt(time.split(":")[1]));

        notifications.push({
          userId,
          type: "medication_reminder",
          title: `Medication Reminder: ${medication.name}`,
          message: `It's time to take your ${medication.name} (${medication.dosage})`,
          scheduledFor: nextReminder,
          read: false,
          data: {
            medicationId: medication._id,
            medicationName: medication.name,
            dosage: medication.dosage,
            time,
          },
        });
      }
    }

    // Create notifications in database
    const createdNotifications = await Notification.insertMany(notifications);

    res.status(201).json({
      message: "Medication reminders created",
      notifications: createdNotifications,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server Error", error: error.message });
  }
};

// @desc    Create appointment reminders
// @route   POST /api/notifications/appointment-reminders
// @access  Private
export const createAppointmentReminders = async (req, res) => {
  try {
    const { appointmentIds, times, days = 1 } = req.body;
    const userId = req.user.id;

    if (!appointmentIds || appointmentIds.length === 0) {
      return res.status(400).json({ message: "Appointment IDs are required" });
    }

    // Get appointments
    const appointments = await Appointment.find({
      _id: { $in: appointmentIds },
      patientId: userId,
      status: { $in: ["scheduled", "confirmed"] },
    });

    if (appointments.length !== appointmentIds.length) {
      return res.status(404).json({ message: "One or more appointments not found" });
    }

    // Create notifications for each appointment
    const notifications = [];
    const now = new Date();

    for (const appointment of appointments) {
      for (const time of times) {
        // Calculate reminder date (1 day before appointment)
        const reminderDate = new Date(appointment.date);
        reminderDate.setDate(appointment.date.getDate() - days);
        reminderDate.setHours(parseInt(time.split(":")[0]));
        reminderDate.setMinutes(parseInt(time.split(":")[1]));

        notifications.push({
          userId,
          type: "appointment_reminder",
          title: `Appointment Reminder: ${appointment.doctorName}`,
          message: `You have an appointment with ${appointment.doctorName} (${appointment.specialty}) tomorrow at ${appointment.time}`,
          scheduledFor: reminderDate,
          read: false,
          data: {
            appointmentId: appointment._id,
            doctorName: appointment.doctorName,
            specialty: appointment.specialty,
            date: appointment.date,
            time: appointment.time,
            location: appointment.location,
          },
        });
      }
    }

    // Create notifications in database
    const createdNotifications = await Notification.insertMany(notifications);

    res.status(201).json({
      message: "Appointment reminders created",
      notifications: createdNotifications,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server Error", error: error.message });
  }
};

// @desc    Create refill reminders
// @route   POST /api/notifications/refill-reminders
// @access  Private
export const createRefillReminders = async (req, res) => {
  try {
    const { prescriptionIds, days = 7 } = req.body;
    const userId = req.user.id;

    if (!prescriptionIds || prescriptionIds.length === 0) {
      return res.status(400).json({ message: "Prescription IDs are required" });
    }

    // Get prescriptions
    const prescriptions = await Prescription.find({
      _id: { $in: prescriptionIds },
      patientId: userId,
      status: "active",
    });

    if (prescriptions.length !== prescriptionIds.length) {
      return res.status(404).json({ message: "One or more prescriptions not found" });
    }

    // Create notifications for each prescription
    const notifications = [];

    for (const prescription of prescriptions) {
      // Check if prescription needs refill
      if (prescription.hasRefillsAvailable()) {
        const nextRefillDate = prescription.getNextRefillDate();
        
        if (nextRefillDate) {
          notifications.push({
            userId,
            type: "refill_reminder",
            title: `Refill Reminder: ${prescription.medications[0].name}`,
            message: `Your prescription for ${prescription.medications[0].name} needs to be refilled soon`,
            scheduledFor: nextRefillDate,
            read: false,
            data: {
              prescriptionId: prescription._id,
              medicationName: prescription.medications[0].name,
              nextRefillDate,
            },
          });
        }
      }
    }

    // Create notifications in database
    const createdNotifications = await Notification.insertMany(notifications);

    res.status(201).json({
      message: "Refill reminders created",
      notifications: createdNotifications,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server Error", error: error.message });
  }
};

// @desc    Send test notification
// @route   POST /api/notifications/test
// @access  Private
export const sendTestNotification = async (req, res) => {
  try {
    const { title, message, type } = req.body;
    const userId = req.user.id;

    if (!title || !message) {
      return res.status(400).json({ message: "Title and message are required" });
    }

    // Create test notification
    const notification = await Notification.create({
      userId,
      type: type || "general",
      title,
      message,
      read: false,
    });

    res.status(201).json({
      message: "Test notification created",
      notification,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server Error", error: error.message });
  }
};