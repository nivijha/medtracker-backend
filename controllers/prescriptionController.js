import Prescription from "../models/Prescription.js";
import Medication from "../models/Medication.js";
import mongoose from "mongoose";

// @desc    Get all prescriptions for a user
// @route   GET /api/prescriptions
// @access  Private
export const getPrescriptions = async (req, res) => {
  try {
    const { status, page = 1, limit = 10, search } = req.query;
    const userId = req.user.id;

    // Build query
    const query = { patientId: userId };
    
    if (status && status !== "all") {
      query.status = status;
    }

    if (search) {
      query.$or = [
        { "medications.name": { $regex: search, $options: "i" } },
        { doctorName: { $regex: search, $options: "i" } },
        { diagnosis: { $elemMatch: { description: { $regex: search, $options: "i" } } }}
      ];
    }

    // Execute query with pagination
    const prescriptions = await Prescription.find(query)
      .populate("doctorId", "firstName lastName specialty")
      .populate("medications")
      .sort({ datePrescribed: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    // Get total count for pagination
    const total = await Prescription.countDocuments(query);

    res.json({
      prescriptions,
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

// @desc    Get single prescription
// @route   GET /api/prescriptions/:id
// @access  Private
export const getPrescriptionById = async (req, res) => {
  try {
    const prescription = await Prescription.findById(req.params.id)
      .populate("doctorId", "firstName lastName specialty phone email")
      .populate("documents");

    if (!prescription) {
      return res.status(404).json({ message: "Prescription not found" });
    }

    // Check if prescription belongs to user
    if (prescription.patientId.toString() !== req.user.id) {
      return res.status(401).json({ message: "Not authorized" });
    }

    res.json(prescription);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server Error", error: error.message });
  }
};

// @desc    Create a new prescription
// @route   POST /api/prescriptions
// @access  Private
export const createPrescription = async (req, res) => {
  try {
    const {
      doctorId,
      doctorName,
      medications,
      diagnosis,
      symptoms,
      notes,
      validFrom,
      validUntil,
      pharmacy,
      priority,
      substitutions,
      insurance,
    } = req.body;

    // Validate required fields
    if (!doctorId || !doctorName || !medications || !medications.length) {
      return res.status(400).json({ message: "Please provide all required fields" });
    }

    // Create prescription
    const prescription = await Prescription.create({
      patientId: req.user.id,
      doctorId,
      doctorName,
      medications,
      diagnosis: diagnosis || [],
      symptoms: symptoms || [],
      notes,
      validFrom: validFrom || new Date(),
      validUntil,
      pharmacy: pharmacy || {},
      priority: priority || "routine",
      substitutions: substitutions || { allowed: true, brandOnly: false },
      insurance: insurance || {},
    });

    const populatedPrescription = await Prescription.findById(prescription._id)
      .populate("doctorId", "firstName lastName specialty phone email");

    res.status(201).json(populatedPrescription);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server Error", error: error.message });
  }
};

// @desc    Update a prescription
// @route   PUT /api/prescriptions/:id
// @access  Private
export const updatePrescription = async (req, res) => {
  try {
    const prescription = await Prescription.findById(req.params.id);

    if (!prescription) {
      return res.status(404).json({ message: "Prescription not found" });
    }

    // Check if prescription belongs to user
    if (prescription.patientId.toString() !== req.user.id) {
      return res.status(401).json({ message: "Not authorized" });
    }

    const updatedPrescription = await Prescription.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    ).populate("doctorId", "firstName lastName specialty phone email");

    res.json(updatedPrescription);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server Error", error: error.message });
  }
};

// @desc    Delete a prescription
// @route   DELETE /api/prescriptions/:id
// @access  Private
export const deletePrescription = async (req, res) => {
  try {
    const prescription = await Prescription.findById(req.params.id);

    if (!prescription) {
      return res.status(404).json({ message: "Prescription not found" });
    }

    // Check if prescription belongs to user
    if (prescription.patientId.toString() !== req.user.id) {
      return res.status(401).json({ message: "Not authorized" });
    }

    await prescription.remove();

    res.json({ message: "Prescription removed" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server Error", error: error.message });
  }
};

// @desc    Get active prescriptions
// @route   GET /api/prescriptions/active
// @access  Private
export const getActivePrescriptions = async (req, res) => {
  try {
    const userId = req.user.id;

    const prescriptions = await Prescription.find({
      patientId: userId,
      status: "active",
      validUntil: { $gte: new Date() },
    })
      .populate("doctorId", "firstName lastName specialty")
      .populate("medications")
      .sort({ validUntil: 1 });

    res.json(prescriptions);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server Error", error: error.message });
  }
};

// @desc    Get prescriptions needing refill
// @route   GET /api/prescriptions/refill-needed
// @access  Private
export const getPrescriptionsNeedingRefill = async (req, res) => {
  try {
    const userId = req.user.id;
    const days = parseInt(req.query.days) || 30;

    const endDate = new Date();
    endDate.setDate(endDate.getDate() + days);

    const prescriptions = await Prescription.find({
      patientId: userId,
      status: "active",
      validUntil: { $gte: new Date(), $lte: endDate },
      "medications": {
        $elemMatch: {
          "refills.allowed": { $gt: 0 },
          $expr: { $gt: ["$refills.used", "$refills.allowed"] },
        },
      },
    })
      .populate("doctorId", "firstName lastName specialty")
      .populate("medications")
      .sort({ validUntil: 1 });

    res.json(prescriptions);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server Error", error: error.message });
  }
};

// @desc    Process prescription refill
// @route   POST /api/prescriptions/:id/refill
// @access  Private
export const processRefill = async (req, res) => {
  try {
    const { medicationId, pharmacy, notes } = req.body;
    const prescription = await Prescription.findById(req.params.id);

    if (!prescription) {
      return res.status(404).json({ message: "Prescription not found" });
    }

    // Check if prescription belongs to user
    if (prescription.patientId.toString() !== req.user.id) {
      return res.status(401).json({ message: "Not authorized" });
    }

    // Check if prescription is still valid
    if (!prescription.isValid()) {
      return res.status(400).json({ message: "Prescription is no longer valid" });
    }

    // Process refill
    await prescription.processRefill(medicationId);

    // Update pharmacy if provided
    if (pharmacy) {
      prescription.pharmacy = { ...prescription.pharmacy, ...pharmacy };
      await prescription.save();
    }

    const updatedPrescription = await Prescription.findById(prescription._id)
      .populate("doctorId", "firstName lastName specialty")
      .populate("medications");

    res.json({
      message: "Refill processed successfully",
      prescription: updatedPrescription,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server Error", error: error.message });
  }
};

// @desc    Get prescription interactions
// @route   POST /api/prescriptions/check-interactions
// @access  Private
export const checkPrescriptionInteractions = async (req, res) => {
  try {
    const { prescriptionIds } = req.body;

    if (!prescriptionIds || prescriptionIds.length < 2) {
      return res.status(400).json({
        message: "Please provide at least 2 prescriptions to check interactions",
      });
    }

    const prescriptions = await Prescription.find({
      _id: { $in: prescriptionIds },
      patientId: req.user.id,
    }).populate("medications");

    if (prescriptions.length !== prescriptionIds.length) {
      return res.status(404).json({
        message: "One or more prescriptions not found",
      });
    }

    // Check for interactions between all medications
    const allMedications = prescriptions.reduce((meds, prescription) => {
      return meds.concat(prescription.medications);
    }, []);

    const interactions = [];
    for (let i = 0; i < allMedications.length; i++) {
      for (let j = i + 1; j < allMedications.length; j++) {
        const med1 = allMedications[i];
        const med2 = allMedications[j];

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

// @desc    Transfer prescription
// @route   POST /api/prescriptions/:id/transfer
// @access  Private
export const transferPrescription = async (req, res) => {
  try {
    const { newPharmacy, reason } = req.body;
    const prescription = await Prescription.findById(req.params.id);

    if (!prescription) {
      return res.status(404).json({ message: "Prescription not found" });
    }

    // Check if prescription belongs to user
    if (prescription.patientId.toString() !== req.user.id) {
      return res.status(401).json({ message: "Not authorized" });
    }

    // Update pharmacy
    prescription.pharmacy = newPharmacy;
    if (reason) {
      prescription.notes = (prescription.notes || "") + `\n\nTransfer reason: ${reason}`;
    }

    await prescription.save();

    const updatedPrescription = await Prescription.findById(prescription._id)
      .populate("doctorId", "firstName lastName specialty")
      .populate("medications");

    res.json({
      message: "Prescription transferred successfully",
      prescription: updatedPrescription,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server Error", error: error.message });
  }
};