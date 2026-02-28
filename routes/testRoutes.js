import express from "express";
import {
  createTest,
  getMyTests,
  deleteTest,
} from "../controllers/testController.js";
import protect from "../middleware/authMiddleware.js";

const router = express.Router();

router.use(protect); // Ensure all test routes are protected

/**
 * @route   POST /api/tests
 * @desc    Record a new medical test result
 * @access  Private
 */
router.post("/", createTest);

/**
 * @route   GET /api/tests/my
 * @desc    Get logged-in user's test results
 * @access  Private
 */
router.get("/my", getMyTests);

/**
 * @route   DELETE /api/tests/:id
 * @desc    Delete a test result
 * @access  Private
 */
router.delete("/:id", deleteTest);

export default router;
