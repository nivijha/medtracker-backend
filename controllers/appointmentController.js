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
