import mongoose from "mongoose";

const documentSchema = new mongoose.Schema({
  fileName: { type: String, required: true },
  originalName: { type: String, required: true },
  fileId: { type: mongoose.Schema.Types.ObjectId, required: true }, // GridFS file ID
  size: { type: Number, required: true },
  mimeType: { type: String, required: true },
  uploadDate: { type: Date, default: Date.now },
  description: { type: String, default: "" },
});

const reportSchema = new mongoose.Schema({
  patientName: { type: String, required: true },
  reportType: { type: String, required: true },
  date: { type: Date, default: Date.now },
  doctorName: { type: String },
  description: { type: String, default: "" },
  documents: [documentSchema],
});

const Report = mongoose.model("Report", reportSchema);
export default Report;
