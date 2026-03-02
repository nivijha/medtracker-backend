import ContactMessage from "../models/ContactMessage.js";

/**
 * @desc    Submit a contact form message
 * @route   POST /api/contact
 * @access  Public
 */
export const submitContactForm = async (req, res, next) => {
  try {
    const { name, email, message } = req.body;

    if (!name || !email || !message) {
      return res.status(400).json({ message: "Please provide all required fields (name, email, message)" });
    }

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
};
