import Appointment from "../models/Appointment.js";

const getAppointmentDateTime = (appointment) => {
  const dateStr = appointment.date.toISOString().split("T")[0];
  return new Date(`${dateStr}T${appointment.time}`);
};

export const getUpcomingAppointments = async (req, res) => {
  const now = new Date();

  const appointments = await Appointment.find({
    userId: req.user.id,
    appointmentDateTime: { $gte: now },
    status: { $ne: "cancelled" },
  });

  res.json({ appointments });
};

export const getPastAppointments = async (req, res) => {
  const now = new Date();

  const appointments = await Appointment.find({
    userId: req.user.id,
    $or: [
      { appointmentDateTime: { $lt: now } },
      { status: "cancelled" },
    ],
  });

  res.json({ appointments });
};

export const getAppointments = async (req, res) => {
  const appointments = await Appointment.find({
    userId: req.user.id,
  }).sort({ appointmentDateTime: 1 });

  res.json({ appointments });
};

export const createAppointment = async (req, res) => {
  try {
    const { doctorName, specialty, hospital, date, time, notes } = req.body;

    if (!date || !time) {
      return res.status(400).json({ message: "Date and time required" });
    }

    const appointmentDateTime = new Date(`${date}T${time}`);

    if (isNaN(appointmentDateTime.getTime())) {
      return res.status(400).json({ message: "Invalid date or time" });
    }

    const appointment = await Appointment.create({
      userId: req.user.id,
      doctorName,
      specialty,
      hospital,
      appointmentDateTime,
      notes,
      status: "scheduled",
    });

    res.status(201).json({ appointment });
  } catch (err) {
    console.error("Create appointment error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

export const cancelAppointment = async (req, res) => {
  try {
    const appointment = await Appointment.findOne({
      _id: req.params.id,
      userId: req.user.id,
    });

    if (!appointment) {
      return res.status(404).json({ message: "Appointment not found" });
    }

    appointment.status = "cancelled";
    await appointment.save();

    res.json({ appointment });
  } catch (error) {
    console.error("Cancel appointment error:", error);
    res.status(500).json({ message: "Server error" });
  }
};

export const deleteAppointment = async (req, res) => {
  try {
    const appointment = await Appointment.findOne({
      _id: req.params.id,
      userId: req.user.id,
    });

    if (!appointment) {
      return res.status(404).json({
        message: "Appointment not found",
      });
    }

    await appointment.deleteOne();

    res.json({
      message: "Appointment deleted successfully",
    });
  } catch (error) {
    console.error("Delete appointment error:", error);
    res.status(500).json({
      message: "Server error while deleting appointment",
    });
  }
};
