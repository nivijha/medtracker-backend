import express from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import {
  uploadFile,
  getUploadedFiles,
  downloadFile,
  deleteFile,
  getFileById,
  updateFileMetadata,
} from "../controllers/fileUploadController.js";
import protect from "../middleware/authMiddleware.js";

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    // Create uploads directory if it doesn't exist
    const uploadDir = "uploads/reports";
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    // Generate unique filename
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + "-" + file.originalname);
  },
});

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