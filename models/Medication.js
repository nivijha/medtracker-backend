import mongoose from "mongoose";

const medicationSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    },

    name: {
      type: String,
      required: true
    },

    dosage: {
      type: String,
      required: true
    },

    frequency: {
      type: String,
      required: true
    },

    startDate: {
      type: Date,
      required: true
    },

    endDate: {
      type: Date
    }
  },
  { timestamps: true }
);

export default mongoose.model("Medication", medicationSchema);
