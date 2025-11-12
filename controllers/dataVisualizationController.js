import HealthMetrics from "../models/HealthMetrics.js";
import Medication from "../models/Medication.js";
import mongoose from "mongoose";

// @desc    Get health metrics trends
// @route   GET /api/visualization/health-trends
// @access  Private
export const getHealthTrends = async (req, res) => {
  try {
    const { 
      type = "bloodPressure", 
      period = "90days", 
      chartType = "line" 
    } = req.query;
    const userId = req.user.id;

    // Validate parameters
    const validTypes = ["bloodPressure", "heartRate", "weight", "temperature"];
    const validPeriods = ["7days", "30days", "90days", "1year"];
    const validChartTypes = ["line", "bar", "area"];

    if (!validTypes.includes(type)) {
      return res.status(400).json({ 
        message: "Invalid type. Valid types: bloodPressure, heartRate, weight, temperature" 
      });
    }

    if (!validPeriods.includes(period)) {
      return res.status(400).json({ 
        message: "Invalid period. Valid periods: 7days, 30days, 90days, 1year" 
      });
    }

    if (!validChartTypes.includes(chartType)) {
      return res.status(400).json({ 
        message: "Invalid chart type. Valid types: line, bar, area" 
      });
    }

    // Calculate date range
    const now = new Date();
    let startDate = new Date();
    
    if (period === "7days") {
      startDate.setDate(now.getDate() - 7);
    } else if (period === "30days") {
      startDate.setDate(now.getDate() - 30);
    } else if (period === "90days") {
      startDate.setDate(now.getDate() - 90);
    } else if (period === "1year") {
      startDate.setFullYear(now.getFullYear() - 1);
    }

    // Get health metrics data
    const metrics = await HealthMetrics.find({
      userId,
      date: { $gte: startDate },
    }).sort({ date: 1 });

    // Process data based on type
    let chartData = [];
    
    if (type === "bloodPressure") {
      chartData = metrics.map(metric => {
        if (metric.bloodPressure?.systolic && metric.bloodPressure?.diastolic) {
          return {
            date: metric.date,
            systolic: metric.bloodPressure.systolic,
            diastolic: metric.bloodPressure.diastolic,
          };
        }
        return null;
      }).filter(Boolean);
    } else if (type === "heartRate") {
      chartData = metrics.map(metric => {
        if (metric.heartRate?.value) {
          return {
            date: metric.date,
            value: metric.heartRate.value,
          };
        }
        return null;
      }).filter(Boolean);
    } else if (type === "weight") {
      chartData = metrics.map(metric => {
        if (metric.weight?.value) {
          return {
            date: metric.date,
            value: metric.weight.value,
            unit: metric.weight.unit,
          };
        }
        return null;
      }).filter(Boolean);
    } else if (type === "temperature") {
      chartData = metrics.map(metric => {
        if (metric.temperature?.value) {
          return {
            date: metric.date,
            value: metric.temperature.value,
            unit: metric.temperature.unit,
          };
        }
        return null;
      }).filter(Boolean);
    }

    // Format data for chart
    let formattedData = [];
    
    if (chartType === "line") {
      formattedData = chartData;
    } else if (chartType === "bar") {
      // Group by date for bar chart
      const groupedData = {};
      chartData.forEach(item => {
        const date = item.date.toISOString().split('T')[0];
        if (!groupedData[date]) {
          groupedData[date] = [];
        }
        groupedData[date].push(item);
      });
      
      // Calculate averages for each date
      formattedData = Object.keys(groupedData).map(date => {
        const items = groupedData[date];
        let avgValue = 0;
        let count = 0;
        
        if (type === "bloodPressure") {
          let totalSystolic = 0;
          let totalDiastolic = 0;
          
          items.forEach(item => {
            totalSystolic += item.systolic;
            totalDiastolic += item.diastolic;
            count++;
          });
          
          avgValue = {
            systolic: Math.round(totalSystolic / count),
            diastolic: Math.round(totalDiastolic / count),
          };
        } else {
          items.forEach(item => {
            avgValue += item.value;
            count++;
          });
          
          avgValue = Math.round(avgValue / count);
        }
        
        return {
          date,
          value: avgValue,
          count,
        };
      });
    } else if (chartType === "area") {
      formattedData = chartData;
    }

    res.json({
      type,
      period,
      chartType,
      data: formattedData,
      totalDataPoints: chartData.length,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server Error", error: error.message });
  }
};

// @desc    Get medication adherence trends
// @route   GET /api/visualization/medication-adherence
// @access  Private
export const getMedicationAdherence = async (req, res) => {
  try {
    const { period = "30days" } = req.query;
    const userId = req.user.id;

    // Validate period
    const validPeriods = ["7days", "30days", "90days", "1year"];
    if (!validPeriods.includes(period)) {
      return res.status(400).json({ 
        message: "Invalid period. Valid periods: 7days, 30days, 90days, 1year" 
      });
    }

    // Calculate date range
    const now = new Date();
    let startDate = new Date();
    
    if (period === "7days") {
      startDate.setDate(now.getDate() - 7);
    } else if (period === "30days") {
      startDate.setDate(now.getDate() - 30);
    } else if (period === "90days") {
      startDate.setDate(now.getDate() - 90);
    } else if (period === "1year") {
      startDate.setFullYear(now.getFullYear() - 1);
    }

    // Get medications
    const medications = await Medication.find({
      userId,
      status: "active",
      startDate: { $lte: now },
    });

    // Calculate adherence for each medication
    const adherenceData = medications.map(med => {
      // In a real implementation, you would calculate this from a compliance collection
      // For now, we'll use mock data
      const adherenceRate = Math.floor(Math.random() * 30) + 70; // 70-100%
      const missedDoses = Math.floor(Math.random() * 10);
      const totalDoses = Math.floor(Math.random() * 30) + 20;
      
      return {
        medicationId: med._id,
        medicationName: med.name,
        dosage: med.dosage,
        frequency: med.frequency,
        adherenceRate,
        missedDoses,
        totalDoses,
        period,
      };
    });

    // Calculate overall adherence
    const overallAdherence = adherenceData.length > 0 ? 
      Math.round(adherenceData.reduce((sum, item) => sum + item.adherenceRate, 0) / adherenceData.length) : 0;

    res.json({
      period,
      adherenceData,
      overallAdherence,
      totalMedications: medications.length,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server Error", error: error.message });
  }
};

// @desc    Get appointment statistics
// @route   GET /api/visualization/appointment-stats
// @access  Private
export const getAppointmentStats = async (req, res) => {
  try {
    const { period = "1year" } = req.query;
    const userId = req.user.id;

    // Validate period
    const validPeriods = ["30days", "90days", "1year"];
    if (!validPeriods.includes(period)) {
      return res.status(400).json({ 
        message: "Invalid period. Valid periods: 30days, 90days, 1year" 
      });
    }

    // Calculate date range
    const now = new Date();
    let startDate = new Date();
    
    if (period === "30days") {
      startDate.setDate(now.getDate() - 30);
    } else if (period === "90days") {
      startDate.setDate(now.getDate() - 90);
    } else if (period === "1year") {
      startDate.setFullYear(now.getFullYear() - 1);
    }

    // Get appointments
    const Appointment = mongoose.model("Appointment");
    const appointments = await Appointment.find({
      patientId: userId,
      date: { $gte: startDate },
    });

    // Calculate statistics
    const totalAppointments = appointments.length;
    const completedAppointments = appointments.filter(apt => apt.status === "completed").length;
    const cancelledAppointments = appointments.filter(apt => apt.status === "cancelled").length;
    const noShowAppointments = appointments.filter(apt => apt.status === "no-show").length;
    const upcomingAppointments = appointments.filter(apt => 
      apt.status === "scheduled" || apt.status === "confirmed"
    ).length;

    // Group by specialty
    const specialtyStats = {};
    appointments.forEach(apt => {
      if (!specialtyStats[apt.specialty]) {
        specialtyStats[apt.specialty] = {
          total: 0,
          completed: 0,
          cancelled: 0,
        };
      }
      
      specialtyStats[apt.specialty].total++;
      
      if (apt.status === "completed") {
        specialtyStats[apt.specialty].completed++;
      } else if (apt.status === "cancelled") {
        specialtyStats[apt.specialty].cancelled++;
      }
    });

    // Convert to array for chart
    const specialtyChartData = Object.keys(specialtyStats).map(specialty => ({
      specialty,
      total: specialtyStats[specialty].total,
      completed: specialtyStats[specialty].completed,
      cancelled: specialtyStats[specialty].cancelled,
    }));

    res.json({
      period,
      totalAppointments,
      completedAppointments,
      cancelledAppointments,
      noShowAppointments,
      upcomingAppointments,
      completionRate: totalAppointments > 0 ? 
        Math.round((completedAppointments / totalAppointments) * 100) : 0,
      specialtyChartData,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server Error", error: error.message });
  }
};

// @desc    Get dashboard summary
// @route   GET /api/visualization/dashboard
// @access  Private
export const getDashboardSummary = async (req, res) => {
  try {
    const userId = req.user.id;

    // Get counts for dashboard
    const [medications, appointments, healthMetrics] = await Promise.all([
      Medication.find({ userId, status: "active" }),
      Appointment.find({ 
        patientId: userId,
        date: { $gte: new Date(new Date().setDate(new Date().getDate() - 30)) }
      }),
      HealthMetrics.find({ 
        userId,
        date: { $gte: new Date(new Date().setDate(new Date().getDate() - 30)) }
      }),
    ]);

    // Calculate recent health metrics
    const recentMetrics = healthMetrics.slice(0, 5);
    const latestBP = recentMetrics.find(m => m.bloodPressure?.systolic);
    const latestWeight = recentMetrics.find(m => m.weight?.value);
    const latestHR = recentMetrics.find(m => m.heartRate?.value);

    // Calculate upcoming appointments
    const now = new Date();
    const upcomingAppointments = appointments.filter(apt => 
      apt.date >= now && ["scheduled", "confirmed"].includes(apt.status)
    ).sort((a, b) => new Date(a.date) - new Date(b.date)).slice(0, 3);

    res.json({
      medications: {
        active: medications.length,
        needRefill: medications.filter(med => med.needsRefillSoon()).length,
      },
      appointments: {
        total: appointments.length,
        upcoming: upcomingAppointments.length,
        completed: appointments.filter(apt => apt.status === "completed").length,
      },
      healthMetrics: {
        total: healthMetrics.length,
        latest: {
          bloodPressure: latestBP ? 
            `${latestBP.bloodPressure.systolic}/${latestBP.bloodPressure.diastolic}` : null,
          weight: latestWeight ? `${latestWeight.value} ${latestWeight.unit}` : null,
          heartRate: latestHR ? `${latestHR.value} ${latestHR.unit}` : null,
        },
      },
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server Error", error: error.message });
  }
};