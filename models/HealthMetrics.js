import mongoose from "mongoose";

const healthMetricsSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    date: {
      type: Date,
      required: true,
      default: Date.now,
    },
    bloodPressure: {
      systolic: {
        type: Number,
        min: 0,
        max: 300,
      },
      diastolic: {
        type: Number,
        min: 0,
        max: 200,
      },
      position: {
        type: String,
        enum: ["sitting", "standing", "lying"],
        default: "sitting",
      },
      arm: {
        type: String,
        enum: ["left", "right"],
        default: "left",
      },
    },
    heartRate: {
      value: {
        type: Number,
        min: 0,
        max: 300,
      },
      unit: {
        type: String,
        enum: ["bpm"],
        default: "bpm",
      },
      resting: {
        type: Boolean,
        default: true,
      },
    },
    temperature: {
      value: {
        type: Number,
        min: 0,
        max: 50,
      },
      unit: {
        type: String,
        enum: ["celsius", "fahrenheit"],
        default: "celsius",
      },
      method: {
        type: String,
        enum: ["oral", "ear", "forehead", "rectal", "axillary"],
        default: "oral",
      },
    },
    weight: {
      value: {
        type: Number,
        min: 0,
        max: 1000,
      },
      unit: {
        type: String,
        enum: ["kg", "lbs"],
        default: "kg",
      },
      bodyFat: {
        type: Number,
        min: 0,
        max: 100,
      },
      muscleMass: {
        type: Number,
        min: 0,
        max: 100,
      },
    },
    height: {
      value: {
        type: Number,
        min: 0,
        max: 300,
      },
      unit: {
        type: String,
        enum: ["cm", "ft"],
        default: "cm",
      },
    },
    bloodGlucose: {
      value: {
        type: Number,
        min: 0,
        max: 1000,
      },
      unit: {
        type: String,
        enum: ["mg/dL", "mmol/L"],
        default: "mg/dL",
      },
      timing: {
        type: String,
        enum: ["fasting", "before meal", "after meal", "bedtime", "random"],
        default: "random",
      },
    },
    oxygenSaturation: {
      value: {
        type: Number,
        min: 0,
        max: 100,
      },
      unit: {
        type: String,
        enum: ["%"],
        default: "%",
      },
    },
    respiratoryRate: {
      value: {
        type: Number,
        min: 0,
        max: 100,
      },
      unit: {
        type: String,
        enum: ["breaths/min"],
        default: "breaths/min",
      },
    },
    pain: {
      scale: {
        type: Number,
        min: 0,
        max: 10,
      },
      location: String,
      type: {
        type: String,
        enum: ["sharp", "dull", "aching", "burning", "throbbing", "shooting"],
      },
      duration: String,
    },
    sleep: {
      duration: {
        type: Number, // in hours
        min: 0,
        max: 24,
      },
      quality: {
        type: String,
        enum: ["excellent", "good", "fair", "poor"],
      },
      disturbances: Number,
    },
    exercise: {
      type: {
        type: String,
        enum: ["cardio", "strength", "flexibility", "sports", "walking", "running", "cycling", "swimming"],
      },
      duration: {
        type: Number, // in minutes
        min: 0,
      },
      intensity: {
        type: String,
        enum: ["low", "moderate", "high"],
      },
      calories: Number,
    },
    nutrition: {
      waterIntake: {
        type: Number, // in liters
        min: 0,
        max: 10,
      },
      calories: Number,
      meals: Number,
    },
    mood: {
      scale: {
        type: Number,
        min: 1,
        max: 10,
      },
      notes: String,
    },
    stress: {
      scale: {
        type: Number,
        min: 1,
        max: 10,
      },
      triggers: [String],
    },
    medications: [{
      medicationId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Medication",
      },
      taken: Boolean,
      time: Date,
      notes: String,
    }],
    symptoms: [{
      name: String,
      severity: {
        type: String,
        enum: ["mild", "moderate", "severe"],
      },
      duration: String,
      notes: String,
    }],
    notes: {
      type: String,
      trim: true,
    },
    source: {
      type: String,
      enum: ["manual", "device", "app", "import"],
      default: "manual",
    },
    deviceId: String, // For tracking which device recorded the data
    tags: [String], // For categorizing entries
  },
  { timestamps: true }
);

