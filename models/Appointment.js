import mongoose from "mongoose";

const appointmentSchema = new mongoose.Schema(
  {
    patientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    doctorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Doctor",
      required: true,
    },
    doctorName: {
      type: String,
      required: true,
      trim: true,
    },
    specialty: {
      type: String,
      required: true,
      trim: true,
    },
    date: {
      type: Date,
      required: true,
    },
    time: {
      type: String,
      required: true,
      trim: true, // Format: "2:00 PM"
    },
    duration: {
      type: Number,
      default: 30, // Duration in minutes
    },
    location: {
      type: String,
      required: true,
      trim: true,
    },
    type: {
      type: String,
      enum: ["in-person", "video", "phone"],
      default: "in-person",
    },
    status: {
      type: String,
      enum: ["scheduled", "confirmed", "completed", "cancelled", "no-show", "rescheduled"],
      default: "scheduled",
    },
    reason: {
      type: String,
      required: true,
      trim: true,
    },
    notes: {
      type: String,
      trim: true,
    },
    reminders: {
      enabled: {
        type: Boolean,
        default: true,
      },
      times: [{
        type: Number, // Minutes before appointment: 1440 (1 day), 60 (1 hour), 15 (15 min)
      }],
    },
    followUp: {
      required: {
        type: Boolean,
        default: false,
      },
      date: Date,
      notes: String,
    },
    insurance: {
      provider: String,
      policyNumber: String,
      verified: {
        type: Boolean,
        default: false,
      },
    },
    documents: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: "Report",
    }],
    cost: {
      estimated: Number,
      actual: Number,
      currency: {
        type: String,
        default: "USD",
      },
    },
    payment: {
      status: {
        type: String,
        enum: ["pending", "paid", "refunded"],
        default: "pending",
      },
      method: String,
      transactionId: String,
    },
  },
  { timestamps: true }
);

// Virtual for appointment end time
appointmentSchema.virtual('endTime').get(function() {
  const [hours, minutes, period] = this.time.match(/(\d+):(\d+)\s*(AM|PM)/i)?.slice(1) || [];
  if (!hours || !minutes) return null;
  
  let hour = parseInt(hours);
  const minute = parseInt(minutes);
  
  if (period?.toUpperCase() === 'PM' && hour !== 12) hour += 12;
  if (period?.toUpperCase() === 'AM' && hour === 12) hour = 0;
  
  const endTime = new Date(this.date);
  endTime.setHours(hour, minute + this.duration, 0, 0);
  
  return endTime.toLocaleTimeString('en-US', { 
    hour: 'numeric', 
    minute: '2-digit',
    hour12: true 
  });
});

// Check if appointment is upcoming
appointmentSchema.methods.isUpcoming = function() {
  const now = new Date();
  const appointmentDateTime = new Date(this.date);
  const [hours, minutes, period] = this.time.match(/(\d+):(\d+)\s*(AM|PM)/i)?.slice(1) || [];
  
  if (hours && minutes) {
    let hour = parseInt(hours);
    const minute = parseInt(minutes);
    
    if (period?.toUpperCase() === 'PM' && hour !== 12) hour += 12;
    if (period?.toUpperCase() === 'AM' && hour === 12) hour = 0;
    
    appointmentDateTime.setHours(hour, minute, 0, 0);
  }
  
  return appointmentDateTime > now;
};

// Check if appointment is today
appointmentSchema.methods.isToday = function() {
  const today = new Date();
  const appointmentDate = new Date(this.date);
  return today.toDateString() === appointmentDate.toDateString();
};

// Get days until appointment
appointmentSchema.methods.getDaysUntil = function() {
  const now = new Date();
  const appointmentDate = new Date(this.date);
  const diffTime = appointmentDate - now;
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
};

// Update status based on date
appointmentSchema.methods.updateStatus = function() {
  const now = new Date();
  const appointmentDateTime = new Date(this.date);
  const [hours, minutes, period] = this.time.match(/(\d+):(\d+)\s*(AM|PM)/i)?.slice(1) || [];
  
  if (hours && minutes) {
    let hour = parseInt(hours);
    const minute = parseInt(minutes);
    
    if (period?.toUpperCase() === 'PM' && hour !== 12) hour += 12;
    if (period?.toUpperCase() === 'AM' && hour === 12) hour = 0;
    
    appointmentDateTime.setHours(hour, minute, 0, 0);
  }
  
  if (this.status === "scheduled" || this.status === "confirmed") {
    if (now > appointmentDateTime) {
      this.status = "completed";
    }
  }
  
  return this.save();
};

const Appointment = mongoose.model("Appointment", appointmentSchema);
export default Appointment;