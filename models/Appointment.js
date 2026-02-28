import mongoose from "mongoose";

const appointmentSchema = new mongoose.Schema(
  {
    user: {
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

    appointmentDateTime: { type: Date },

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
