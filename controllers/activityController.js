import Appointment from "../models/Appointment.js";
import Medication from "../models/Medication.js";
import Report from "../models/Report.js";

/**
 * @desc    Get recent activities (appointments, medications, reports)
 * @route   GET /api/activity
 * @access  Private
 */
export const getRecentActivity = async (req, res, next) => {
  try {
    const user = req.user.id;

    const [appointments, medications, reports] = await Promise.all([
      Appointment.find({ user })
        .sort({ updatedAt: -1 })
        .limit(5)
        .select("doctorName appointmentDateTime status updatedAt"),
      Medication.find({ user })
        .sort({ updatedAt: -1 })
        .limit(5)
        .select("name status takenToday updatedAt"),
      Report.find({ user })
        .sort({ updatedAt: -1 })
        .limit(5)
        .select("type createdAt"),
    ]);

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
        title: `${r.type.charAt(0).toUpperCase() + r.type.slice(1)} report uploaded`,
        time: r.createdAt,
        status: "completed",
      })
    );

    activity.sort((a, b) => new Date(b.time) - new Date(a.time));

    res.json(activity.slice(0, 6));
  } catch (err) {
    next(err);
  }
};
