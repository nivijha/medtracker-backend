import Appointment from "../models/Appointment.js";

export const getAppointments = async (req, res) => {
  const appointments = await Appointment.find({ userId: req.user.id })
    .sort({ date: 1 });

  res.json({ appointments });
};

export const createAppointment = async (req, res) => {
  const appointment = await Appointment.create({
    userId: req.user.id,
    doctorName: req.body.doctorName,
    specialty: req.body.specialty,
    hospital: req.body.hospital,
    date: req.body.date,
    time: req.body.time,
    notes: req.body.notes,
    status: "scheduled"
  });

  res.status(201).json({ appointment });
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

