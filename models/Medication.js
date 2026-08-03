import mongoose from "mongoose";

const medicationSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    name: {
      type: String,
      required: true,
    },

    dosage: {
      type: String,
      required: true,
    },

    frequency: {
      type: String,
      required: true,
    },

    time: {
      type: String, // "08:00 AM"
      required: true,
    },

    prescribedBy: {
      type: String,
      required: true,
    },

    startDate: {
      type: Date,
      required: true,
    },

    endDate: {
      type: Date,
    },

    nextRefill: {
      type: Date,
    },

    notes: {
      type: String,
    },

    status: {
      type: String,
      enum: ["active", "completed", "discontinued"],
      default: "active",
    },

    takenToday: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

medicationSchema.index({ user: 1, createdAt: -1 });

export default mongoose.model("Medication", medicationSchema);
