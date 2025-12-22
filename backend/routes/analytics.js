const express = require('express');
const router = express.Router();
const Agreement = require('../models/Agreement');
const Residence = require('../models/Residence');
const Employee = require('../models/Employee');
const { authenticateToken } = require('../middleware/auth'); // FIXED: Destructure the function

// Apply authentication to all routes in this router
router.use(authenticateToken);

// Get all analytics data
router.get('/', async (req, res) => {
  try {
    const today = new Date();
    // Reset time to start of day for accurate comparison
    today.setHours(0, 0, 0, 0);

    const ninetyDaysFromNow = new Date();
    ninetyDaysFromNow.setDate(today.getDate() + 90);

    // 1. Total Agreements
    const totalAgreements = await Agreement.countDocuments();

    // 2. Agreements Due in <= 90 Days (and not yet past due)
    const dueAgreements = await Agreement.countDocuments({
      endDate: {
        $gte: today,
        $lte: ninetyDaysFromNow
      }
    });

    // 3. Past Due Agreements (EndDate strictly before today)
    const pastDueAgreements = await Agreement.countDocuments({
      endDate: { $lt: today }
    });

    // 4. Inactive Employees
    // Checks for 'Inactive' status (case insensitive)
    const inactiveEmployees = await Employee.countDocuments({
      status: { $regex: /^inactive$/i } 
    });

    // 5. Occupancy Rate Calculation
    const residences = await Residence.find();
    let totalCapacity = 0;
    let totalOccupied = 0;

    residences.forEach(res => {
      const cap = parseInt(res.capacity || 0, 10);
      const occ = parseInt(res.currentOccupancy || 0, 10);
      totalCapacity += cap;
      totalOccupied += occ;
    });

    const occupancyRate = totalCapacity > 0 
      ? ((totalOccupied / totalCapacity) * 100).toFixed(1) 
      : 0;

    // 6. Monthly Rent Cost by Department (Aggregation)
    // Joins Agreement -> Employee to group by department
    const rentByDepartment = await Agreement.aggregate([
      {
        $lookup: {
          from: 'employees', // Must match your MongoDB collection name (usually lowercase plural)
          localField: 'employee',
          foreignField: '_id',
          as: 'employeeDetails'
        }
      },
      {
        $unwind: '$employeeDetails'
      },
      {
        $group: {
          _id: '$employeeDetails.department',
          totalRent: { $sum: '$rentAmount' }
        }
      },
      {
        $sort: { totalRent: -1 } // Sort by highest rent first
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