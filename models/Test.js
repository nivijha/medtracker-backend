import mongoose from "mongoose";

const testSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    testName: {
      type: String,
      required: true,
      trim: true,
    },
    result: {
      type: String,
      required: true,
    },
    referenceRange: {
      type: String,
      required: true,
    },
    unit: {
      type: String,
      trim: true,
    },
    testDate: {
      type: Date,
      required: true,
    },
    status: {
      type: String,
      enum: ["Pending", "Completed", "Flagged"],
      default: "Completed",
    },
    notes: {
      type: String,
      trim: true,
    },
  },
  { timestamps: true }
);

testSchema.index({ user: 1, testDate: -1 });

export default mongoose.model("Test", testSchema);
