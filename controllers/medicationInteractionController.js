import Medication from "../models/Medication.js";
import Prescription from "../models/Prescription.js";
import mongoose from "mongoose";

// @desc    Check for medication interactions
// @route   POST /api/medication-interactions/check
// @access  Private
export const checkMedicationInteractions = async (req, res) => {
  try {
    const { medicationIds, prescriptionIds } = req.body;
    const userId = req.user.id;

    if (!medicationIds || medicationIds.length < 2) {
      return res.status(400).json({
        message: "Please provide at least 2 medication IDs to check interactions",
      });
    }

    // Get medications
    const medications = await Medication.find({
      _id: { $in: medicationIds },
      userId,
    });

    if (medications.length !== medicationIds.length) {
      return res.status(404).json({
        message: "One or more medications not found",
      });
    }

    // Check for interactions between medications
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
              source: "user_medications",
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
              source: "user_medications",
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

// @desc    Check for prescription interactions
// @route   POST /api/medication-interactions/check-prescriptions
// @access  Private
export const checkPrescriptionInteractions = async (req, res) => {
  try {
    const { prescriptionIds } = req.body;
    const userId = req.user.id;

    if (!prescriptionIds || prescriptionIds.length < 2) {
      return res.status(400).json({
        message: "Please provide at least 2 prescription IDs to check interactions",
      });
    }

    // Get prescriptions
    const prescriptions = await Prescription.find({
      _id: { $in: prescriptionIds },
      patientId: userId,
    }).populate("medications");

    if (prescriptions.length !== prescriptionIds.length) {
      return res.status(404).json({
        message: "One or more prescriptions not found",
      });
    }

    // Check for interactions between all medications in all prescriptions
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
              source: "prescriptions",
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
              source: "prescriptions",
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

// @desc    Check for interactions between medications and prescriptions
// @route   POST /api/medication-interactions/check-mixed
// @access  Private
export const checkMixedInteractions = async (req, res) => {
  try {
    const { medicationIds, prescriptionIds } = req.body;
    const userId = req.user.id;

    if ((!medicationIds || medicationIds.length < 1) || (!prescriptionIds || prescriptionIds.length < 1)) {
      return res.status(400).json({
        message: "Please provide at least 1 medication ID and 1 prescription ID to check interactions",
      });
    }

    // Get medications and prescriptions
    const [medications, prescriptions] = await Promise.all([
      Medication.find({
        _id: { $in: medicationIds || [] },
        userId,
      }),
      Prescription.find({
        _id: { $in: prescriptionIds || [] },
        patientId: userId,
      }).populate("medications"),
    ]);

    // Check if all items were found
    const medNotFound = medicationIds ? 
      medicationIds.length - medications.length : 0;
    const presNotFound = prescriptionIds ? 
      prescriptionIds.length - prescriptions.length : 0;
    
    if (medNotFound > 0 || presNotFound > 0) {
      return res.status(404).json({
        message: "One or more medications or prescriptions not found",
      });
    }

    // Get all medications from prescriptions
    const prescriptionMeds = prescriptions.reduce((meds, prescription) => {
      return meds.concat(prescription.medications);
    }, []);

    // Combine all medications
    const allMedicationsCombined = [...medications, ...prescriptionMeds];

    // Check for interactions
    const interactions = [];
    for (let i = 0; i < allMedicationsCombined.length; i++) {
      for (let j = i + 1; j < allMedicationsCombined.length; j++) {
        const med1 = allMedicationsCombined[i];
        const med2 = allMedicationsCombined[j];

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
              source: "mixed",
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
              source: "mixed",
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

// @desc    Get interaction details for a medication
// @route   GET /api/medication-interactions/:medicationId
// @access  Private
export const getMedicationInteractions = async (req, res) => {
  try {
    const { medicationId } = req.params;
    const userId = req.user.id;

    // Get medication
    const medication = await Medication.findOne({
      _id: medicationId,
      userId,
    });

    if (!medication) {
      return res.status(404).json({ message: "Medication not found" });
    }

    res.json({
      medicationId: medication._id,
      medicationName: medication.name,
      interactions: medication.interactions || [],
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server Error", error: error.message });
  }
};

// @desc    Add interaction to a medication
// @route   POST /api/medication-interactions/:medicationId/interactions
// @access  Private
export const addMedicationInteraction = async (req, res) => {
  try {
    const { medicationId } = req.params;
    const { medication, severity, description } = req.body;
    const userId = req.user.id;

    // Validate required fields
    if (!medication || !severity || !description) {
      return res.status(400).json({
        message: "Medication, severity, and description are required",
      });
    }

    // Get medication
    const med = await Medication.findOne({
      _id: medicationId,
      userId,
    });

    if (!med) {
      return res.status(404).json({ message: "Medication not found" });
    }

    // Add interaction
    med.interactions = med.interactions || [];
    med.interactions.push({
      medication,
      severity,
      description,
    });

    await med.save();

    res.json({
      message: "Interaction added successfully",
      medication: med,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server Error", error: error.message });
  }
};

// @desc    Remove interaction from a medication
// @route   DELETE /api/medication-interactions/:medicationId/interactions/:interactionId
// @access  Private
export const removeMedicationInteraction = async (req, res) => {
  try {
    const { medicationId, interactionId } = req.params;
    const userId = req.user.id;

    // Get medication
    const medication = await Medication.findOne({
      _id: medicationId,
      userId,
    });

    if (!medication) {
      return res.status(404).json({ message: "Medication not found" });
    }

    // Remove interaction
    medication.interactions = medication.interactions || [];
    medication.interactions.pull({ _id: interactionId });

    await medication.save();

    res.json({
      message: "Interaction removed successfully",
      medication,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server Error", error: error.message });
  }
};

// @desc    Get common medication interactions
// @route   GET /api/medication-interactions/common
// @access  Public
export const getCommonInteractions = async (req, res) => {
  try {
    const { medicationName } = req.query;

    if (!medicationName) {
      return res.status(400).json({
        message: "Medication name is required",
      });
    }

    // In a real implementation, you would query a drug interaction database
    // For now, we'll return some common interactions
    const commonInteractions = [
      {
        medication: "Warfarin",
        interactsWith: ["Aspirin", "Ibuprofen", "Naproxen"],
        severity: "severe",
        description: "Increased risk of bleeding when taken together",
      },
      {
        medication: "Lisinopril",
        interactsWith: ["Potassium supplements", "NSAIDs"],
        severity: "moderate",
        description: "May increase potassium levels and cause kidney problems",
      },
      {
        medication: "Statins",
        interactsWith: ["Grapefruit juice", "Macrolide antibiotics"],
        severity: "moderate",
        description: "May increase risk of muscle damage and liver problems",
      },
      {
        medication: "SSRIs",
        interactsWith: ["MAOIs"],
        severity: "severe",
        description: "May cause serotonin syndrome when taken together",
      },
    ];

    // Find interactions for the specified medication
    const interactions = commonInteractions.filter(
      interaction => interaction.medication.toLowerCase() === medicationName.toLowerCase()
    );

    res.json({
      medicationName,
      interactions,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server Error", error: error.message });
  }
};