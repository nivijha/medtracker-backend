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

    // mimeType: {
    //   type: String,
    // },

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
  },
  { timestamps: true }
);

export default mongoose.model("Report", reportSchema);
