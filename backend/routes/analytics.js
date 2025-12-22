const express = require('express');
const router = express.Router();
const Agreement = require('../models/Agreement');
const Residence = require('../models/Residence');
const Employee = require('../models/Employee');
const auth = require('../middleware/auth');

// Get all analytics data
router.get('/', auth, async (req, res) => {
  try {
    const today = new Date();
    // Reset time to start of day for accurate comparison
    today.setHours(0, 0, 0, 0);

    const ninetyDaysFromNow = new Date();
    ninetyDaysFromNow.setDate(today.getDate() + 90);

    // 1. Total Agreements
    const totalAgreements = await Agreement.countDocuments();

    // 2. Agreements Due in <= 90 Days (and not yet past due)
    // Logic: End date is between Today and Today+90
    const dueAgreements = await Agreement.countDocuments({
      endDate: {
        $gte: today,
        $lte: ninetyDaysFromNow
      }
    });

    // 3. Past Due Agreements
    // Logic: End date is strictly before today
    const pastDueAgreements = await Agreement.countDocuments({
      endDate: { $lt: today }
    });

    // 4. Inactive Employees (New Request)
    const inactiveEmployees = await Employee.countDocuments({
      status: 'Inactive' 
    });

    // 5. Occupancy Rate Calculation
    const residences = await Residence.find();
    let totalCapacity = 0;
    let totalOccupied = 0;

    residences.forEach(res => {
      // Ensure we treat these as numbers
      const cap = parseInt(res.capacity || 0, 10);
      const occ = parseInt(res.currentOccupancy || 0, 10);
      totalCapacity += cap;
      totalOccupied += occ;
    });

    // Avoid division by zero
    const occupancyRate = totalCapacity > 0 
      ? ((totalOccupied / totalCapacity) * 100).toFixed(1) 
      : 0;

    // 6. Monthly Rent Cost by Department (Aggregation)
    // Assumes Agreement has 'rentAmount' and is linked to 'employee' which has 'department'
    const rentByDepartment = await Agreement.aggregate([
      {
        $lookup: {
          from: 'employees', // Ensure this matches your actual MongoDB collection name (usually lowercase plural)
          localField: 'employee',
          foreignField: '_id',
          as: 'employeeDetails'
        }
      },
      {
        $unwind: '$employeeDetails' // Deconstruct the array
      },
      {
        $group: {
          _id: '$employeeDetails.department',
          totalRent: { $sum: '$rentAmount' }
        }
      }
    ]);

    // Format graph data for frontend
    const departmentLabels = rentByDepartment.map(item => item._id || 'Unknown');
    const departmentData = rentByDepartment.map(item => item.totalRent);

    res.json({
      totalAgreements,
      dueAgreements,
      pastDueAgreements,
      inactiveEmployees,
      occupancyRate,
      rentByDepartment: {
        labels: departmentLabels,
        data: departmentData
      }
    });

  } catch (err) {
    console.error('Analytics Error:', err);
    res.status(500).json({ message: 'Server Error' });
  }
});

module.exports = router;