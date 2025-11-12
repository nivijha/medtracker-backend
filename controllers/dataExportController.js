import User from "../models/User.js";
import Medication from "../models/Medication.js";
import Appointment from "../models/Appointment.js";
import Prescription from "../models/Prescription.js";
import HealthMetrics from "../models/HealthMetrics.js";
import Report from "../models/Report.js";
import mongoose from "mongoose";
import fs from "fs";
import path from "path";
import archiver from "archiver";
import { format } from "date-fns";

// @desc    Export user data
// @route   POST /api/export
// @access  Private
export const exportUserData = async (req, res) => {
  try {
    const { 
      format: exportFormat = "json", 
      dataTypes = ["all"], 
      dateRange = { 
        startDate: null, 
        endDate: null 
      } 
    } = req.body;
    const userId = req.user.id;

    // Validate export format
    if (!["json", "csv", "pdf"].includes(exportFormat)) {
      return res.status(400).json({ 
        message: "Invalid export format. Supported formats: json, csv, pdf" 
      });
    }

    // Validate data types
    const validDataTypes = [
      "profile", "medications", "appointments", "prescriptions", 
      "healthMetrics", "reports", "all"
    ];
    
    const invalidDataTypes = dataTypes.filter(type => !validDataTypes.includes(type));
    if (invalidDataTypes.length > 0) {
      return res.status(400).json({ 
        message: `Invalid data types: ${invalidDataTypes.join(", ")}` 
      });
    }

    // Parse date range
    let startDate = null;
    let endDate = null;
    
    if (dateRange.startDate) {
      startDate = new Date(dateRange.startDate);
    }
    
    if (dateRange.endDate) {
      endDate = new Date(dateRange.endDate);
    }

    // Build date filter
    const dateFilter = {};
    if (startDate || endDate) {
      dateFilter.createdAt = {};
      if (startDate) dateFilter.createdAt.$gte = startDate;
      if (endDate) dateFilter.createdAt.$lte = endDate;
    }

    // Collect data based on requested types
    const exportData = {};

    // Get user profile
    if (dataTypes.includes("profile") || dataTypes.includes("all")) {
      const user = await User.findById(userId).select("-password");
      exportData.profile = {
        name: user.name,
        email: user.email,
        role: user.role,
        profile: user.profile,
        preferences: user.preferences,
        createdAt: user.createdAt,
      };
    }

    // Get medications
    if (dataTypes.includes("medications") || dataTypes.includes("all")) {
      const medications = await Medication.find({ 
        userId, 
        ...dateFilter 
      });
      exportData.medications = medications;
    }

    // Get appointments
    if (dataTypes.includes("appointments") || dataTypes.includes("all")) {
      const appointments = await Appointment.find({ 
        patientId: userId, 
        ...dateFilter 
      });
      exportData.appointments = appointments;
    }

    // Get prescriptions
    if (dataTypes.includes("prescriptions") || dataTypes.includes("all")) {
      const prescriptions = await Prescription.find({ 
        patientId: userId, 
        ...dateFilter 
      });
      exportData.prescriptions = prescriptions;
    }

    // Get health metrics
    if (dataTypes.includes("healthMetrics") || dataTypes.includes("all")) {
      const healthMetrics = await HealthMetrics.find({ 
        userId, 
        ...dateFilter 
      });
      exportData.healthMetrics = healthMetrics;
    }

    // Get reports
    if (dataTypes.includes("reports") || dataTypes.includes("all")) {
      const reports = await Report.find({ 
        patientName: userId, 
        ...dateFilter 
      });
      exportData.reports = reports;
    }

    // Export based on format
    if (exportFormat === "json") {
      // Set headers for JSON download
      res.setHeader("Content-Type", "application/json");
      res.setHeader("Content-Disposition", `attachment; filename="medtracker-data-${format(new Date(), "yyyy-MM-dd")}.json"`);
      
      return res.json(exportData);
    } else if (exportFormat === "csv") {
      // Create CSV content
      const csvContent = await generateCSV(exportData);
      
      // Set headers for CSV download
      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", `attachment; filename="medtracker-data-${format(new Date(), "yyyy-MM-dd")}.csv"`);
      
      return res.send(csvContent);
    } else if (exportFormat === "pdf") {
      // Create PDF content
      const pdfBuffer = await generatePDF(exportData);
      
      // Set headers for PDF download
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="medtracker-data-${format(new Date(), "yyyy-MM-dd")}.pdf"`);
      res.setHeader("Content-Length", pdfBuffer.length);
      
      return res.send(pdfBuffer);
    }

  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server Error", error: error.message });
  }
};

// @desc    Get export history
// @route   GET /api/export/history
// @access  Private
export const getExportHistory = async (req, res) => {
  try {
    const { page = 1, limit = 10 } = req.query;
    const userId = req.user.id;

    // In a real implementation, you would store export history in a database
    // For now, we'll return an empty array
    const history = [];
    
    res.json({
      history,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: 0,
        pages: 0,
      },
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server Error", error: error.message });
  }
};

// Helper function to generate CSV content
async function generateCSV(data) {
  let csvContent = "";
  
  // Profile data
  if (data.profile) {
    csvContent += "Profile\n";
    csvContent += "Name,Email,Role,Phone,Blood Type,Date of Birth,Gender\n";
    csvContent += `"${data.profile.name}","${data.profile.email}","${data.profile.role}","${data.profile.profile.phone || ""}","${data.profile.profile.bloodType || ""}","${data.profile.profile.dateOfBirth || ""}","${data.profile.profile.gender || ""}"\n`;
  }
  
  // Medications data
  if (data.medications && data.medications.length > 0) {
    csvContent += "\nMedications\n";
    csvContent += "Name,Dosage,Frequency,Start Date,End Date,Status,Doctor\n";
    
    for (const med of data.medications) {
      csvContent += `"${med.name}","${med.dosage}","${med.frequency}","${med.startDate}","${med.endDate || ""}","${med.status}","${med.doctorName || ""}"\n`;
    }
  }
  
  // Appointments data
  if (data.appointments && data.appointments.length > 0) {
    csvContent += "\nAppointments\n";
    csvContent += "Doctor,Specialty,Date,Time,Location,Status\n";
    
    for (const apt of data.appointments) {
      csvContent += `"${apt.doctorName}","${apt.specialty}","${apt.date}","${apt.time}","${apt.location}","${apt.status}"\n`;
    }
  }
  
  // Health metrics data
  if (data.healthMetrics && data.healthMetrics.length > 0) {
    csvContent += "\nHealth Metrics\n";
    csvContent += "Date,Weight,Blood Pressure,Heart Rate,Temperature\n";
    
    for (const metric of data.healthMetrics) {
      const bp = metric.bloodPressure ? 
        `${metric.bloodPressure.systolic}/${metric.bloodPressure.diastolic}` : "";
      const hr = metric.heartRate ? metric.heartRate.value : "";
      const temp = metric.temperature ? metric.temperature.value : "";
      
      csvContent += `"${metric.date}","${metric.weight?.value || ""}","${bp}","${hr}","${temp}"\n`;
    }
  }
  
  return csvContent;
}

// Helper function to generate PDF content
async function generatePDF(data) {
  // In a real implementation, you would use a PDF library like PDFKit
  // For now, we'll create a simple text-based PDF
  let pdfContent = "MedTracker Data Export\n\n";
  
  // Profile data
  if (data.profile) {
    pdfContent += "Profile\n";
    pdfContent += `Name: ${data.profile.name}\n`;
    pdfContent += `Email: ${data.profile.email}\n`;
    pdfContent += `Role: ${data.profile.role}\n`;
    pdfContent += `Phone: ${data.profile.profile.phone || "Not provided"}\n`;
    pdfContent += `Blood Type: ${data.profile.profile.bloodType || "Not provided"}\n`;
    pdfContent += `Date of Birth: ${data.profile.profile.dateOfBirth || "Not provided"}\n`;
    pdfContent += `Gender: ${data.profile.profile.gender || "Not provided"}\n\n`;
  }
  
  // Medications data
  if (data.medications && data.medications.length > 0) {
    pdfContent += "Medications\n";
    
    for (const med of data.medications) {
      pdfContent += `${med.name} - ${med.dosage} - ${med.frequency}\n`;
      pdfContent += `Start Date: ${med.startDate}\n`;
      pdfContent += `End Date: ${med.endDate || "Ongoing"}\n`;
      pdfContent += `Status: ${med.status}\n`;
      pdfContent += `Doctor: ${med.doctorName || "Not specified"}\n\n`;
    }
  }
  
  // Appointments data
  if (data.appointments && data.appointments.length > 0) {
    pdfContent += "Appointments\n";
    
    for (const apt of data.appointments) {
      pdfContent += `${apt.doctorName} - ${apt.specialty}\n`;
      pdfContent += `Date: ${apt.date}\n`;
      pdfContent += `Time: ${apt.time}\n`;
      pdfContent += `Location: ${apt.location}\n`;
      pdfContent += `Status: ${apt.status}\n\n`;
    }
  }
  
  // Health metrics data
  if (data.healthMetrics && data.healthMetrics.length > 0) {
    pdfContent += "Health Metrics\n";
    
    for (const metric of data.healthMetrics) {
      pdfContent += `Date: ${metric.date}\n`;
      
      if (metric.weight) {
        pdfContent += `Weight: ${metric.weight.value} ${metric.weight.unit}\n`;
      }
      
      if (metric.bloodPressure) {
        pdfContent += `Blood Pressure: ${metric.bloodPressure.systolic}/${metric.bloodPressure.diastolic}\n`;
      }
      
      if (metric.heartRate) {
        pdfContent += `Heart Rate: ${metric.heartRate.value} ${metric.heartRate.unit}\n`;
      }
      
      if (metric.temperature) {
        pdfContent += `Temperature: ${metric.temperature.value} ${metric.temperature.unit}\n`;
      }
      
      pdfContent += "\n";
    }
  }
  
  // Convert to buffer (in a real implementation, you would use a PDF library)
  return Buffer.from(pdfContent, "utf8");
}