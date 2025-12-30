import Appointment from "../models/Appointment.js";

/* ---------------- GET UPCOMING ---------------- */
export const getUpcomingAppointments = async (req, res) => {
  try {
    const now = new Date();

    const appointments = await Appointment.find({
      userId: req.user.id,
      appointmentDateTime: { $gte: now },
      status: { $ne: "cancelled" },
    }).sort({ appointmentDateTime: 1 });

    res.json({ appointments });
  } catch (error) {
    console.error("Upcoming appointments error:", error);
    res.status(500).json({ message: "Server error" });
  }
};

/* ---------------- GET PAST ---------------- */
export const getPastAppointments = async (req, res) => {
  try {
    const now = new Date();

    const appointments = await Appointment.find({
      userId: req.user.id,
      $or: [
        { appointmentDateTime: { $lt: now } },
        { status: "cancelled" },
      ],
    }).sort({ appointmentDateTime: -1 });

    res.json({ appointments });
  } catch (error) {
    console.error("Past appointments error:", error);
    res.status(500).json({ message: "Server error" });
  }
};

/* ---------------- GET ALL ---------------- */
export const getAppointments = async (req, res) => {
  try {
    const appointments = await Appointment.find({
      userId: req.user.id,
    }).sort({ appointmentDateTime: 1 });

    res.json({ appointments });
  } catch (error) {
    console.error("Get appointments error:", error);
    res.status(500).json({ message: "Server error" });
  }
};

/* ---------------- CREATE ---------------- */
export const createAppointment = async (req, res) => {
  try {
    const { doctorName, specialty, hospital, date, time, notes } = req.body;

    if (!doctorName || !date || !time) {
      return res
        .status(400)
        .json({ message: "Doctor, date and time are required" });
    }

    // IST → UTC conversion
    const appointmentDateTime = new Date(`${date}T${time}:00+05:30`);

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
  } catch (error) {
    console.error("Create appointment error:", error);
    res.status(500).json({ message: "Server error" });
  }
};

/* ---------------- CANCEL ---------------- */
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

/* ---------------- DELETE ---------------- */
export const deleteAppointment = async (req, res) => {
  try {
    const appointment = await Appointment.findOne({
      _id: req.params.id,
      userId: req.user.id,
    });

    if (!appointment) {
      return res.status(404).json({ message: "Appointment not found" });
    }

    await appointment.deleteOne();
    res.json({ message: "Appointment deleted successfully" });
  } catch (error) {
    console.error("Delete appointment error:", error);
    res.status(500).json({ message: "Server error" });
  }
};
