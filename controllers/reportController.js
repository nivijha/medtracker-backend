import Report from "../models/Report.js";
import cloudinary from "../config/cloudinary.js";

/**
 * @desc    Upload a medical report
 * @route   POST /api/reports/upload
 * @access  Private
 */
const uploadReport = async (req, res, next) => {
  try {
    const { type, description, doctorName } = req.body;

    if (!type || !req.file) {
      return res.status(400).json({
        message: "Report type and file are required",
      });
    }

    const report = await Report.create({
      user: req.user.id,
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
    next(error);
  }
};

/**
 * @desc    Get logged-in user's reports
 * @route   GET /api/reports/my
 * @access  Private
 */
const getMyReports = async (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const total = await Report.countDocuments({ user: req.user.id });
    const reports = await Report.find({ user: req.user.id })
      .populate("user", "name email")
      .sort({
        createdAt: -1,
      })
      .skip(skip)
      .limit(limit);

    res.json({
      reports,
      pagination: {
        total,
        page,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Delete a report
 * @route   DELETE /api/reports/:id
 * @access  Private
 */
const deleteReport = async (req, res, next) => {
  try {
    const report = await Report.findById(req.params.id);

    if (!report) {
      return res.status(404).json({ message: "Report not found" });
    }

    if (report.user.toString() !== req.user.id) {
      return res.status(403).json({ message: "Not authorized" });
    }

    // DELETE FROM CLOUDINARY
    if (report.cloudinaryId) {
      await cloudinary.uploader.destroy(report.cloudinaryId);
    }

    // DELETE FROM DB
    await report.deleteOne();

    res.json({ message: "Report deleted successfully" });
  } catch (error) {
    next(error);
  }
};

export { uploadReport, getMyReports, deleteReport };
