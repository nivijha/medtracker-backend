import mongoose from "mongoose";

const reportSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    type: {
      type: String,
      enum: ["lab", "imaging", "pathology", "cardiology", "other"],
      required: true,
    },

    fileUrl: {
      type: String,
      required: true,
    },

    cloudinaryId: {
      type: String,
      required: true,
    },

    description: {
      type: String,
      trim: true,
    },

    doctorName: {
      type: String,
      trim: true,
    },

    reportDate: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);

export default mongoose.model("Report", reportSchema);
