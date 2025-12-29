import mongoose from "mongoose";

const appointmentSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    },

    doctorName: {
      type: String,
      required: true
    },

    purpose: {
      type: String
    },

    date: {
      type: Date,
      required: true
    },

    time: {
      type: String,
      required: true
    },

    notes: {
      type: String
    }
  },
  { timestamps: true }
);

export default mongoose.model("Appointment", appointmentSchema);
