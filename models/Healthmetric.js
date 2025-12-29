import mongoose from "mongoose";

const healthMetricSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    },

    weight: {
      type: Number
    },

    bloodPressure: {
      type: String
    },

    sugarLevel: {
      type: Number
    },

    recordedAt: {
      type: Date,
      default: Date.now
    }
  },
  { timestamps: true }
);

export default mongoose.model("HealthMetric", healthMetricSchema);
