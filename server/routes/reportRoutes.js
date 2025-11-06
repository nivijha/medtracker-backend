import express from "express";
import Report from "../models/Report.js";

const router = express.Router();

// GET all reports
router.get("/", async (req, res) => {
  try {
    const reports = await Report.find();
    res.json(reports);
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err.message });
  }
});

// POST a new report (for testing)
router.post("/add", async (req, res) => {
  try {
    const { patientName, reportType, doctorName } = req.body;
    const report = new Report({ patientName, reportType, doctorName });
    await report.save();
    res.status(201).json({ message: "Report added", report });
  } catch (err) {
    res.status(500).json({ message: "Error adding report", error: err.message });
  }
});

export default router;
