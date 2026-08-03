import dotenv from "dotenv";
dotenv.config();

import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import morgan from "morgan";
import rateLimit from "express-rate-limit";
import connectDB from "./config/db.js";
import { connectRedis } from "./config/redis.js";
import logger from "./utils/logger.js";

import authRoutes from "./routes/authRoutes.js";
import reportRoutes from "./routes/reportRoutes.js";
import testRoutes from "./routes/testRoutes.js";
import appointmentRoutes from "./routes/appointmentRoutes.js";
import medicationRoutes from "./routes/medicationRoutes.js";
import activityRoutes from "./routes/activityRoutes.js";
import profileRoutes from "./routes/profileRoutes.js";
import chatbotRoutes from "./routes/chatbotRoutes.js";
import contactRoutes from "./routes/contactRoutes.js";
import errorHandler from "./middleware/errorMiddleware.js";

const app = express();

app.set("trust proxy", 1);

const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(",").map(o => o.trim())
  : ["http://localhost:3000"];

// Add CLIENT_URL if it's set in .env
if (process.env.CLIENT_URL) {
  allowedOrigins.push(process.env.CLIENT_URL.trim());
}

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      
      const isAllowed = allowedOrigins.includes(origin) || 
                       origin === "http://localhost:3000";

      if (isAllowed) {
        callback(null, true);
      } else {
        logger.warn(`CORS blocked for origin: ${origin}`);
        callback(null, false);
      }
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With", "Accept", "Origin"],
    exposedHeaders: ["Set-Cookie"],
  })
);

app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" }
}));
app.use(morgan("combined", { stream: { write: (message) => logger.info(message.trim()) } }));

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, 
  max: 100, 
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(limiter);

app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

if (process.env.NODE_ENV !== "test") {
  connectDB();
  connectRedis();
}

app.get("/health", (req, res) => {
  res.json({ status: "ok", time: new Date().toISOString() });
});

app.get("/", (req, res) => {
  res.send("MedTracker API running");
});

// Serve contact form at /contact for frontend compatibility
app.get("/contact", (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Contact Us - MedTracker</title>
        <style>
            body { font-family: Arial, sans-serif; max-width: 600px; margin: 50px auto; padding: 20px; }
            form { display: flex; flex-direction: column; gap: 15px; }
            input, textarea { padding: 10px; border: 1px solid #ddd; border-radius: 4px; }
            button { padding: 12px; background: #007bff; color: white; border: none; border-radius: 4px; cursor: pointer; }
            button:hover { background: #0056b3; }
            .message { margin-top: 20px; padding: 10px; border-radius: 4px; }
            .success { background: #d4edda; color: #155724; border: 1px solid #c3e6cb; }
            .error { background: #f8d7da; color: #721c24; border: 1px solid #f5c6cb; }
        </style>
    </head>
    <body>
        <h1>Contact Us</h1>
        <p>Get in touch with our support team.</p>

        <form id="contactForm">
            <input type="text" name="name" placeholder="Your Name" required>
            <input type="email" name="email" placeholder="Your Email" required>
            <textarea name="message" placeholder="Your Message" rows="5" required></textarea>
            <button type="submit">Send Message</button>
        </form>

        <div id="responseMessage"></div>

        <script>
            document.getElementById('contactForm').addEventListener('submit', async (e) => {
                e.preventDefault();

                const formData = new FormData(e.target);
                const data = Object.fromEntries(formData);

                try {
                    const response = await fetch('/contact', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                        },
                        body: JSON.stringify(data)
                    });

                    const result = await response.json();
                    const messageDiv = document.getElementById('responseMessage');

                    if (response.ok) {
                        messageDiv.innerHTML = '<div class="message success">' + result.message + '</div>';
                        e.target.reset();
                    } else {
                        messageDiv.innerHTML = '<div class="message error">' + (result.message || 'An error occurred') + '</div>';
                    }
                } catch (error) {
                    document.getElementById('responseMessage').innerHTML =
                        '<div class="message error">Network error. Please try again.</div>';
                }
            });
        </script>
    </body>
    </html>
  `);
});

// Handle contact form submissions at /contact
app.post("/contact", async (req, res, next) => {
  try {
    const { name, email, message } = req.body;

    if (!name || !email || !message) {
      return res.status(400).json({ message: "Please provide all required fields (name, email, message)" });
    }

    const ContactMessage = (await import("./models/ContactMessage.js")).default;
    const contactMessage = await ContactMessage.create({
      name,
      email,
      message,
    });

    res.status(201).json({
      success: true,
      message: "Message sent successfully",
      data: contactMessage,
    });
  } catch (error) {
    next(error);
  }
});

app.use("/api/auth", authRoutes);
app.use("/api/profile", profileRoutes);
app.use("/api/reports", reportRoutes);
app.use("/api/tests", testRoutes);
app.use("/api/appointments", appointmentRoutes);
app.use("/api/medications", medicationRoutes);
app.use("/api/activity", activityRoutes);
app.use("/api/chatbot", chatbotRoutes);
app.use("/api/contact", contactRoutes);

app.use(errorHandler);


const PORT = process.env.PORT || 5000;

if (process.env.NODE_ENV !== "test") {
  app.listen(PORT, () =>
    logger.info(`Server running on port ${PORT}`)
  );
}

export default app;
