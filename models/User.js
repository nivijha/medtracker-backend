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

    phone: {
      type: String,
      required: true,
    },

    address: {
      type: String,
      default: "",
    },

    profileImage: {
      type: String,
      default: "",
    },

    password: {
      type: String,
      required: true,
      minlength: 6,
    },

    role: {
      type: String,
      default: "PATIENT",
    },
    
    preferences: {
      notifications: {
        email: { type: Boolean, default: true },
        push: { type: Boolean, default: true },
        sms: { type: Boolean, default: false },
        appointments: { type: Boolean, default: true },
        reports: { type: Boolean, default: true },
        medications: { type: Boolean, default: true },
        marketing: { type: Boolean, default: false },
      },

      privacy: {
        profileVisibility: {
          type: String,
          enum: ["public", "private", "friends"],
          default: "private",
        },
        shareData: { type: Boolean, default: false },
        twoFactor: { type: Boolean, default: false },
      },

      appearance: {
        theme: {
          type: String,
          enum: ["light", "dark", "auto"],
          default: "light",
        },
        language: { type: String, default: "en" },
        fontSize: {
          type: String,
          enum: ["small", "medium", "large"],
          default: "medium",
        },
      },
    },
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

// Compare passwords
userSchema.methods.matchPassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

export default mongoose.model("User", userSchema);
