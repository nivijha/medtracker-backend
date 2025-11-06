import mongoose from "mongoose";

const reportSchema = new mongoose.Schema({
  patientName: { type: String, required: true },
  reportType: { type: String, required: true },
  date: { type: Date, default: Date.now },
  doctorName: { type: String },
});

const Report = mongoose.model("Report", reportSchema);
export default Report;
