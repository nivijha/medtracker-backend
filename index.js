import dotenv from "dotenv";
dotenv.config();

import express from "express";
import cors from "cors";
import mongoose from "mongoose";
import connectDB from "./config/db.js";
// import testRoutes from "./routes/testRoutes.js";
import authRoutes from "./routes/authRoutes.js";
import reportRoutes from "./routes/reportRoutes.js";
import appointmentRoutes from "./routes/appointmentRoutes.js";
import medicationRoutes from "./routes/medicationRoutes.js";
import activityRoutes from "./routes/activityRoutes.js";
import profileRoutes from "./routes/profileRoutes.js";



// Initialize app
const app = express();

const allowedOrigins = [
  "http://localhost:3000",
  "https://medtracker-frontend.vercel.app" 
];

app.use(
  cors({
    origin: allowedOrigins,
    methods: ["GET", "POST", "PUT", "DELETE"],
    credentials: true,
  })
);


app.use(express.json());

// Connect to MongoDB
connectDB();

// Base route to verify server
app.get("/", (req, res) => {
  res.send("MedTracker API is running...");
});

// API Routes
// app.use("/api/test", testRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/reports", reportRoutes);
app.use("/api/appointments", appointmentRoutes);
app.use("/api/medications", medicationRoutes);
app.use("/api/activity", activityRoutes);
app.use("/api/profile", profileRoutes);

// Start server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
