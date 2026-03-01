import Test from "../models/Test.js";

/**
 * @desc    Create a new medical test result
 * @route   POST /api/tests
 * @access  Private
 */
export const createTest = async (req, res, next) => {
  try {
    const { testName, result, referenceRange, unit, testDate, status, notes } = req.body;

    if (!testName || !result || !referenceRange) {
      return res.status(400).json({
        message: "Test name, result, and reference range are required",
      });
    }

    const test = await Test.create({
      user: req.user.id,
      testName,
      result,
      referenceRange,
      unit,
      testDate,
      status,
      notes,
    });

    res.status(201).json({
      message: "Test result recorded successfully",
      test,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get logged-in user's test results
 * @route   GET /api/tests/my
 * @access  Private
 */
export const getMyTests = async (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const total = await Test.countDocuments({ user: req.user.id });
    const tests = await Test.find({ user: req.user.id })
      .populate("user", "name email")
      .sort({ testDate: -1 })
      .skip(skip)
      .limit(limit);

    res.json({
      tests,
      pagination: {
        total,
        page,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Delete a test result
 * @route   DELETE /api/tests/:id
 * @access  Private
 */
export const deleteTest = async (req, res, next) => {
  try {
    const test = await Test.findById(req.params.id);

    if (!test) {
      return res.status(404).json({ message: "Test result not found" });
    }

    if (test.user.toString() !== req.user.id) {
      return res.status(403).json({ message: "Not authorized" });
    }

    await test.deleteOne();

    res.json({ message: "Test result deleted successfully" });
  } catch (error) {
    next(error);
  }
};
