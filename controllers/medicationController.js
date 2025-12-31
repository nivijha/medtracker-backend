import Medication from "../models/Medication.js";

/* CREATE */
export const createMedication = async (req, res) => {
  try {
    const medication = await Medication.create({
      ...req.body,
      userId: req.user.id,
    });

    res.status(201).json({ medication });
  } catch (err) {
    res.status(400).json({ message: "Failed to create medication" });
  }
};

/* GET ALL */
export const getMedications = async (req, res) => {
  const meds = await Medication.find({ userId: req.user.id }).sort({
    createdAt: -1,
  });

  // derive refillSoon (within 7 days)
  const now = new Date();
  const medications = meds.map((med) => ({
    ...med.toObject(),
    refillSoon:
      med.nextRefill &&
      med.nextRefill <= new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000),
  }));

  res.json({ medications });
};

/* DELETE */
export const deleteMedication = async (req, res) => {
  await Medication.findOneAndDelete({
    _id: req.params.id,
    userId: req.user.id,
  });

  res.json({ message: "Medication deleted" });
};

/* MARK AS TAKEN */
export const markMedicationAsTaken = async (req, res) => {
  const medication = await Medication.findOne({
    _id: req.params.id,
    userId: req.user.id,
  });

  if (!medication) {
    return res.status(404).json({ message: "Medication not found" });
  }

  medication.takenToday = true;
  await medication.save();

  res.json({ medication });
};

/* TODAY SCHEDULE */
export const getMedicationSchedule = async (req, res) => {
  const meds = await Medication.find({
    userId: req.user.id,
    status: "active",
  });

  const schedule = meds.map((med) => ({
    medicationId: med._id,
    time: med.time,
    medications: [`${med.name} (${med.dosage})`],
    taken: med.takenToday,
  }));

  res.json(schedule);
};

/* REFILL */
export const processRefill = async (req, res) => {
  const medication = await Medication.findOne({
    _id: req.params.id,
    userId: req.user.id,
  });

  if (!medication) {
    return res.status(404).json({ message: "Medication not found" });
  }

  medication.nextRefill = new Date(
    Date.now() + 30 * 24 * 60 * 60 * 1000
  );
  medication.status = "active";

  await medication.save();
  res.json({ medication });
};
