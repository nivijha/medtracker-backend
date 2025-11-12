import HealthMetrics from "../models/HealthMetrics.js";
import mongoose from "mongoose";

// @desc    Get all health metrics for a user
// @route   GET /api/health-metrics
// @access  Private
export const getHealthMetrics = async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 10, 
      startDate, 
      endDate, 
      type,
      days = 30 
    } = req.query;
    const userId = req.user.id;

    // Build query
    const query = { userId };
    
    // Date range filter
    if (startDate || endDate) {
      query.date = {};
      if (startDate) query.date.$gte = new Date(startDate);
      if (endDate) query.date.$lte = new Date(endDate);
    } else {
      // Default to last N days if no date range specified
      const defaultStartDate = new Date();
      defaultStartDate.setDate(defaultStartDate.getDate() - parseInt(days));
      query.date = { $gte: defaultStartDate };
    }

    // Type filter (blood pressure, heart rate, etc.)
    if (type) {
      const typeField = `${type}.value`;
      query[typeField] = { $exists: true };
    }

    // Execute query with pagination
    const metrics = await HealthMetrics.find(query)
      .sort({ date: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    // Get total count for pagination
    const total = await HealthMetrics.countDocuments(query);

    res.json({
      metrics,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server Error", error: error.message });
  }
};

// @desc    Get single health metric entry
// @route   GET /api/health-metrics/:id
// @access  Private
export const getHealthMetricById = async (req, res) => {
  try {
    const metric = await HealthMetrics.findById(req.params.id);

    if (!metric) {
      return res.status(404).json({ message: "Health metric not found" });
    }

    // Check if metric belongs to user
    if (metric.userId.toString() !== req.user.id) {
      return res.status(401).json({ message: "Not authorized" });
    }

    res.json(metric);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server Error", error: error.message });
  }
};

// @desc    Create a new health metric entry
// @route   POST /api/health-metrics
// @access  Private
export const createHealthMetric = async (req, res) => {
  try {
    const metricData = {
      ...req.body,
      userId: req.user.id,
      date: req.body.date || new Date(),
    };

    // Create health metric
    const metric = await HealthMetrics.create(metricData);

    // Check for abnormal values
    const abnormalities = metric.checkAbnormalValues();

    res.status(201).json({
      metric,
      abnormalities,
      hasAbnormalities: abnormalities.length > 0,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server Error", error: error.message });
  }
};

// @desc    Update a health metric entry
// @route   PUT /api/health-metrics/:id
// @access  Private
export const updateHealthMetric = async (req, res) => {
  try {
    const metric = await HealthMetrics.findById(req.params.id);

    if (!metric) {
      return res.status(404).json({ message: "Health metric not found" });
    }

    // Check if metric belongs to user
    if (metric.userId.toString() !== req.user.id) {
      return res.status(401).json({ message: "Not authorized" });
    }

    const updatedMetric = await HealthMetrics.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );

    // Check for abnormal values
    const abnormalities = updatedMetric.checkAbnormalValues();

    res.json({
      metric: updatedMetric,
      abnormalities,
      hasAbnormalities: abnormalities.length > 0,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server Error", error: error.message });
  }
};

// @desc    Delete a health metric entry
// @route   DELETE /api/health-metrics/:id
// @access  Private
export const deleteHealthMetric = async (req, res) => {
  try {
    const metric = await HealthMetrics.findById(req.params.id);

    if (!metric) {
      return res.status(404).json({ message: "Health metric not found" });
    }

    // Check if metric belongs to user
    if (metric.userId.toString() !== req.user.id) {
      return res.status(401).json({ message: "Not authorized" });
    }

    await metric.remove();

    res.json({ message: "Health metric removed" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server Error", error: error.message });
  }
};

// @desc    Get health metrics summary
// @route   GET /api/health-metrics/summary
// @access  Private
export const getHealthMetricsSummary = async (req, res) => {
  try {
    const userId = req.user.id;
    const days = parseInt(req.query.days) || 30;
    const type = req.query.type;

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    // Build query
    const query = { 
      userId,
      date: { $gte: startDate }
    };

    if (type) {
      const typeField = `${type}.value`;
      query[typeField] = { $exists: true };
    }

    const metrics = await HealthMetrics.find(query).sort({ date: 1 });

    // Calculate summary based on type
    let summary = {};

    if (!type || type === "bloodPressure") {
      const bpReadings = metrics.filter(m => m.bloodPressure?.systolic && m.bloodPressure?.diastolic);
      
      if (bpReadings.length > 0) {
        const avgSystolic = Math.round(bpReadings.reduce((sum, m) => sum + m.bloodPressure.systolic, 0) / bpReadings.length);
        const avgDiastolic = Math.round(bpReadings.reduce((sum, m) => sum + m.bloodPressure.diastolic, 0) / bpReadings.length);
        
        const latestReading = bpReadings[bpReadings.length - 1];
        const category = latestReading ? latestReading.getBloodPressureCategory() : null;

        summary.bloodPressure = {
          average: { systolic: avgSystolic, diastolic: avgDiastolic },
          latest: { systolic: latestReading.bloodPressure.systolic, diastolic: latestReading.bloodPressure.diastolic },
          category,
          readings: bpReadings.length,
        };
      }
    }

    if (!type || type === "heartRate") {
      const hrReadings = metrics.filter(m => m.heartRate?.value);
      
      if (hrReadings.length > 0) {
        const avgHeartRate = Math.round(hrReadings.reduce((sum, m) => sum + m.heartRate.value, 0) / hrReadings.length);
        const latestReading = hrReadings[hrReadings.length - 1];
        const zone = latestReading ? latestReading.getHeartRateZone() : null;

        summary.heartRate = {
          average: avgHeartRate,
          latest: latestReading.heartRate.value,
          zone,
          readings: hrReadings.length,
        };
      }
    }

    if (!type || type === "weight") {
      const weightReadings = metrics.filter(m => m.weight?.value);
      
      if (weightReadings.length > 0) {
        const avgWeight = Math.round(weightReadings.reduce((sum, m) => sum + m.weight.value, 0) * 100 / weightReadings.length) / 100;
        const latestReading = weightReadings[weightReadings.length - 1];
        const oldestReading = weightReadings[0];
        const weightChange = latestReading && oldestReading ? 
          Math.round((latestReading.weight.value - oldestReading.weight.value) * 100) / 100 : 0;

        summary.weight = {
          average: avgWeight,
          latest: latestReading.weight.value,
          unit: latestReading.weight.unit,
          change: weightChange,
          readings: weightReadings.length,
        };
      }
    }

    if (!type || type === "temperature") {
      const tempReadings = metrics.filter(m => m.temperature?.value);
      
      if (tempReadings.length > 0) {
        const avgTemp = Math.round(tempReadings.reduce((sum, m) => sum + m.temperature.value, 0) * 100 / tempReadings.length) / 100;
        const latestReading = tempReadings[tempReadings.length - 1];

        summary.temperature = {
          average: avgTemp,
          latest: latestReading.temperature.value,
          unit: latestReading.temperature.unit,
          readings: tempReadings.length,
        };
      }
    }

    res.json({
      period: `Last ${days} days`,
      summary,
      totalReadings: metrics.length,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server Error", error: error.message });
  }
};

// @desc    Get health trends
// @route   GET /api/health-metrics/trends
// @access  Private
export const getHealthTrends = async (req, res) => {
  try {
    const userId = req.user.id;
    const days = parseInt(req.query.days) || 90;
    const type = req.query.type || "bloodPressure";

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    // Build query
    const query = { 
      userId,
      date: { $gte: startDate }
    };

    const typeField = `${type}.value`;
    query[typeField] = { $exists: true };

    const metrics = await HealthMetrics.find(query)
      .sort({ date: 1 })
      .select(`date ${type}`);

    // Process data for trends
    const trends = metrics.map(metric => {
      const dataPoint = { date: metric.date };
      
      if (type === "bloodPressure" && metric.bloodPressure) {
        dataPoint.systolic = metric.bloodPressure.systolic;
        dataPoint.diastolic = metric.bloodPressure.diastolic;
      } else if (type === "heartRate" && metric.heartRate) {
        dataPoint.value = metric.heartRate.value;
      } else if (type === "weight" && metric.weight) {
        dataPoint.value = metric.weight.value;
      } else if (type === "temperature" && metric.temperature) {
        dataPoint.value = metric.temperature.value;
      }
      
      return dataPoint;
    });

    res.json({
      type,
      period: `Last ${days} days`,
      trends,
      dataPoints: trends.length,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server Error", error: error.message });
  }
};

// @desc    Get BMI history
// @route   GET /api/health-metrics/bmi
// @access  Private
export const getBMIHistory = async (req, res) => {
  try {
    const userId = req.user.id;
    const days = parseInt(req.query.days) || 90;

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    // Get metrics with both height and weight
    const metrics = await HealthMetrics.find({
      userId,
      date: { $gte: startDate },
      "weight.value": { $exists: true },
      "height.value": { $exists: true },
    }).sort({ date: 1 });

    // Calculate BMI for each entry
    const bmiHistory = metrics.map(metric => {
      const bmi = metric.bmi; // Virtual property
      return {
        date: metric.date,
        bmi,
        weight: metric.weight.value,
        height: metric.height.value,
        category: getBMICategory(bmi),
      };
    });

    res.json({
      period: `Last ${days} days`,
      bmiHistory,
      currentBMI: bmiHistory.length > 0 ? bmiHistory[bmiHistory.length - 1].bmi : null,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server Error", error: error.message });
  }
};

// Helper function to get BMI category
function getBMICategory(bmi) {
  if (!bmi) return null;
  
  if (bmi < 18.5) return "Underweight";
  if (bmi < 25) return "Normal";
  if (bmi < 30) return "Overweight";
  return "Obese";
}