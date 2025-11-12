import mongoose from "mongoose";

const notificationSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    type: {
      type: String,
      enum: [
        "general",
        "medication_reminder",
        "appointment_reminder",
        "refill_reminder",
        "health_alert",
        "system_update",
        "security_alert",
        "test_result",
        "prescription_update",
        "appointment_confirmation",
        "appointment_cancellation",
        "appointment_rescheduled",
      ],
      required: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    message: {
      type: String,
      required: true,
      trim: true,
    },
    data: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    scheduledFor: {
      type: Date,
      required: false,
    },
    read: {
      type: Boolean,
      default: false,
    },
    priority: {
      type: String,
      enum: ["low", "medium", "high"],
      default: "medium",
    },
    actionUrl: {
      type: String,
      trim: true,
    },
    actionText: {
      type: String,
      trim: true,
    },
    expiresAt: {
      type: Date,
      required: false,
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
    updatedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);

// Index for efficient queries
notificationSchema.index({ userId: 1, read: 1, createdAt: -1 });

// Method to check if notification is expired
notificationSchema.methods.isExpired = function() {
  if (!this.expiresAt) return false;
  return new Date() > this.expiresAt;
};

// Method to mark notification as read
notificationSchema.methods.markAsRead = function() {
  this.read = true;
  this.updatedAt = new Date();
  return this.save();
};

// Static method to create medication reminder
notificationSchema.statics.createMedicationReminder = function(userId, medication, time, date) {
  return this.create({
    userId,
    type: "medication_reminder",
    title: `Medication Reminder: ${medication.name}`,
    message: `It's time to take your ${medication.name} (${medication.dosage})`,
    data: {
      medicationId: medication._id,
      medicationName: medication.name,
      dosage: medication.dosage,
      time,
    },
    scheduledFor: date,
    priority: "high",
  });
};

// Static method to create appointment reminder
notificationSchema.statics.createAppointmentReminder = function(userId, appointment, time, date) {
  return this.create({
    userId,
    type: "appointment_reminder",
    title: `Appointment Reminder: ${appointment.doctorName}`,
    message: `You have an appointment with ${appointment.doctorName} (${appointment.specialty}) tomorrow at ${appointment.time}`,
    data: {
      appointmentId: appointment._id,
      doctorName: appointment.doctorName,
      specialty: appointment.specialty,
      date: appointment.date,
      time,
      location: appointment.location,
    },
    scheduledFor: date,
    priority: "high",
  });
};

// Static method to create refill reminder
notificationSchema.statics.createRefillReminder = function(userId, prescription, date) {
  return this.create({
    userId,
    type: "refill_reminder",
    title: `Refill Reminder: ${prescription.medications[0].name}`,
    message: `Your prescription for ${prescription.medications[0].name} needs to be refilled soon`,
    data: {
      prescriptionId: prescription._id,
      medicationName: prescription.medications[0].name,
      nextRefillDate: prescription.getNextRefillDate(),
    },
    scheduledFor: date,
    priority: "high",
  });
};

// Static method to create health alert
notificationSchema.statics.createHealthAlert = function(userId, metric, abnormality) {
  return this.create({
    userId,
    type: "health_alert",
    title: `Health Alert: ${metric}`,
    message: `Your ${metric} reading is outside the normal range`,
    data: {
      metric,
      abnormality,
    },
    priority: "high",
  });
};

// Static method to create system update notification
notificationSchema.statics.createSystemUpdate = function(userId, title, message) {
  return this.create({
    userId,
    type: "system_update",
    title,
    message,
    priority: "low",
  });
};

// Static method to create security alert
notificationSchema.statics.createSecurityAlert = function(userId, title, message) {
  return this.create({
    userId,
    type: "security_alert",
    title,
    message,
    priority: "high",
    actionUrl: "/profile/security",
    actionText: "Review Security Settings",
  });
};

// Static method to create appointment confirmation
notificationSchema.statics.createAppointmentConfirmation = function(userId, appointment) {
  return this.create({
    userId,
    type: "appointment_confirmation",
    title: "Appointment Confirmed",
    message: `Your appointment with ${appointment.doctorName} has been confirmed`,
    data: {
      appointmentId: appointment._id,
      doctorName: appointment.doctorName,
      specialty: appointment.specialty,
      date: appointment.date,
      time: appointment.time,
    },
    priority: "medium",
  });
};

// Static method to create appointment cancellation
notificationSchema.statics.createAppointmentCancellation = function(userId, appointment, reason) {
  return this.create({
    userId,
    type: "appointment_cancellation",
    title: "Appointment Cancelled",
    message: `Your appointment with ${appointment.doctorName} has been cancelled`,
    data: {
      appointmentId: appointment._id,
      doctorName: appointment.doctorName,
      reason,
    },
    priority: "high",
  });
};

// Static method to create appointment reschedule
notificationSchema.statics.createAppointmentReschedule = function(userId, appointment, oldDate, oldTime, newDate, newTime) {
  return this.create({
    userId,
    type: "appointment_rescheduled",
    title: "Appointment Rescheduled",
    message: `Your appointment with ${appointment.doctorName} has been rescheduled`,
    data: {
      appointmentId: appointment._id,
      doctorName: appointment.doctorName,
      oldDate,
      oldTime,
      newDate,
      newTime,
    },
    priority: "medium",
  });
};

// Static method to create prescription update
notificationSchema.statics.createPrescriptionUpdate = function(userId, prescription, updateType) {
  return this.create({
    userId,
    type: "prescription_update",
    title: "Prescription Updated",
    message: `Your prescription has been ${updateType}`,
    data: {
      prescriptionId: prescription._id,
      updateType,
    },
    priority: "medium",
  });
};

// Static method to clean up expired notifications
notificationSchema.statics.cleanupExpired = function() {
  const now = new Date();
  return this.deleteMany({
    expiresAt: { $lt: now },
  });
};

const Notification = mongoose.model("Notification", notificationSchema);
export default Notification;