import Report from "../models/Report.js";
import cloudinary from "../config/cloudinary.js";

const uploadReport = async (req, res) => {
  try {
    const { type, description, doctorName } = req.body;

    if (!type || !req.file) {
      return res.status(400).json({
        message: "Report type and file are required",
      });
    }

    const report = await Report.create({
      userId: req.user.id,
      type,
      fileUrl: req.file.path,
      cloudinaryId: req.file.filename,
      description,
      doctorName,
    });

    res.status(201).json({
      message: "Report uploaded successfully",
      report,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }

  console.log("REQ FILE:", req.file);
  console.log("REQ BODY:", req.body);
};

const getMyReports = async (req, res) => {
  try {
    const reports = await Report.find({ userId: req.user.id }).sort({
      createdAt: -1,
    });

    res.json(reports);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const deleteReport = async (req, res) => {
  try {
    const report = await Report.findById(req.params.id);

    if (!report) {
      return res.status(404).json({ message: "Report not found" });
    }

    if (report.userId.toString() !== req.user.id) {
      return res.status(403).json({ message: "Not authorized" });
    }

    // DELETE FROM CLOUDINARY
    await cloudinary.uploader.destroy(report.cloudinaryId);

    // DELETE FROM DB
    await report.deleteOne();

    res.json({ message: "Report deleted successfully" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export { uploadReport, getMyReports, deleteReport };
