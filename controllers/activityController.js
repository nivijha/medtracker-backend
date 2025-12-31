import Appointment from "../models/Appointment.js";
import Medication from "../models/Medication.js";
import Report from "../models/Report.js";

export const getRecentActivity = async (req, res) => {
  try {
    const userId = req.user._id;

    const appointments = await Appointment.find({ userId })
      .sort({ updatedAt: -1 })
      .limit(5)
      .select("doctorName appointmentDateTime status updatedAt");

    const medications = await Medication.find({ userId })
      .sort({ updatedAt: -1 })
      .limit(5)
      .select("name status takenToday updatedAt");

    const reports = await Report.find({ userId })
      .sort({ updatedAt: -1 })
      .limit(5)
      .select("title createdAt");

    const activity = [];

    appointments.forEach((a) =>
      activity.push({
        type: "appointment",
        title: `Appointment with Dr. ${a.doctorName}`,
        time: a.updatedAt,
        status: a.status === "completed" ? "completed" : "upcoming",
      })
    );

    medications.forEach((m) =>
      activity.push({
        type: "medication",
        title: `${m.name} medication`,
        time: m.updatedAt,
        status: m.takenToday ? "completed" : "pending",
      })
    );

    reports.forEach((r) =>
      activity.push({
        type: "report",
        title: `Report uploaded`,
        time: r.createdAt,
        status: "completed",
      })
    );

    activity.sort((a, b) => new Date(b.time) - new Date(a.time));

    res.json(activity.slice(0, 6));
  } catch (err) {
    res.status(500).json({ message: "Failed to load recent activity" });
  }
};
