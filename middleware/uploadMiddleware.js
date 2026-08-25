import multer from "multer";
import { CloudinaryStorage } from "multer-storage-cloudinary";
import cloudinary from "../config/cloudinary.js";

const storage = new CloudinaryStorage({
  cloudinary,
  params: async (req, file) => {
    const isOfficeDoc =
      /\.(docx?)$/i.test(file.originalname) ||
      /msword|officedocument/i.test(file.mimetype);
    const resource_type = isOfficeDoc ? "raw" : "image";
    const params = {
      folder: "medtracker/reports",
      resource_type,
    };
    if (resource_type !== "raw") {
      params.allowed_formats = ["jpg", "jpeg", "png", "webp", "pdf"];
    }
    return params;
  },
});

const upload = multer({
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024,
  },
});

export default upload;
