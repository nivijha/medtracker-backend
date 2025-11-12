import mongoose from "mongoose";

const prescriptionSchema = new mongoose.Schema(
  {
    patientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    doctorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Doctor",
      required: true,
    },
    doctorName: {
      type: String,
      required: true,
      trim: true,
    },
    medications: [{
      name: {
        type: String,
        required: true,
        trim: true,
      },
      genericName: {
        type: String,
        trim: true,
      },
      dosage: {
        type: String,
        required: true,
        trim: true,
      },
      form: {
        type: String,
        enum: ["tablet", "capsule", "liquid", "injection", "cream", "ointment", "inhaler", "patch", "drops", "spray"],
        required: true,
      },
      strength: {
        value: Number,
        unit: String, // mg, mcg, ml, %
      },
      frequency: {
        type: String,
        required: true,
        trim: true,
      },
      route: {
        type: String,
        enum: ["oral", "topical", "injection", "inhalation", "nasal", "ocular", "otic", "rectal", "vaginal"],
        required: true,
      },
      duration: {
        value: Number,
        unit: {
          type: String,
          enum: ["days", "weeks", "months", "years"],
        },
      },
      quantity: {
        value: Number,
        unit: String, // tablets, ml, g, etc.
      },
      refills: {
        allowed: {
          type: Number,
          default: 0,
        },
        used: {
          type: Number,
          default: 0,
        },
      },
      instructions: {
        type: String,
        trim: true,
      },
      specialInstructions: {
        type: String,
        trim: true,
      },
      warnings: [String],
      sideEffects: [String],
      interactions: [{
        medication: String,
        severity: {
          type: String,
          enum: ["mild", "moderate", "severe"],
        },
        description: String,
      }],
      ndc: String, // National Drug Code
      rxNorm: String, // RxNorm identifier
      active: {
        type: Boolean,
        default: true,
      },
    }],
    diagnosis: [{
      code: String, // ICD-10 code
      description: String,
      primary: Boolean,
    }],
    symptoms: [String],
    notes: {
      type: String,
      trim: true,
    },
    datePrescribed: {
      type: Date,
      required: true,
      default: Date.now,
    },
    validFrom: {
      type: Date,
      required: true,
      default: Date.now,
    },
    validUntil: {
      type: Date,
      required: true,
    },
    pharmacy: {
      name: String,
      address: {
        street: String,
        city: String,
        state: String,
        zipCode: String,
        country: String,
      },
      phone: String,
      fax: String,
    },
    status: {
      type: String,
      enum: ["active", "completed", "expired", "cancelled", "on_hold"],
      default: "active",
    },
    priority: {
      type: String,
      enum: ["routine", "urgent", "stat"],
      default: "routine",
    },
    substitutions: {
      allowed: {
        type: Boolean,
        default: true,
      },
      brandOnly: {
        type: Boolean,
        default: false,
      },
    },
    insurance: {
      provider: String,
      policyNumber: String,
      groupNumber: String,
      bin: String,
      pcn: String,
      priorAuth: {
        required: Boolean,
        approved: Boolean,
        authNumber: String,
        expirationDate: Date,
      },
    },
    cost: {
      estimated: Number,
      actual: Number,
      currency: {
        type: String,
        default: "USD",
      },
      insuranceCovered: Number,
      patientResponsibility: Number,
    },
    payment: {
      status: {
        type: String,
        enum: ["pending", "paid", "partial", "refunded"],
        default: "pending",
      },
      method: String,
      transactionId: String,
    },
    documents: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: "Report",
    }],
    followUp: {
      required: {
        type: Boolean,
        default: false,
      },
      date: Date,
      notes: String,
    },
    electronic: {
      transmitted: {
        type: Boolean,
        default: false,
      },
      transmittedTo: String,
      transmittedDate: Date,
      confirmationNumber: String,
    },
    verification: {
      verified: {
        type: Boolean,
        default: false,
      },
      verifiedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
      verifiedDate: Date,
      method: {
        type: String,
        enum: ["phone", "video", "in_person"],
      },
    },
    compliance: {
      adherenceRate: Number, // Percentage
      missedDoses: Number,
      lastTaken: Date,
      reminders: {
        enabled: {
          type: Boolean,
          default: true,
        },
        times: [String],
      },
    },
  },
  { timestamps: true }
);

// Virtual for prescription number
prescriptionSchema.virtual('prescriptionNumber').get(function() {
  return `RX${this._id.toString().slice(-8).toUpperCase()}`;
});

// Method to check if prescription is still valid
prescriptionSchema.methods.isValid = function() {
  const now = new Date();
  return this.status === "active" && 
         now >= this.validFrom && 
         now <= this.validUntil;
};

// Method to check if refills are available
prescriptionSchema.methods.hasRefillsAvailable = function() {
  return this.medications.some(med => 
    med.active && 
    med.refills.allowed > med.refills.used
  );
};

// Method to get next refill date
prescriptionSchema.methods.getNextRefillDate = function() {
  const activeMeds = this.medications.filter(med => med.active);
  if (activeMeds.length === 0) return null;
  
  // Calculate based on duration and last fill date
  // This is a simplified calculation
  const lastFill = this.datePrescribed;
  const maxDuration = Math.max(...activeMeds.map(med => 
    med.duration?.value || 30
  ));
  
  const nextRefill = new Date(lastFill);
  const unit = activeMeds[0].duration?.unit || "days";
  
  if (unit === "days") {
    nextRefill.setDate(nextRefill.getDate() + maxDuration);
  } else if (unit === "weeks") {
    nextRefill.setDate(nextRefill.getDate() + (maxDuration * 7));
  } else if (unit === "months") {
    nextRefill.setMonth(nextRefill.getMonth() + maxDuration);
  }
  
  return nextRefill;
};

// Method to update medication status
prescriptionSchema.methods.updateMedicationStatus = function(medicationId, status) {
  const medication = this.medications.id(medicationId);
  if (medication) {
    medication.active = status === "active";
  }
  
  // Update overall prescription status if all medications are inactive
  const hasActiveMeds = this.medications.some(med => med.active);
  if (!hasActiveMeds) {
    this.status = "completed";
  }
  
  return this.save();
};

// Method to process refill
prescriptionSchema.methods.processRefill = function(medicationId) {
  const medication = this.medications.id(medicationId);
  if (!medication) {
    throw new Error("Medication not found");
  }
  
  if (medication.refills.used >= medication.refills.allowed) {
    throw new Error("No refills remaining");
  }
  
  medication.refills.used += 1;
  
  // Update compliance tracking
  if (!this.compliance) {
    this.compliance = {
      adherenceRate: 0,
      missedDoses: 0,
      lastTaken: new Date(),
    };
  }
  
  return this.save();
};

// Method to check for drug interactions
prescriptionSchema.methods.checkInteractions = function(otherMedications) {
  const interactions = [];
  
  this.medications.forEach(med => {
    otherMedications.forEach(otherMed => {
      if (med.interactions) {
        const interaction = med.interactions.find(
          inter => inter.medication.toLowerCase() === otherMed.name.toLowerCase()
        );
        
        if (interaction) {
          interactions.push({
            medication1: med.name,
            medication2: otherMed.name,
            severity: interaction.severity,
            description: interaction.description,
          });
        }
      }
    });
  });
  
  return interactions;
};

const Prescription = mongoose.model("Prescription", prescriptionSchema);
export default Prescription;