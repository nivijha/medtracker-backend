import mongoose from "mongoose";
import bcrypt from "bcryptjs";

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    password: {
      type: String,
      required: true,
      minlength: 6,
    },
    role: {
      type: String,
      enum: ["patient", "doctor", "admin", "pharmacist"],
      default: "patient",
    },
    profile: {
      firstName: {
        type: String,
        trim: true,
      },
      lastName: {
        type: String,
        trim: true,
      },
      dateOfBirth: Date,
      gender: {
        type: String,
        enum: ["male", "female", "other", "prefer_not_to_say"],
      },
      phone: {
        type: String,
        trim: true,
      },
      address: {
        street: String,
        city: String,
        state: String,
        zipCode: String,
        country: String,
      },
      emergencyContact: {
        name: String,
        relationship: String,
        phone: String,
        email: String,
      },
      bloodType: {
        type: String,
        enum: ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"],
      },
      allergies: [String],
      medicalConditions: [String],
      medications: [String], // Current medications names
      height: {
        value: Number,
        unit: {
          type: String,
          enum: ["cm", "ft"],
          default: "cm",
        },
      },
      weight: {
        value: Number,
        unit: {
          type: String,
          enum: ["kg", "lbs"],
          default: "kg",
        },
      },
      primaryCarePhysician: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Doctor",
      },
      preferredPharmacy: {
        name: String,
        address: {
          street: String,
          city: String,
          state: String,
          zipCode: String,
        },
        phone: String,
      },
    },
    preferences: {
      language: {
        type: String,
        default: "en",
      },
      timezone: {
        type: String,
        default: "UTC",
      },
      units: {
        weight: {
          type: String,
          enum: ["kg", "lbs"],
          default: "kg",
        },
        height: {
          type: String,
          enum: ["cm", "ft"],
          default: "cm",
        },
        temperature: {
          type: String,
          enum: ["celsius", "fahrenheit"],
          default: "celsius",
        },
        bloodGlucose: {
          type: String,
          enum: ["mg/dL", "mmol/L"],
          default: "mg/dL",
        },
      },
      notifications: {
        email: {
          type: Boolean,
          default: true,
        },
        sms: {
          type: Boolean,
          default: false,
        },
        push: {
          type: Boolean,
          default: true,
        },
        medicationReminders: {
          type: Boolean,
          default: true,
        },
        appointmentReminders: {
          type: Boolean,
          default: true,
        },
        refillReminders: {
          type: Boolean,
          default: true,
        },
        healthInsights: {
          type: Boolean,
          default: true,
        },
      },
      privacy: {
        profileVisibility: {
          type: String,
          enum: ["public", "private", "friends"],
          default: "private",
        },
        shareData: {
          type: Boolean,
          default: false,
        },
        shareWithProviders: {
          type: Boolean,
          default: true,
        },
      },
      appearance: {
        theme: {
          type: String,
          enum: ["light", "dark", "auto"],
          default: "light",
        },
        fontSize: {
          type: String,
          enum: ["small", "medium", "large"],
          default: "medium",
        },
      },
    },
    security: {
      twoFactorEnabled: {
        type: Boolean,
        default: false,
      },
      twoFactorSecret: String,
      backupCodes: [String],
      lastPasswordChange: Date,
      loginAttempts: {
        type: Number,
        default: 0,
      },
      lockUntil: Date,
      sessionTimeout: {
        type: Number,
        default: 30, // minutes
      },
    },
    verification: {
      email: {
        verified: {
          type: Boolean,
          default: false,
        },
        token: String,
        expires: Date,
      },
      phone: {
        verified: {
          type: Boolean,
          default: false,
        },
        token: String,
        expires: Date,
      },
      identity: {
        verified: {
          type: Boolean,
          default: false,
        },
        documents: [String], // File paths
        verifiedBy: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
        },
        verifiedDate: Date,
      },
    },
    subscription: {
      plan: {
        type: String,
        enum: ["free", "basic", "premium"],
        default: "free",
      },
      startDate: Date,
      endDate: Date,
      autoRenew: {
        type: Boolean,
        default: false,
      },
      paymentMethod: String,
    },
    health: {
      goals: [{
        type: {
          type: String,
          enum: ["weight_loss", "weight_gain", "exercise", "nutrition", "medication_adherence", "blood_pressure", "blood_sugar"],
        },
        target: Number,
        current: Number,
        unit: String,
        deadline: Date,
        achieved: {
          type: Boolean,
          default: false,
        },
      }],
      riskFactors: [String],
      familyHistory: [{
        condition: String,
        relationship: String,
        ageOfOnset: Number,
      }],
      screenings: [{
        type: String,
        date: Date,
        result: String,
        nextDue: Date,
      }],
      immunizations: [{
        name: String,
        date: Date,
        nextDue: Date,
      }],
    },
    devices: [{
      type: {
        type: String,
        enum: ["blood_pressure_monitor", "glucometer", "scale", "fitness_tracker", "smartwatch", "pulse_oximeter"],
      },
      brand: String,
      model: String,
      serialNumber: String,
      lastSync: Date,
      connected: {
        type: Boolean,
        default: false,
      },
    }],
    providers: [{
      providerId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Doctor",
      },
      relationship: {
        type: String,
        enum: ["primary_care", "specialist", "therapist", "pharmacist"],
      },
      since: Date,
      status: {
        type: String,
        enum: ["active", "inactive"],
        default: "active",
      },
    }],
  },
  { timestamps: true }
);

