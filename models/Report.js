import mongoose from "mongoose";

const reportSchema = new mongoose.Schema(
  {
    user: {
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

    title: {
      type: String,
      trim: true,
    },

    originalFilename: {
      type: String,
      trim: true,
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
      required: true,
    },

    summary: {
      type: String,
    },

    summaryGeneratedAt: {
      type: Date,
    },
  },
  { timestamps: true }
);

reportSchema.index({ user: 1, createdAt: -1 });

export default mongoose.model("Report", reportSchema);
