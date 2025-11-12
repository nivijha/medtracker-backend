import { GridFSBucket } from "mongodb";
import Report from "../models/Report.js";
import mongoose from "mongoose";

// @desc    Upload a file for a medical report
// @route   POST /api/upload
// @access  Private
export const uploadFile = async (req, res) => {
  try {
    // Check if file was uploaded
    if (!req.file) {
      return res.status(400).json({ message: "No file uploaded" });
    }

    const { reportId, description, category, doctorName, reportDate } = req.body;
    const userId = req.user.id;
    const file = req.file;

    // Initialize GridFS bucket
    const db = mongoose.connection.db;
    const bucket = new GridFSBucket(db, { bucketName: 'reports' });

    // Create a unique filename
    const fileName = `${Date.now()}-${file.originalname}`;

    // Create upload stream to GridFS
    const uploadStream = bucket.openUploadStream(fileName, {
      metadata: {
        originalName: file.originalname,
        mimeType: file.mimetype,
        uploadedBy: userId,
        uploadDate: new Date(),
      },
    });

    // Store file in GridFS
    await new Promise((resolve, reject) => {
      uploadStream.end(file.buffer);
      uploadStream.on('finish', resolve);
      uploadStream.on('error', reject);
    });

    // Find or create report
    let report;
    if (reportId) {
      report = await Report.findById(reportId);
      
      if (!report) {
        return res.status(404).json({ message: "Report not found" });
      }
      
      // Check if report belongs to user
      if (report.patientName && report.patientName !== userId) {
        return res.status(401).json({ message: "Not authorized" });
      }
      
      // Update report with file information
      report.documents = report.documents || [];
      report.documents.push({
        fileName,
        originalName: file.originalname,
        fileId: uploadStream.id,
        size: file.size,
        mimeType: file.mimetype,
        uploadDate: new Date(),
        description: description || "",
      });
      
      // Update other fields if provided
      if (description) report.description = description;
      if (category) report.reportType = category;
      if (doctorName) report.doctorName = doctorName;
      if (reportDate) report.date = new Date(reportDate);
      
      await report.save();
    } else {
      // Create new report with file
      report = await Report.create({
        patientName: userId,
        reportType: category || "General",
        date: reportDate ? new Date(reportDate) : new Date(),
        doctorName: doctorName || "",
        description: description || "",
        documents: [{
          fileName,
          originalName: file.originalname,
          fileId: uploadStream.id,
          size: file.size,
          mimeType: file.mimetype,
          uploadDate: new Date(),
          description: description || "",
        }],
      });
    }

    res.status(201).json({
      message: "File uploaded successfully",
      report,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server Error", error: error.message });
  }
};

// @desc    Get all uploaded files for a user
// @route   GET /api/upload/files
// @access  Private
export const getUploadedFiles = async (req, res) => {
  try {
    const userId = req.user.id;
    const { page = 1, limit = 10, category } = req.query;

    // Build query
    const query = { patientName: userId };
    
    if (category && category !== "all") {
      query.reportType = category;
    }

    // Execute query with pagination
    const reports = await Report.find(query)
      .sort({ date: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    // Get total count for pagination
    const total = await Report.countDocuments(query);

    // Extract all documents from reports
    const allFiles = [];
    reports.forEach(report => {
      if (report.documents && report.documents.length > 0) {
        report.documents.forEach(doc => {
          allFiles.push({
            reportId: report._id,
            fileId: doc._id, // Use the subdocument ID as fileId for finding the document
            gridFSId: doc.fileId, // Store the GridFS ID separately for file operations
            reportType: report.reportType,
            reportDate: report.date,
            doctorName: report.doctorName,
            description: report.description,
            fileName: doc.fileName,
            originalName: doc.originalName,
            filePath: doc.filePath,
            size: doc.size,
            mimeType: doc.mimeType,
            uploadDate: doc.uploadDate,
            fileDescription: doc.description,
            status: report.status || 'pending', // Add status field
          });
        });
      }
    });

    console.log("Final files array being sent:", allFiles); // Debug log
    res.json({
      files: allFiles,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server Error", error: error.message });
  }
};

// @desc    Download a file
// @route   GET /api/upload/files/:reportId/:fileId/download
// @access  Private
export const downloadFile = async (req, res) => {
  try {
    const { reportId, fileId } = req.params;
    const userId = req.user.id;

    // Find report
    const report = await Report.findById(reportId);
    
    if (!report) {
      return res.status(404).json({ message: "Report not found" });
    }
    
    // Check if report belongs to user
    if (report.patientName !== userId) {
      return res.status(401).json({ message: "Not authorized" });
    }
    
    // Find file in report
    const file = report.documents.id(fileId);
    
    if (!file) {
      return res.status(404).json({ message: "File not found" });
    }
    
    // Initialize GridFS bucket
    const db = mongoose.connection.db;
    const bucket = new GridFSBucket(db, { bucketName: 'reports' });
    
    // Set headers for file download
    res.setHeader("Content-Disposition", `attachment; filename="${file.originalName}"`);
    res.setHeader("Content-Type", file.mimeType || "application/octet-stream");
    
    // Stream file from GridFS
    const downloadStream = bucket.openDownloadStream(file.fileId);
    downloadStream.pipe(res);
    
    downloadStream.on('error', (error) => {
      console.error('Download error:', error);
      res.status(500).json({ message: "Error downloading file" });
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server Error", error: error.message });
  }
};

// @desc    View a file (inline display)
// @route   GET /api/upload/files/:reportId/:fileId/view
// @access  Private
export const viewFile = async (req, res) => {
  try {
    const { reportId, fileId } = req.params;
    const userId = req.user.id;

    // Find report
    const report = await Report.findById(reportId);
    
    if (!report) {
      return res.status(404).json({ message: "Report not found" });
    }
    
    // Check if report belongs to user
    if (report.patientName !== userId) {
      return res.status(401).json({ message: "Not authorized" });
    }
    
    // Find file in report
    const file = report.documents.id(fileId);
    
    if (!file) {
      return res.status(404).json({ message: "File not found" });
    }
    
    // Initialize GridFS bucket
    const db = mongoose.connection.db;
    const bucket = new GridFSBucket(db, { bucketName: 'reports' });
    
    // Set headers for inline viewing (not download)
    res.setHeader("Content-Disposition", `inline; filename="${file.originalName}"`);
    res.setHeader("Content-Type", file.mimeType || "application/octet-stream");
    
    // Stream file from GridFS
    const downloadStream = bucket.openDownloadStream(file.fileId);
    downloadStream.pipe(res);
    
    downloadStream.on('error', (error) => {
      console.error('View error:', error);
      res.status(500).json({ message: "Error viewing file" });
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server Error", error: error.message });
  }
};

// @desc    Delete a file
// @route   DELETE /api/upload/files/:reportId/:fileId
// @access  Private
export const deleteFile = async (req, res) => {
  try {
    const { reportId, fileId } = req.params;
    const userId = req.user.id;

    // Find report
    const report = await Report.findById(reportId);
    
    if (!report) {
      return res.status(404).json({ message: "Report not found" });
    }
    
    // Check if report belongs to user
    if (report.patientName !== userId) {
      return res.status(401).json({ message: "Not authorized" });
    }
    
    // Find file in report
    const file = report.documents.id(fileId);
    
    if (!file) {
      return res.status(404).json({ message: "File not found" });
    }
    
    // Initialize GridFS bucket
    const db = mongoose.connection.db;
    const bucket = new GridFSBucket(db, { bucketName: 'reports' });
    
    // Delete file from GridFS
    await bucket.delete(file.fileId);
    
    // Remove file from report
    report.documents.pull(fileId);
    await report.save();
    
    res.json({ message: "File deleted successfully" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server Error", error: error.message });
  }
};

// @desc    Get file by ID
// @route   GET /api/upload/files/:reportId/:fileId
// @access  Private
export const getFileById = async (req, res) => {
  try {
    const { reportId, fileId } = req.params;
    const userId = req.user.id;

    // Find report
    const report = await Report.findById(reportId);
    
    if (!report) {
      return res.status(404).json({ message: "Report not found" });
    }
    
    // Check if report belongs to user
    if (report.patientName !== userId) {
      return res.status(401).json({ message: "Not authorized" });
    }
    
    // Find file in report
    const file = report.documents.id(fileId);
    
    if (!file) {
      return res.status(404).json({ message: "File not found" });
    }
    
    res.json(file);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server Error", error: error.message });
  }
};

// @desc    Update file metadata
// @route   PUT /api/upload/files/:reportId/:fileId
// @access  Private
export const updateFileMetadata = async (req, res) => {
  try {
    const { reportId, fileId } = req.params;
    const { description } = req.body;
    const userId = req.user.id;

    // Find report
    const report = await Report.findById(reportId);
    
    if (!report) {
      return res.status(404).json({ message: "Report not found" });
    }
    
    // Check if report belongs to user
    if (report.patientName !== userId) {
      return res.status(401).json({ message: "Not authorized" });
    }
    
    // Find file in report
    const file = report.documents.id(fileId);
    
    if (!file) {
      return res.status(404).json({ message: "File not found" });
    }
    
    // Update file description
    if (description !== undefined) {
      file.description = description;
      await report.save();
    }
    
    res.json({
      message: "File metadata updated successfully",
      file,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server Error", error: error.message });
  }
};