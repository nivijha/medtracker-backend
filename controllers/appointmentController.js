import Appointment from "../models/Appointment.js";

/**
 * @desc    Get upcoming appointments
 * @route   GET /api/appointments/upcoming
 * @access  Private
 */
export const getUpcomingAppointments = async (req, res, next) => {
  try {
    const now = new Date();

    const appointments = await Appointment.find({
      user: req.user.id,
      appointmentDateTime: { $gte: now },
      status: { $ne: "cancelled" },
    })
      .populate("user", "name email")
      .sort({ appointmentDateTime: 1 });

    res.json({ appointments });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get past appointments
 * @route   GET /api/appointments/past
 * @access  Private
 */
export const getPastAppointments = async (req, res, next) => {
  try {
    const now = new Date();

    const appointments = await Appointment.find({
      user: req.user.id,
      $or: [
        { appointmentDateTime: { $lt: now } },
        { status: "cancelled" },
      ],
    })
      .populate("user", "name email")
      .sort({ appointmentDateTime: -1 });

    res.json({ appointments });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get all user appointments
 * @route   GET /api/appointments
 * @access  Private
 */
export const getAppointments = async (req, res, next) => {
  try {
    const appointments = await Appointment.find({
      user: req.user.id,
    })
      .populate("user", "name email")
      .sort({ appointmentDateTime: 1 });

    res.json({ appointments });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Create a new appointment
 * @route   POST /api/appointments
 * @access  Private
 */
export const createAppointment = async (req, res, next) => {
  try {
    const { doctorName, specialty, hospital, date, time, notes } = req.body;

    if (!doctorName || !date || !time) {
      return res
        .status(400)
        .json({ message: "Doctor, date and time are required" });
    }

    // IST → UTC conversion (assuming client sends local date/time)
    const appointmentDateTime = new Date(`${date}T${time}:00+05:30`);

    const appointment = await Appointment.create({
      user: req.user.id,
      doctorName,
      specialty,
      hospital,
      appointmentDateTime,
      notes,
      status: "scheduled",
    });

    res.status(201).json({ appointment });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Cancel an appointment
 * @route   PUT /api/appointments/:id/cancel
 * @access  Private
 */
export const cancelAppointment = async (req, res, next) => {
  try {
    const appointment = await Appointment.findOne({
      _id: req.params.id,
      user: req.user.id,
    });

    if (!appointment) {
      return res.status(404).json({ message: "Appointment not found" });
    }

    appointment.status = "cancelled";
    await appointment.save();

    res.json({ appointment });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Delete an appointment
 * @route   DELETE /api/appointments/:id
 * @access  Private
 */
export const deleteAppointment = async (req, res, next) => {
  try {
    const appointment = await Appointment.findOne({
      _id: req.params.id,
      user: req.user.id,
    });

    if (!appointment) {
      return res.status(404).json({ message: "Appointment not found" });
    }

    await appointment.deleteOne();
    res.json({ message: "Appointment deleted successfully" });
  } catch (error) {
    next(error);
  }
};
