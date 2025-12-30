export const createAppointment = async (req, res) => {
  try {
    const {
      doctorName,
      specialty,
      hospital,
      date,
      time,
      notes,
    } = req.body;

    if (!doctorName || !date || !time) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    const appointment = await Appointment.create({
      userId: req.user._id,
      doctorName,
      specialty,
      hospital,
      date,
      time,
      notes,
    });

    res.status(201).json({ appointment });
  } catch (err) {
    res.status(500).json({ message: "Failed to create appointment" });
  }
};
