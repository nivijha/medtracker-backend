import express from "express";
import { submitContactForm } from "../controllers/contactController.js";

const router = express.Router();

// Support POST requests for API clients and GET fallback for plain HTML forms
router.post("/", submitContactForm);
router.get("/", submitContactForm);

export default router;
