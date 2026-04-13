import express from "express";
import { submitContactForm } from "../controllers/contactController.js";

const router = express.Router();

// Support POST requests for API clients and GET fallback for plain HTML forms
router.post("/", submitContactForm);
router.get("/", submitContactForm);

// Serve a simple contact form HTML page
router.get("/form", (req, res) => {
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
                    const response = await fetch('/api/contact', {
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

export default router;
