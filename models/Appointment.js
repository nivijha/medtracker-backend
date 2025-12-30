import mongoose from "mongoose";

const appointmentSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    doctorName: {
      type: String,
      required: true,
      trim: true,
    },

    specialty: {
      type: String,
      trim: true,
    },

    hospital: {
      type: String,
      trim: true,
    },

    date: {
      type: Date,
      required: true,
    },

    time: {
      type: String,
      required: true,
    },

    notes: {
      type: String,
    },

    status: {
      type: String,
      enum: ["scheduled", "cancelled", "completed"],
      default: "scheduled",
    },
  },
  { timestamps: true }
);

export default mongoose.model("Appointment", appointmentSchema);
