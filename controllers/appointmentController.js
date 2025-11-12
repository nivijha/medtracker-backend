import Appointment from "../models/Appointment.js";
import Doctor from "../models/Doctor.js";
import mongoose from "mongoose";

// @desc    Get all appointments for a user
// @route   GET /api/appointments
// @access  Private
export const getAppointments = async (req, res) => {
  try {
    const { status, page = 1, limit = 10, startDate, endDate } = req.query;
    const userId = req.user.id;

    // Build query
    const query = { patientId: userId };
    
    if (status && status !== "all") {
      query.status = status;
    }

    if (startDate || endDate) {
      query.date = {};
      if (startDate) query.date.$gte = new Date(startDate);
      if (endDate) query.date.$lte = new Date(endDate);
    }

    // Execute query with pagination
    const appointments = await Appointment.find(query)
      .populate("doctorId", "firstName lastName specialty phone")
      .sort({ date: 1, time: 1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    // Get total count for pagination
    const total = await Appointment.countDocuments(query);

    res.json({
      appointments,
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

// @desc    Get single appointment
// @route   GET /api/appointments/:id
// @access  Private
export const getAppointmentById = async (req, res) => {
  try {
    const appointment = await Appointment.findById(req.params.id)
      .populate("doctorId", "firstName lastName specialty phone email")
      .populate("documents");

    if (!appointment) {
      return res.status(404).json({ message: "Appointment not found" });
    }

    // Check if appointment belongs to user
    if (appointment.patientId.toString() !== req.user.id) {
      return res.status(401).json({ message: "Not authorized" });
    }

    res.json(appointment);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server Error", error: error.message });
  }
};

// @desc    Create a new appointment
// @route   POST /api/appointments
// @access  Private
export const createAppointment = async (req, res) => {
  try {
    const {
      doctorId,
      doctorName,
      specialty,
      date,
      time,
      duration,
      location,
      type,
      reason,
      notes,
      insurance,
    } = req.body;

    // Validate required fields
    if (!doctorId || !doctorName || !specialty || !date || !time || !location || !reason) {
      return res.status(400).json({ message: "Please provide all required fields" });
    }

    // Check if doctor exists
    const doctor = await Doctor.findById(doctorId);
    if (!doctor) {
      return res.status(404).json({ message: "Doctor not found" });
    }

    // Check if doctor is available at requested time
    const isAvailable = doctor.isAvailable(date, time);
    if (!isAvailable) {
      return res.status(400).json({ message: "Doctor is not available at this time" });
    }

    // Create appointment
    const appointment = await Appointment.create({
      patientId: req.user.id,
      doctorId,
      doctorName,
      specialty,
      date,
      time,
      duration: duration || 30,
      location,
      type: type || "in-person",
      reason,
      notes,
      insurance: insurance || {},
    });

    const populatedAppointment = await Appointment.findById(appointment._id)
      .populate("doctorId", "firstName lastName specialty phone");

    res.status(201).json(populatedAppointment);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server Error", error: error.message });
  }
};

// @desc    Update an appointment
// @route   PUT /api/appointments/:id
// @access  Private
export const updateAppointment = async (req, res) => {
  try {
    const appointment = await Appointment.findById(req.params.id);

    if (!appointment) {
      return res.status(404).json({ message: "Appointment not found" });
    }

    // Check if appointment belongs to user
    if (appointment.patientId.toString() !== req.user.id) {
      return res.status(401).json({ message: "Not authorized" });
    }

    // Don't allow updates to completed appointments
    if (appointment.status === "completed") {
      return res.status(400).json({ message: "Cannot update completed appointment" });
    }

    const updatedAppointment = await Appointment.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    ).populate("doctorId", "firstName lastName specialty phone");

    res.json(updatedAppointment);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server Error", error: error.message });
  }
};

// @desc    Cancel an appointment
// @route   PUT /api/appointments/:id/cancel
// @access  Private
export const cancelAppointment = async (req, res) => {
  try {
    const { reason } = req.body;
    const appointment = await Appointment.findById(req.params.id);

    if (!appointment) {
      return res.status(404).json({ message: "Appointment not found" });
    }

    // Check if appointment belongs to user
    if (appointment.patientId.toString() !== req.user.id) {
      return res.status(401).json({ message: "Not authorized" });
    }

    // Don't allow cancellation of completed appointments
    if (appointment.status === "completed") {
      return res.status(400).json({ message: "Cannot cancel completed appointment" });
    }

    appointment.status = "cancelled";
    if (reason) {
      appointment.notes = (appointment.notes || "") + `\n\nCancellation reason: ${reason}`;
    }

    await appointment.save();

    res.json({ message: "Appointment cancelled", appointment });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server Error", error: error.message });
  }
};

// @desc    Delete an appointment
// @route   DELETE /api/appointments/:id
// @access  Private
export const deleteAppointment = async (req, res) => {
  try {
    const appointment = await Appointment.findById(req.params.id);

    if (!appointment) {
      return res.status(404).json({ message: "Appointment not found" });
    }

    // Check if appointment belongs to user
    if (appointment.patientId.toString() !== req.user.id) {
      return res.status(401).json({ message: "Not authorized" });
    }

    await appointment.remove();

    res.json({ message: "Appointment removed" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server Error", error: error.message });
  }
};

// @desc    Get upcoming appointments
// @route   GET /api/appointments/upcoming
// @access  Private
export const getUpcomingAppointments = async (req, res) => {
  try {
    const userId = req.user.id;
    const days = parseInt(req.query.days) || 30;

    const startDate = new Date();
    const endDate = new Date();
    endDate.setDate(startDate.getDate() + days);

    const appointments = await Appointment.find({
      patientId: userId,
      date: { $gte: startDate, $lte: endDate },
      status: { $in: ["scheduled", "confirmed"] },
    })
      .populate("doctorId", "firstName lastName specialty phone")
      .sort({ date: 1, time: 1 });

    res.json(appointments);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server Error", error: error.message });
  }
};

// @desc    Get past appointments
// @route   GET /api/appointments/past
// @access  Private
export const getPastAppointments = async (req, res) => {
  try {
    const userId = req.user.id;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;

    const appointments = await Appointment.find({
      patientId: userId,
      $or: [
        { date: { $lt: new Date() } },
        { status: { $in: ["completed", "cancelled", "no-show"] } },
      ],
    })
      .populate("doctorId", "firstName lastName specialty phone")
      .sort({ date: -1, time: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await Appointment.countDocuments({
      patientId: userId,
      $or: [
        { date: { $lt: new Date() } },
        { status: { $in: ["completed", "cancelled", "no-show"] } },
      ],
    });

    res.json({
      appointments,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server Error", error: error.message });
  }
};

// @desc    Get available time slots for a doctor
// @route   GET /api/appointments/available-slots
// @access  Private
export const getAvailableSlots = async (req, res) => {
  try {
    const { doctorId, date } = req.query;

    if (!doctorId || !date) {
      return res.status(400).json({ message: "Doctor ID and date are required" });
    }

    const doctor = await Doctor.findById(doctorId);
    if (!doctor) {
      return res.status(404).json({ message: "Doctor not found" });
    }

    // Get existing appointments for the doctor on that date
    const existingAppointments = await Appointment.find({
      doctorId,
      date: new Date(date),
      status: { $in: ["scheduled", "confirmed"] },
    });

    // Get available slots (simplified version)
    const availableSlots = doctor.getNextAvailableSlot(date);

    res.json({
      doctorId,
      date,
      availableSlots,
      existingAppointments: existingAppointments.map(apt => ({
        time: apt.time,
        duration: apt.duration,
      })),
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server Error", error: error.message });
  }
};

// @desc    Reschedule an appointment
// @route   PUT /api/appointments/:id/reschedule
// @access  Private
export const rescheduleAppointment = async (req, res) => {
  try {
    const { newDate, newTime, reason } = req.body;
    const appointment = await Appointment.findById(req.params.id);

    if (!appointment) {
      return res.status(404).json({ message: "Appointment not found" });
    }

    // Check if appointment belongs to user
    if (appointment.patientId.toString() !== req.user.id) {
      return res.status(401).json({ message: "Not authorized" });
    }

    // Don't allow rescheduling of completed appointments
    if (appointment.status === "completed") {
      return res.status(400).json({ message: "Cannot reschedule completed appointment" });
    }

    // Check if doctor is available at new time
    const doctor = await Doctor.findById(appointment.doctorId);
    const isAvailable = doctor.isAvailable(newDate, newTime);
    if (!isAvailable) {
      return res.status(400).json({ message: "Doctor is not available at the new time" });
    }

    // Update appointment
    appointment.date = newDate;
    appointment.time = newTime;
    appointment.status = "rescheduled";
    if (reason) {
      appointment.notes = (appointment.notes || "") + `\n\nReschedule reason: ${reason}`;
    }

    await appointment.save();

    const updatedAppointment = await Appointment.findById(appointment._id)
      .populate("doctorId", "firstName lastName specialty phone");

    res.json({
      message: "Appointment rescheduled",
      appointment: updatedAppointment,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server Error", error: error.message });
  }
};