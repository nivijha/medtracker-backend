import express from "express";
import multer from "multer";
import {
  uploadFile,
  getUploadedFiles,
  downloadFile,
  deleteFile,
  getFileById,
  updateFileMetadata,
  viewFile,
} from "../controllers/fileUploadController.js";
import protect from "../middleware/authMiddleware.js";

// Configure multer for file uploads using memory storage
// Files will be stored in memory and then uploaded to GridFS
const storage = multer.memoryStorage();

// File filter for medical reports
const fileFilter = (req, file, cb) => {
  // Accept common medical document types
  const allowedMimes = [
    "application/pdf",
    "image/jpeg",
    "image/png",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ];
  
  if (allowedMimes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error("Only PDF, JPEG, PNG, and Word documents are allowed"), false);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB max file size
  },
});

const router = express.Router();

// All file upload routes are protected
router.use(protect);

// @route   POST /api/upload
// @desc    Upload a file for a medical report
// @access  Private
router.post("/", upload.single("file"), uploadFile);

// @route   GET /api/upload/files
// @desc    Get all uploaded files for a user
// @access  Private
router.get("/files", getUploadedFiles);

// @route   GET /api/upload/files/:reportId/:fileId/download
// @desc    Download a file
// @access  Private
router.get("/files/:reportId/:fileId/download", downloadFile);

// @route   GET /api/upload/files/:reportId/:fileId/view
// @desc    View a file inline
// @access  Private
router.get("/files/:reportId/:fileId/view", viewFile);

// @route   DELETE /api/upload/files/:reportId/:fileId
// @desc    Delete a file
// @access  Private
router.delete("/files/:reportId/:fileId", deleteFile);

// @route   GET /api/upload/files/:reportId/:fileId
// @desc    Get file by ID
// @access  Private
router.get("/files/:reportId/:fileId", getFileById);

// @route   PUT /api/upload/files/:reportId/:fileId
// @desc    Update file metadata
// @access  Private
router.put("/files/:reportId/:fileId", updateFileMetadata);

export default router;