import Medication from "../models/Medication.js";
import Prescription from "../models/Prescription.js";
import mongoose from "mongoose";

// @desc    Get all medications for a user
// @route   GET /api/medications
// @access  Private
export const getMedications = async (req, res) => {
  try {
    const { status, page = 1, limit = 10, search } = req.query;
    const userId = req.user.id;

    // Build query
    const query = { userId };
    
    if (status && status !== "all") {
      query.status = status;
    }

    if (search) {
      query.$or = [
        { name: { $regex: search, $options: "i" } },
        { dosage: { $regex: search, $options: "i" } },
        { prescribedBy: { $regex: search, $options: "i" } },
        { doctorName: { $regex: search, $options: "i" } },
      ];
    }

    // Execute query with pagination
    const medications = await Medication.find(query)
      .populate("prescribedBy", "firstName lastName email specialty")
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    // Get total count for pagination
    const total = await Medication.countDocuments(query);

    res.json({
      medications,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server Error", error: error.message });
  }
};

// @desc    Get single medication
// @route   GET /api/medications/:id
// @access  Private
export const getMedicationById = async (req, res) => {
  try {
    const medication = await Medication.findById(req.params.id)
      .populate("prescribedBy", "firstName lastName email specialty phone");

    if (!medication) {
      return res.status(404).json({ message: "Medication not found" });
    }

    // Check if medication belongs to user
    if (medication.userId.toString() !== req.user.id) {
      return res.status(401).json({ message: "Not authorized" });
    }

    res.json(medication);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server Error", error: error.message });
  }
};

// @desc    Create a new medication
// @route   POST /api/medications
// @access  Private
export const createMedication = async (req, res) => {
  try {
    const {
      name,
      dosage,
      frequency,
      timeOfDay,
      prescribedBy,
      doctorName,
      startDate,
      endDate,
      nextRefill,
      remainingSupply,
      notes,
      reminders,
    } = req.body;

    // Validate required fields
    if (!name || !dosage || !frequency || !startDate) {
      return res.status(400).json({ message: "Please provide all required fields" });
    }

    // Create medication
    const medication = await Medication.create({
      userId: req.user.id,
      name,
      dosage,
      frequency,
      timeOfDay: timeOfDay || [],
      prescribedBy,
      doctorName,
      startDate,
      endDate,
      nextRefill,
      remainingSupply,
      notes,
      reminders: reminders || { enabled: true, times: [] },
    });

    // Update status based on dates
    await medication.updateStatus();

    const populatedMedication = await Medication.findById(medication._id)
      .populate("prescribedBy", "firstName lastName email specialty");

    res.status(201).json(populatedMedication);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server Error", error: error.message });
  }
};

// @desc    Update a medication
// @route   PUT /api/medications/:id
// @access  Private
export const updateMedication = async (req, res) => {
  try {
    const medication = await Medication.findById(req.params.id);

    if (!medication) {
      return res.status(404).json({ message: "Medication not found" });
    }

    // Check if medication belongs to user
    if (medication.userId.toString() !== req.user.id) {
      return res.status(401).json({ message: "Not authorized" });
    }

    const updatedMedication = await Medication.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    ).populate("prescribedBy", "firstName lastName email specialty");

    // Update status based on dates
    await updatedMedication.updateStatus();

    res.json(updatedMedication);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server Error", error: error.message });
  }
};

// @desc    Delete a medication
// @route   DELETE /api/medications/:id
// @access  Private
export const deleteMedication = async (req, res) => {
  try {
    const medication = await Medication.findById(req.params.id);

    if (!medication) {
      return res.status(404).json({ message: "Medication not found" });
    }

    // Check if medication belongs to user
    if (medication.userId.toString() !== req.user.id) {
      return res.status(401).json({ message: "Not authorized" });
    }

    await medication.remove();

    res.json({ message: "Medication removed" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server Error", error: error.message });
  }
};

// @desc    Get medications that need refill soon
// @route   GET /api/medications/refill-soon
// @access  Private
export const getMedicationsNeedingRefill = async (req, res) => {
  try {
    const userId = req.user.id;
    const days = parseInt(req.query.days) || 7;

    const medications = await Medication.find({
      userId,
      nextRefill: {
        $gte: new Date(),
        $lte: new Date(Date.now() + days * 24 * 60 * 60 * 1000),
      },
      status: { $in: ["active", "refill-soon"] },
    })
      .populate("prescribedBy", "firstName lastName email specialty")
      .sort({ nextRefill: 1 });

    res.json(medications);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server Error", error: error.message });
  }
};

// @desc    Get today's medication schedule
// @route   GET /api/medications/schedule
// @access  Private
export const getTodayMedicationSchedule = async (req, res) => {
  try {
    const userId = req.user.id;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const medications = await Medication.find({
      userId,
      status: "active",
      startDate: { $lte: today },
      $or: [
        { endDate: { $exists: false } },
        { endDate: { $gte: today } },
      ],
    }).populate("prescribedBy", "firstName lastName email specialty");

    // Group medications by time of day
    const schedule = {
      morning: [],
      afternoon: [],
      evening: [],
      night: [],
    };

    medications.forEach((med) => {
      if (med.timeOfDay && med.timeOfDay.length > 0) {
        med.timeOfDay.forEach((time) => {
          if (schedule[time.toLowerCase()]) {
            schedule[time.toLowerCase()].push(med);
          }
        });
      } else {
        // Default to morning if no time specified
        schedule.morning.push(med);
      }
    });

    res.json(schedule);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server Error", error: error.message });
  }
};

// @desc    Mark medication as taken
// @route   POST /api/medications/:id/take
// @access  Private
export const markMedicationAsTaken = async (req, res) => {
  try {
    const { time, notes } = req.body;
    const medication = await Medication.findById(req.params.id);

    if (!medication) {
      return res.status(404).json({ message: "Medication not found" });
    }

    // Check if medication belongs to user
    if (medication.userId.toString() !== req.user.id) {
      return res.status(401).json({ message: "Not authorized" });
    }

    // Add to compliance tracking (this would be better in a separate collection)
    const complianceEntry = {
      medicationId: medication._id,
      taken: true,
      time: time || new Date(),
      notes,
    };

    // For now, we'll just return success
    // In a real implementation, you'd save this to a compliance collection
    res.json({
      message: "Medication marked as taken",
      compliance: complianceEntry,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server Error", error: error.message });
  }
};

// @desc    Check for medication interactions
// @route   POST /api/medications/check-interactions
// @access  Private
export const checkMedicationInteractions = async (req, res) => {
  try {
    const { medicationIds } = req.body;

    if (!medicationIds || medicationIds.length < 2) {
      return res.status(400).json({
        message: "Please provide at least 2 medications to check interactions",
      });
    }

    const medications = await Medication.find({
      _id: { $in: medicationIds },
      userId: req.user.id,
    });

    if (medications.length !== medicationIds.length) {
      return res.status(404).json({
        message: "One or more medications not found",
      });
    }

    // Check for interactions
    const interactions = [];
    for (let i = 0; i < medications.length; i++) {
      for (let j = i + 1; j < medications.length; j++) {
        const med1 = medications[i];
        const med2 = medications[j];

        // Check if med1 has interactions with med2
        if (med1.interactions && med1.interactions.length > 0) {
          const interaction = med1.interactions.find(
            (int) => int.medication.toLowerCase() === med2.name.toLowerCase()
          );
          if (interaction) {
            interactions.push({
              medication1: med1.name,
              medication2: med2.name,
              severity: interaction.severity,
              description: interaction.description,
            });
          }
        }

        // Check if med2 has interactions with med1
        if (med2.interactions && med2.interactions.length > 0) {
          const interaction = med2.interactions.find(
            (int) => int.medication.toLowerCase() === med1.name.toLowerCase()
          );
          if (interaction) {
            interactions.push({
              medication1: med2.name,
              medication2: med1.name,
              severity: interaction.severity,
              description: interaction.description,
            });
          }
        }
      }
    }

    res.json({
      interactions,
      hasInteractions: interactions.length > 0,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server Error", error: error.message });
  }
};

// @desc    Get medication adherence statistics
// @route   GET /api/medications/adherence
// @access  Private
export const getMedicationAdherence = async (req, res) => {
  try {
    const userId = req.user.id;
    const days = parseInt(req.query.days) || 30;

    // Get active medications
    const medications = await Medication.find({
      userId,
      status: "active",
    });

    // This is a simplified calculation
    // In a real implementation, you'd query a compliance collection
    const totalDoses = medications.reduce((total, med) => {
      const dosesPerDay = getDosesPerDay(med.frequency);
      return total + (dosesPerDay * days);
    }, 0);

    // Mock adherence data (would come from compliance collection)
    const takenDoses = Math.floor(totalDoses * 0.85); // 85% adherence rate
    const adherenceRate = totalDoses > 0 ? (takenDoses / totalDoses) * 100 : 0;

    res.json({
      adherenceRate: Math.round(adherenceRate),
      totalDoses,
      takenDoses,
      missedDoses: totalDoses - takenDoses,
      period: `${days} days`,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server Error", error: error.message });
  }
};

// Helper function to calculate doses per day based on frequency
function getDosesPerDay(frequency) {
  const frequencyMap = {
    "Once daily": 1,
    "Twice daily": 2,
    "Three times daily": 3,
    "Four times daily": 4,
    "As needed": 1, // Conservative estimate
    "Weekly": 1 / 7,
    "Monthly": 1 / 30,
  };

  return frequencyMap[frequency] || 1;
}