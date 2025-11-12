import mongoose from "mongoose";

const medicationSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    dosage: {
      type: String,
      required: true,
      trim: true,
    },
    frequency: {
      type: String,
      required: true,
      enum: ["Once daily", "Twice daily", "Three times daily", "Four times daily", "As needed", "Weekly", "Monthly"],
    },
    timeOfDay: {
      type: [String],
      enum: ["Morning", "Afternoon", "Evening", "Night", "With meals", "Before meals", "After meals"],
    },
    prescribedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Doctor",
      required: false,
    },
    doctorName: {
      type: String,
      required: false,
      trim: true,
    },
    startDate: {
      type: Date,
      required: true,
    },
    endDate: {
      type: Date,
      required: false,
    },
    nextRefill: {
      type: Date,
      required: false,
    },
    remainingSupply: {
      type: Number,
      required: false,
      min: 0,
    },
    status: {
      type: String,
      enum: ["active", "completed", "paused", "refill-soon", "expired"],
      default: "active",
    },
    notes: {
      type: String,
      trim: true,
    },
    reminders: {
      enabled: {
        type: Boolean,
        default: true,
      },
      times: [{
        type: String, // Store times like "08:00", "14:00", "20:00"
      }],
    },
    interactions: [{
      medication: String,
      severity: {
        type: String,
        enum: ["mild", "moderate", "severe"],
      },
      description: String,
    }],
  },
  { timestamps: true }
);

// Calculate remaining days until refill is needed
medicationSchema.methods.getDaysUntilRefill = function() {
  if (!this.nextRefill) return null;
  const today = new Date();
  const diffTime = this.nextRefill - today;
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
};

// Check if medication needs refill soon (within 7 days)
medicationSchema.methods.needsRefillSoon = function() {
  const daysUntilRefill = this.getDaysUntilRefill();
  return daysUntilRefill !== null && daysUntilRefill <= 7 && daysUntilRefill >= 0;
};

// Update status based on dates
medicationSchema.methods.updateStatus = function() {
  const today = new Date();
  
  if (this.endDate && today > this.endDate) {
    this.status = "completed";
  } else if (this.needsRefillSoon()) {
    this.status = "refill-soon";
  } else if (this.nextRefill && today > this.nextRefill) {
    this.status = "expired";
  } else {
    this.status = "active";
  }
  
  return this.save();
};

const Medication = mongoose.model("Medication", medicationSchema);
export default Medication;