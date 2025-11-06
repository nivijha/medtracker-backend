import express from "express";
import Test from "../models/Test.js";  // We'll create this model next

const router = express.Router();

// POST route: Add test data
router.get("/", (req, res) => {
  res.send("✅ Test route is working!");
});

router.post("/add", async (req, res) => {
  try {
    const { name, email } = req.body;
    const newTest = new Test({ name, email });
    await newTest.save();
    res.status(201).json({ message: "Test added successfully", data: newTest });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
});

export default router;
