import multer from "multer";
import { CloudinaryStorage } from "multer-storage-cloudinary";
import cloudinary from "../config/cloudinary.js";

const storage = new CloudinaryStorage({
  cloudinary,
  params: async (req, file) => {
    let resource_type = "auto";
    if (file.mimetype === "application/pdf" || file.originalname.match(/\.(pdf|doc|docx)$/i)) {
      resource_type = "raw";
    }
    return {
      folder: "medtracker/reports",
      allowed_formats: ["jpg", "png", "pdf", "docx", "doc"],
      resource_type: resource_type,
    };
  },
});

const upload = multer({
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
});

export default upload;