// Virtual for BMI calculation
healthMetricsSchema.virtual('bmi').get(function() {
  if (!this.weight?.value || !this.height?.value) return null;
  
  let weightInKg = this.weight.value;
  let heightInM = this.height.value;
  
  // Convert to metric if needed
  if (this.weight.unit === "lbs") {
    weightInKg = weightInKg * 0.453592;
  }
  
  if (this.height.unit === "ft") {
    heightInM = heightInM * 0.3048;
  } else {
    heightInM = heightInM / 100; // Convert cm to m
  }
  
  return Number((weightInKg / (heightInM * heightInM)).toFixed(2));
});

// Method to get blood pressure category
healthMetricsSchema.methods.getBloodPressureCategory = function() {
  if (!this.bloodPressure?.systolic || !this.bloodPressure?.diastolic) return null;
  
  const { systolic, diastolic } = this.bloodPressure;
  
  if (systolic < 120 && diastolic < 80) return "Normal";
  if (systolic >= 120 && systolic < 130 && diastolic < 80) return "Elevated";
  if (systolic >= 130 && systolic < 140 || diastolic >= 80 && diastolic < 90) return "Hypertension Stage 1";
  if (systolic >= 140 && systolic < 180 || diastolic >= 90 && diastolic < 120) return "Hypertension Stage 2";
  if (systolic >= 180 || diastolic >= 120) return "Hypertensive Crisis";
  
  return "Unknown";
};

// Method to get heart rate zone
healthMetricsSchema.methods.getHeartRateZone = function() {
  if (!this.heartRate?.value) return null;
  
  const age = this.calculateAge();
  if (!age) return null;
  
  const maxHeartRate = 220 - age;
  const hr = this.heartRate.value;
  
  if (hr < maxHeartRate * 0.5) return "Resting";
  if (hr < maxHeartRate * 0.6) return "Fat Burn";
  if (hr < maxHeartRate * 0.7) return "Cardio";
  if (hr < maxHeartRate * 0.85) return "Peak";
  return "Maximum";
};

// Helper method to calculate age (would need user's birthdate)
healthMetricsSchema.methods.calculateAge = function() {
  // This would need to be implemented with user data
  // For now, return a placeholder
  return 40; // Placeholder age
};

// Method to check for abnormal values
healthMetricsSchema.methods.checkAbnormalValues = function() {
  const abnormalities = [];
  
  if (this.bloodPressure?.systolic && this.bloodPressure.diastolic) {
    const category = this.getBloodPressureCategory();
    if (category !== "Normal" && category !== "Elevated") {
      abnormalities.push({
        metric: "Blood Pressure",
        value: `${this.bloodPressure.systolic}/${this.bloodPressure.diastolic}`,
        category,
      });
    }
  }
  
  if (this.heartRate?.value) {
    if (this.heartRate.value < 60 || this.heartRate.value > 100) {
      abnormalities.push({
        metric: "Heart Rate",
        value: `${this.heartRate.value} ${this.heartRate.unit}`,
        category: this.heartRate.value < 60 ? "Low" : "High",
      });
    }
  }
  
  if (this.temperature?.value) {
    let tempInCelsius = this.temperature.value;
    if (this.temperature.unit === "fahrenheit") {
      tempInCelsius = (tempInCelsius - 32) * 5/9;
    }
    
    if (tempInCelsius < 36.1 || tempInCelsius > 37.2) {
      abnormalities.push({
        metric: "Temperature",
        value: `${this.temperature.value}°${this.temperature.unit === "celsius" ? "C" : "F"}`,
        category: tempInCelsius < 36.1 ? "Low" : "High",
      });
    }
  }
  
  if (this.bloodGlucose?.value) {
    let glucoseInMgDl = this.bloodGlucose.value;
    if (this.bloodGlucose.unit === "mmol/L") {
      glucoseInMgDl = glucoseInMgDl * 18.018;
    }
    
    if (this.bloodGlucose.timing === "fasting" && (glucoseInMgDl < 70 || glucoseInMgDl > 100)) {
      abnormalities.push({
        metric: "Fasting Blood Glucose",
        value: `${this.bloodGlucose.value} ${this.bloodGlucose.unit}`,
        category: glucoseInMgDl < 70 ? "Low" : "High",
      });
    }
  }
  
  return abnormalities;
};

const HealthMetrics = mongoose.model("HealthMetrics", healthMetricsSchema);
export default HealthMetrics;