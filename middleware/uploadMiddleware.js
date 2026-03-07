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

    const params = {
      folder: "medtracker/reports",
      resource_type: resource_type,
    };

    // allowed_formats is only for images/videos, not for 'raw'
    if (resource_type !== "raw") {
      params.allowed_formats = ["jpg", "png", "webp"];
    }

    return params;
  },
});

const upload = multer({
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
});

export default upload;
