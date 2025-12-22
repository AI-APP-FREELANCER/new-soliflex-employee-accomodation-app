import React, { useEffect, useState } from 'react';
import { 
  Chart as ChartJS, 
  CategoryScale, 
  LinearScale, 
  BarElement, 
  Title, 
  Tooltip, 
  Legend, 
  ArcElement 
} from 'chart.js';
import { Bar, Doughnut } from 'react-chartjs-2';
import api from '../services/api';
import { useNavigate } from 'react-router-dom'; // Import useNavigate

// Register ChartJS components
ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
  ArcElement
);

const DashboardHome = () => {
  const navigate = useNavigate(); // Initialize hook
  const [stats, setStats] = useState({
    totalAgreements: 0,
    dueAgreements: 0,
    pastDueAgreements: 0,
    inactiveEmployees: 0,
    occupancyRate: 0,
    rentByDepartment: { labels: [], data: [] }
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const res = await api.get('/analytics');
        setStats(res.data);
      } catch (err) {
        console.error('Error fetching analytics:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchStats();
  }, []);

  // Navigation handlers
  const goToAgreements = (filterType) => {
    // Navigate to agreements tab, passing state so you can filter there if needed
    navigate('/agreements', { state: { filter: filterType } });
  };

  const goToEmployees = () => {
     navigate('/employees', { state: { filter: 'inactive' } });
  };

  const barChartData = {
    labels: stats.rentByDepartment?.labels || [],
    datasets: [
      {
        label: 'Monthly Rent Cost (SAR)',
        data: stats.rentByDepartment?.data || [],
        backgroundColor: 'rgba(53, 162, 235, 0.5)',
      },
    ],
  };

  const doughnutData = {
    labels: ['Occupied', 'Vacant'],
    datasets: [
      {
        data: [stats.occupancyRate, 100 - stats.occupancyRate],
        backgroundColor: [
          'rgba(75, 192, 192, 0.5)',
          'rgba(255, 99, 132, 0.5)',
        ],
        borderColor: [
          'rgba(75, 192, 192, 1)',
          'rgba(255, 99, 132, 1)',
        ],
        borderWidth: 1,
      },
    ],
  };

  if (loading) return <div className="text-center mt-5">Loading Dashboard...</div>;

  return (
    <div className="container-fluid">
      <h2 className="mb-4">Dashboard Overview</h2>
      
      {/* Stats Cards Row */}
      <div className="row mb-4">
        {/* Occupancy Rate */}
        <div className="col-md-3">
          <div className="card text-white bg-info mb-3 h-100">
            <div className="card-header">Occupancy Rate</div>
            <div className="card-body">
              <h3 className="card-title">{stats.occupancyRate}%</h3>
              <p className="card-text">Total capacity utilization</p>
            </div>
          </div>
        </div>

        {/* Agreements Due <= 90 Days */}
        <div className="col-md-3" style={{ cursor: 'pointer' }} onClick={() => goToAgreements('due_soon')}>
          <div className="card text-white bg-warning mb-3 h-100">
            <div className="card-header">Due ≤ 90 Days</div>
            <div className="card-body">
              <h3 className="card-title">{stats.dueAgreements}</h3>
              <p className="card-text">Click to view details</p>
            </div>
          </div>
        </div>

        {/* Past Due Agreements */}
        <div className="col-md-3" style={{ cursor: 'pointer' }} onClick={() => goToAgreements('past_due')}>
          <div className="card text-white bg-danger mb-3 h-100">
            <div className="card-header">Past Due</div>
            <div className="card-body">
              <h3 className="card-title">{stats.pastDueAgreements}</h3>
              <p className="card-text">Click to view details</p>
            </div>
          </div>
        </div>

         {/* Inactive Employees */}
         <div className="col-md-3" style={{ cursor: 'pointer' }} onClick={goToEmployees}>
          <div className="card text-white bg-secondary mb-3 h-100">
            <div className="card-header">Inactive Employees</div>
            <div className="card-body">
              <h3 className="card-title">{stats.inactiveEmployees}</h3>
              <p className="card-text">Total inactive staff</p>
            </div>
          </div>
        </div>
      </div>

      {/* Graphs Row */}
      <div className="row">
        {/* Rent by Department Bar Chart */}
        <div className="col-md-8">
          <div className="card shadow mb-4">
            <div className="card-header py-3">
              <h6 className="m-0 font-weight-bold text-primary">Monthly Rent Cost by Department</h6>
            </div>
            <div className="card-body">
              {stats.rentByDepartment?.labels.length > 0 ? (
                <Bar options={{ responsive: true }} data={barChartData} />
              ) : (
                <p className="text-center py-5">No rent data available to display graph.</p>
              )}
            </div>
          </div>
        </div>

        {/* Occupancy Doughnut Chart */}
        <div className="col-md-4">
          <div className="card shadow mb-4">
            <div className="card-header py-3">
              <h6 className="m-0 font-weight-bold text-primary">Occupancy Overview</h6>
            </div>
            <div className="card-body">
               <div style={{ maxHeight: '300px', display: 'flex', justifyContent: 'center' }}>
                <Doughnut data={doughnutData} />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Removed <RecentActivities /> and <AgreementsList /> as requested */}
    </div>
  );
};

export default DashboardHome;