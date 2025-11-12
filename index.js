import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import mongoose from "mongoose";
import connectDB from "./config/db.js";
import testRoutes from "./routes/testRoutes.js";
import authRoutes from "./routes/authRoutes.js";
import reportRoutes from "./routes/reportRoutes.js";
import medicationRoutes from "./routes/medicationRoutes.js";
import appointmentRoutes from "./routes/appointmentRoutes.js";
import userProfileRoutes from "./routes/userProfileRoutes.js";
import healthMetricsRoutes from "./routes/healthMetricsRoutes.js";
import prescriptionRoutes from "./routes/prescriptionRoutes.js";
import doctorRoutes from "./routes/doctorRoutes.js";
import fileUploadRoutes from "./routes/fileUploadRoutes.js";
import notificationRoutes from "./routes/notificationRoutes.js";
import dataExportRoutes from "./routes/dataExportRoutes.js";
import medicationInteractionRoutes from "./routes/medicationInteractionRoutes.js";
import dataVisualizationRoutes from "./routes/dataVisualizationRoutes.js";

// Load environment variables
dotenv.config();

// Initialize app
const app = express();

const allowedOrigins = [
  "http://localhost:3000",
  "https://medtracker-frontend.vercel.app" // ✅ your deployed frontend
];

app.use(
  cors({
    origin: allowedOrigins,
    methods: ["GET", "POST", "PUT", "DELETE"],
    credentials: true,
  })
);


app.use(express.json());

// ✅ Connect to MongoDB
connectDB();

// ✅ Base route to verify server
app.get("/", (req, res) => {
  res.send("✅ MedTracker API is running... (v2)");
});

// ✅ API Routes
app.use("/api/test", testRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/reports", reportRoutes);
app.use("/api/medications", medicationRoutes);
app.use("/api/appointments", appointmentRoutes);
app.use("/api/profile", userProfileRoutes);
app.use("/api/health-metrics", healthMetricsRoutes);
app.use("/api/prescriptions", prescriptionRoutes);
app.use("/api/doctors", doctorRoutes);
app.use("/api/upload", fileUploadRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/export", dataExportRoutes);
app.use("/api/medication-interactions", medicationInteractionRoutes);
app.use("/api/visualization", dataVisualizationRoutes);

// ✅ Start server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