// Hash password before saving
userSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

// Compare plain text password with hashed password
userSchema.methods.matchPassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

// Virtual for full name
userSchema.virtual('fullName').get(function() {
  if (this.profile?.firstName && this.profile?.lastName) {
    return `${this.profile.firstName} ${this.profile.lastName}`;
  }
  return this.name;
});

// Virtual for age
userSchema.virtual('age').get(function() {
  if (!this.profile?.dateOfBirth) return null;
  const today = new Date();
  const birthDate = new Date(this.profile.dateOfBirth);
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }
  return age;
});

// Method to get BMI
userSchema.methods.getBMI = function() {
  if (!this.profile?.height?.value || !this.profile?.weight?.value) return null;
  
  let weightInKg = this.profile.weight.value;
  let heightInM = this.profile.height.value;
  
  // Convert to metric if needed
  if (this.profile.weight.unit === "lbs") {
    weightInKg = weightInKg * 0.453592;
  }
  
  if (this.profile.height.unit === "ft") {
    heightInM = heightInM * 0.3048;
  } else {
    heightInM = heightInM / 100; // Convert cm to m
  }
  
  return Number((weightInKg / (heightInM * heightInM)).toFixed(2));
};

// Method to check if user is locked out
userSchema.methods.isLocked = function() {
  return !!(this.security?.lockUntil && this.security.lockUntil > Date.now());
};

// Method to increment login attempts
userSchema.methods.incLoginAttempts = function() {
  // If we have a previous lock that has expired, restart at 1
  if (this.security?.lockUntil && this.security.lockUntil < Date.now()) {
    return this.updateOne({
      $unset: { 'security.lockUntil': 1 },
      $set: { 'security.loginAttempts': 1 }
    });
  }
  
  const updates = { $inc: { 'security.loginAttempts': 1 } };
  
  // Lock account after 5 failed attempts for 2 hours
  if (this.security?.loginAttempts + 1 >= 5 && !this.isLocked()) {
    updates.$set = { 'security.lockUntil': Date.now() + 2 * 60 * 60 * 1000 }; // 2 hours
  }
  
  return this.updateOne(updates);
};

// Method to reset login attempts
userSchema.methods.resetLoginAttempts = function() {
  return this.updateOne({
    $unset: { 'security.loginAttempts': 1, 'security.lockUntil': 1 }
  });
};

// Method to get active medications
userSchema.methods.getActiveMedications = async function() {
  const Medication = mongoose.model("Medication");
  return await Medication.find({
    userId: this._id,
    status: "active"
  }).populate('prescribedBy');
};

// Method to get upcoming appointments
userSchema.methods.getUpcomingAppointments = async function() {
  const Appointment = mongoose.model("Appointment");
  const now = new Date();
  return await Appointment.find({
    patientId: this._id,
    date: { $gte: now },
    status: { $in: ["scheduled", "confirmed"] }
  }).populate('doctorId').sort({ date: 1 });
};

// Method to get recent health metrics
userSchema.methods.getRecentHealthMetrics = async function(days = 30) {
  const HealthMetrics = mongoose.model("HealthMetrics");
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  
  return await HealthMetrics.find({
    userId: this._id,
    date: { $gte: startDate }
  }).sort({ date: -1 });
};

// Method to check if user has premium features
userSchema.methods.hasPremium = function() {
  if (!this.subscription) return false;
  
  const now = new Date();
  return this.subscription.plan !== "free" &&
         this.subscription.endDate &&
         this.subscription.endDate > now;
};

// Method to get user's preferred units
userSchema.methods.getPreferredUnits = function() {
  return this.preferences?.units || {
    weight: "kg",
    height: "cm",
    temperature: "celsius",
    bloodGlucose: "mg/dL"
  };
};

// Method to update last password change
userSchema.methods.updatePasswordChange = function() {
  this.security.lastPasswordChange = new Date();
  this.security.loginAttempts = 0;
  delete this.security.lockUntil;
  return this.save();
};

const User = mongoose.model("User", userSchema);
export default User;
