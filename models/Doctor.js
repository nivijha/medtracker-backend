import mongoose from "mongoose";

const doctorSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: false, // Some doctors might not have user accounts
    },
    firstName: {
      type: String,
      required: true,
      trim: true,
    },
    lastName: {
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
    phone: {
      type: String,
      required: false,
      trim: true,
    },
    specialty: {
      type: String,
      required: true,
      trim: true,
    },
    subSpecialties: [{
      type: String,
      trim: true,
    }],
    licenseNumber: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    npiNumber: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    education: [{
      degree: String,
      institution: String,
      year: Number,
    }],
    certifications: [{
      name: String,
      issuingOrganization: String,
      issueDate: Date,
      expirationDate: Date,
      certificateNumber: String,
    }],
    experience: {
      years: {
        type: Number,
        required: true,
      },
      details: [{
        hospital: String,
        position: String,
        startDate: Date,
        endDate: Date,
        current: Boolean,
      }],
    },
    practice: {
      name: String,
      address: {
        street: String,
        city: String,
        state: String,
        zipCode: String,
        country: String,
      },
      phone: String,
      fax: String,
      website: String,
    },
    locations: [{
      name: String,
      address: {
        street: String,
        city: String,
        state: String,
        zipCode: String,
        country: String,
      },
      phone: String,
      fax: String,
      hours: [{
        day: {
          type: String,
          enum: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"],
        },
        open: String, // "9:00 AM"
        close: String, // "5:00 PM"
        closed: Boolean,
      }],
    }],
    telehealth: {
      available: {
        type: Boolean,
        default: false,
      },
      platforms: [String], // "Zoom", "Doxy.me", etc.
    },
    insurance: [{
      provider: String,
      accepted: Boolean,
    }],
    languages: [{
      type: String,
      trim: true,
    }],
    rating: {
      average: {
        type: Number,
        min: 0,
        max: 5,
        default: 0,
      },
      count: {
        type: Number,
        default: 0,
      },
    },
    reviews: [{
      patientId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
      rating: {
        type: Number,
        min: 1,
        max: 5,
        required: true,
      },
      comment: String,
      date: {
        type: Date,
        default: Date.now,
      },
      verified: {
        type: Boolean,
        default: false,
      },
    }],
    specialties: [{
      type: String,
      trim: true,
    }],
    procedures: [{
      name: String,
      description: String,
    }],
    conditions: [{
      name: String,
      description: String,
    }],
    availability: {
      schedule: [{
        day: {
          type: String,
          enum: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"],
        },
        timeSlots: [{
          start: String, // "9:00 AM"
          end: String,   // "10:00 AM"
        }],
      }],
      bufferTime: {
        type: Number,
        default: 15, // Minutes between appointments
      },
      advanceBooking: {
        type: Number,
        default: 90, // Days in advance patients can book
      },
    },
    consultation: {
      fees: {
        newPatient: Number,
        followUp: Number,
        telehealth: Number,
      },
      duration: {
        newPatient: {
          type: Number,
          default: 60, // Minutes
        },
        followUp: {
          type: Number,
          default: 30, // Minutes
        },
        telehealth: {
          type: Number,
          default: 30, // Minutes
        },
      },
    },
    status: {
      type: String,
      enum: ["active", "inactive", "suspended", "pending"],
      default: "active",
    },
    verification: {
      status: {
        type: String,
        enum: ["pending", "verified", "rejected"],
        default: "pending",
      },
      verifiedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
      verifiedDate: Date,
      documents: [{
        type: String, // File paths
        description: String,
      }],
    },
  },
  { timestamps: true }
);

// Virtual for full name
doctorSchema.virtual('fullName').get(function() {
  return `${this.firstName} ${this.lastName}`;
});

// Method to check if doctor is available at specific time
doctorSchema.methods.isAvailable = function(date, time) {
  const dayOfWeek = new Date(date).toLocaleDateString('en-US', { weekday: 'long' });
  const daySchedule = this.availability.schedule.find(s => s.day === dayOfWeek);
  
  if (!daySchedule || daySchedule.timeSlots.length === 0) {
    return false;
  }
  
  // Check if the requested time falls within any available time slot
  return daySchedule.timeSlots.some(slot => {
    return time >= slot.start && time <= slot.end;
  });
};

// Method to get next available appointment slot
doctorSchema.methods.getNextAvailableSlot = function(date, duration = 30) {
  const dayOfWeek = new Date(date).toLocaleDateString('en-US', { weekday: 'long' });
  const daySchedule = this.availability.schedule.find(s => s.day === dayOfWeek);
  
  if (!daySchedule || daySchedule.timeSlots.length === 0) {
    return null;
  }
  
  // This is a simplified version - in production, you'd check existing appointments
  // and find gaps between them
  return daySchedule.timeSlots[0]; // Return first available slot
};

// Method to update rating
doctorSchema.methods.updateRating = function() {
  if (this.reviews.length === 0) {
    this.rating.average = 0;
    this.rating.count = 0;
    return this.save();
  }
  
  const sum = this.reviews.reduce((acc, review) => acc + review.rating, 0);
  this.rating.average = sum / this.reviews.length;
  this.rating.count = this.reviews.length;
  
  return this.save();
};

const Doctor = mongoose.model("Doctor", doctorSchema);
export default Doctor;