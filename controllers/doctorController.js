import Doctor from "../models/Doctor.js";
import mongoose from "mongoose";

// @desc    Get all doctors
// @route   GET /api/doctors
// @access  Public
export const getDoctors = async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 10, 
      specialty, 
      location, 
      search,
      availableOnly = false 
    } = req.query;

    // Build query
    const query = {};
    
    // Specialty filter
    if (specialty) {
      query.specialty = { $regex: specialty, $options: "i" };
    }

    // Location filter
    if (location) {
      query.$or = [
        { "practice.address.city": { $regex: location, $options: "i" } },
        { "practice.address.state": { $regex: location, $options: "i" } },
        { "locations.address.city": { $regex: location, $options: "i" } },
        { "locations.address.state": { $regex: location, $options: "i" } },
      ];
    }

    // Search filter
    if (search) {
      query.$or = query.$or || [];
      query.$or.push(
        { firstName: { $regex: search, $options: "i" } },
        { lastName: { $regex: search, $options: "i" } },
        { specialty: { $regex: search, $options: "i" } },
        { "specialties": { $regex: search, $options: "i" } },
        { "procedures.name": { $regex: search, $options: "i" } },
        { "conditions.name": { $regex: search, $options: "i" } },
      );
    }

    // Available only filter
    if (availableOnly === "true") {
      query.status = "active";
    }

    // Execute query with pagination
    const doctors = await Doctor.find(query)
      .select("firstName lastName specialty rating.average rating.count practice.locations practice.name verification.status")
      .sort({ rating: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    // Get total count for pagination
    const total = await Doctor.countDocuments(query);

    res.json({
      doctors,
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

// @desc    Get single doctor
// @route   GET /api/doctors/:id
// @access  Public
export const getDoctorById = async (req, res) => {
  try {
    const doctor = await Doctor.findById(req.params.id)
      .select("-verification.documents");

    if (!doctor) {
      return res.status(404).json({ message: "Doctor not found" });
    }

    res.json(doctor);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server Error", error: error.message });
  }
};

// @desc    Create a new doctor
// @route   POST /api/doctors
// @access  Private (Admin only)
export const createDoctor = async (req, res) => {
  try {
    // Check if user is admin
    if (req.user.role !== "admin") {
      return res.status(403).json({ message: "Not authorized" });
    }

    const {
      firstName,
      lastName,
      email,
      phone,
      specialty,
      subSpecialties,
      licenseNumber,
      npiNumber,
      education,
      certifications,
      experience,
      practice,
      locations,
      telehealth,
      insurance,
      languages,
      procedures,
      conditions,
      availability,
      consultation,
    } = req.body;

    // Validate required fields
    if (!firstName || !lastName || !email || !specialty || !licenseNumber || !npiNumber) {
      return res.status(400).json({ message: "Please provide all required fields" });
    }

    // Create doctor
    const doctor = await Doctor.create({
      firstName,
      lastName,
      email,
      phone,
      specialty,
      subSpecialties: subSpecialties || [],
      licenseNumber,
      npiNumber,
      education: education || [],
      certifications: certifications || [],
      experience: experience || { years: 0, details: [] },
      practice: practice || {},
      locations: locations || [],
      telehealth: telehealth || { available: false, platforms: [] },
      insurance: insurance || [],
      languages: languages || [],
      procedures: procedures || [],
      conditions: conditions || [],
      availability: availability || { schedule: [], bufferTime: 15, advanceBooking: 90 },
      consultation: consultation || { fees: {}, duration: {} },
      status: "pending", // New doctors need verification
    });

    res.status(201).json(doctor);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server Error", error: error.message });
  }
};

// @desc    Update a doctor
// @route   PUT /api/doctors/:id
// @access  Private (Admin or Doctor)
export const updateDoctor = async (req, res) => {
  try {
    const doctor = await Doctor.findById(req.params.id);

    if (!doctor) {
      return res.status(404).json({ message: "Doctor not found" });
    }

    // Check if user is admin or the doctor themselves
    if (req.user.role !== "admin" && req.user.id !== doctor.userId?.toString()) {
      return res.status(403).json({ message: "Not authorized" });
    }

    const updatedDoctor = await Doctor.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );

    res.json(updatedDoctor);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server Error", error: error.message });
  }
};

// @desc    Delete a doctor
// @route   DELETE /api/doctors/:id
// @access  Private (Admin only)
export const deleteDoctor = async (req, res) => {
  try {
    // Check if user is admin
    if (req.user.role !== "admin") {
      return res.status(403).json({ message: "Not authorized" });
    }

    const doctor = await Doctor.findById(req.params.id);

    if (!doctor) {
      return res.status(404).json({ message: "Doctor not found" });
    }

    await doctor.remove();

    res.json({ message: "Doctor removed" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server Error", error: error.message });
  }
};

// @desc    Verify a doctor
// @route   PUT /api/doctors/:id/verify
// @access  Private (Admin only)
export const verifyDoctor = async (req, res) => {
  try {
    // Check if user is admin
    if (req.user.role !== "admin") {
      return res.status(403).json({ message: "Not authorized" });
    }

    const { status, documents, notes } = req.body;
    const doctor = await Doctor.findById(req.params.id);

    if (!doctor) {
      return res.status(404).json({ message: "Doctor not found" });
    }

    // Update verification status
    doctor.verification.status = status || "verified";
    doctor.verification.verifiedBy = req.user.id;
    doctor.verification.verifiedDate = new Date();
    
    if (documents && documents.length > 0) {
      doctor.verification.documents = documents;
    }
    
    if (notes) {
      doctor.verification.notes = notes;
    }

    await doctor.save();

    res.json({
      message: `Doctor ${status === "verified" ? "verified" : "rejected"} successfully`,
      doctor,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server Error", error: error.message });
  }
};

// @desc    Get doctor's available time slots
// @route   GET /api/doctors/:id/availability
// @access  Public
export const getDoctorAvailability = async (req, res) => {
  try {
    const { date, duration = 30 } = req.query;

    if (!date) {
      return res.status(400).json({ message: "Date is required" });
    }

    const doctor = await Doctor.findById(req.params.id);

    if (!doctor) {
      return res.status(404).json({ message: "Doctor not found" });
    }

    // Get available slots for the specified date
    const availableSlots = doctor.getNextAvailableSlot(date, duration);

    res.json({
      doctorId: req.params.id,
      date,
      availableSlots,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server Error", error: error.message });
  }
};

// @desc    Add review for a doctor
// @route   POST /api/doctors/:id/reviews
// @access  Private
export const addDoctorReview = async (req, res) => {
  try {
    const { rating, comment } = req.body;
    const doctor = await Doctor.findById(req.params.id);

    if (!doctor) {
      return res.status(404).json({ message: "Doctor not found" });
    }

    // Validate rating
    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({ message: "Rating must be between 1 and 5" });
    }

    // Add review
    doctor.reviews.push({
      patientId: req.user.id,
      rating,
      comment,
      date: new Date(),
      verified: false, // Reviews need verification
    });

    // Update rating
    await doctor.updateRating();

    await doctor.save();

    res.status(201).json({
      message: "Review added successfully",
      rating: doctor.rating.average,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server Error", error: error.message });
  }
};

// @desc    Get doctor's specialties
// @route   GET /api/doctors/specialties
// @access  Public
export const getSpecialties = async (req, res) => {
  try {
    // Get all unique specialties from doctors
    const specialties = await Doctor.distinct("specialty");

    res.json(specialties.sort());
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server Error", error: error.message });
  }
};

// @desc    Get top rated doctors
// @route   GET /api/doctors/top-rated
// @access  Public
export const getTopRatedDoctors = async (req, res) => {
  try {
    const { limit = 10, specialty } = req.query;

    // Build query
    const query = { 
      status: "verified",
      "rating.average": { $gt: 0 }
    };

    if (specialty) {
      query.specialty = specialty;
    }

    const doctors = await Doctor.find(query)
      .select("firstName lastName specialty rating.average rating.count")
      .sort({ "rating.average": -1 })
      .limit(parseInt(limit));

    res.json(doctors);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server Error", error: error.message });
  }
};