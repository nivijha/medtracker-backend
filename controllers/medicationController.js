import Medication from "../models/Medication.js";

/**
 * @desc    Create a new medication
 * @route   POST /api/medications
 * @access  Private
 */
export const createMedication = async (req, res, next) => {
  try {
    const medication = await Medication.create({
      ...req.body,
      user: req.user.id,
    });

    res.status(201).json({ medication });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get all user medications
 * @route   GET /api/medications
 * @access  Private
 */
export const getMedications = async (req, res, next) => {
  try {
    const meds = await Medication.find({ user: req.user.id }).sort({
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
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Delete a medication
 * @route   DELETE /api/medications/:id
 * @access  Private
 */
export const deleteMedication = async (req, res, next) => {
  try {
    const medication = await Medication.findOneAndDelete({
      _id: req.params.id,
      user: req.user.id,
    });

    if (!medication) {
      return res.status(404).json({ message: "Medication not found" });
    }

    res.json({ message: "Medication deleted" });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Mark medication as taken for today
 * @route   POST /api/medications/:id/take
 * @access  Private
 */
export const markMedicationAsTaken = async (req, res, next) => {
  try {
    const medication = await Medication.findOne({
      _id: req.params.id,
      user: req.user.id,
    });

    if (!medication) {
      return res.status(404).json({ message: "Medication not found" });
    }

    medication.takenToday = true;
    await medication.save();

    res.json({ medication });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get today's medication schedule
 * @route   GET /api/medications/schedule
 * @access  Private
 */
export const getMedicationSchedule = async (req, res, next) => {
  try {
    const meds = await Medication.find({
      user: req.user.id,
      status: "active",
    });

    const schedule = meds.map((med) => ({
      medicationId: med._id,
      time: med.time,
      medications: [`${med.name} (${med.dosage})`],
      taken: med.takenToday,
    }));

    res.json(schedule);
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Process medication refill
 * @route   POST /api/medications/:id/refill
 * @access  Private
 */
export const processRefill = async (req, res, next) => {
  try {
    const medication = await Medication.findOne({
      _id: req.params.id,
      user: req.user.id,
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
  } catch (error) {
    next(error);
  }
};
