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
import { useNavigate } from 'react-router-dom';

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
  const navigate = useNavigate();
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
        setStats(res.data || {});
      } catch (err) {
        console.error('Error fetching analytics:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchStats();
  }, []);

  const goToAgreements = (filterType) => {
    navigate('/agreements', { state: { filter: filterType } });
  };

  const goToEmployees = () => {
     navigate('/employees', { state: { filter: 'Inactive' } });
  };

  // Prepare Graph Data
  const barChartData = {
    labels: stats.rentByDepartment?.labels || [],
    datasets: [
      {
        label: 'Monthly Rent Cost (SAR)',
        data: stats.rentByDepartment?.data || [],
        backgroundColor: 'rgba(53, 162, 235, 0.7)',
        borderRadius: 4,
      },
    ],
  };

  const doughnutData = {
    labels: ['Occupied', 'Vacant'],
    datasets: [
      {
        data: [stats.occupancyRate || 0, 100 - (stats.occupancyRate || 0)],
        backgroundColor: [
          'rgba(75, 192, 192, 0.6)',
          'rgba(255, 99, 132, 0.6)',
        ],
        borderColor: [
          'rgba(75, 192, 192, 1)',
          'rgba(255, 99, 132, 1)',
        ],
        borderWidth: 1,
      },
    ],
  };

  if (loading) return <div className="text-center mt-5"><div className="spinner-border text-primary" role="status"></div><p>Loading Dashboard...</p></div>;

  return (
    <div className="container-fluid">
      <div className="d-sm-flex align-items-center justify-content-between mb-4">
        <h1 className="h3 mb-0 text-gray-800">Dashboard</h1>
      </div>
      
      {/* Stats Cards Row */}
      <div className="row mb-4">
        {/* Occupancy Rate */}
        <div className="col-xl-3 col-md-6 mb-4">
          <div className="card border-left-info shadow h-100 py-2">
            <div className="card-body">
              <div className="row no-gutters align-items-center">
                <div className="col mr-2">
                  <div className="text-xs font-weight-bold text-info text-uppercase mb-1">Occupancy Rate</div>
                  <div className="row no-gutters align-items-center">
                    <div className="col-auto">
                      <div className="h5 mb-0 mr-3 font-weight-bold text-gray-800">{stats.occupancyRate}%</div>
                    </div>
                    <div className="col">
                      <div className="progress progress-sm mr-2">
                        <div className="progress-bar bg-info" role="progressbar" style={{ width: `${stats.occupancyRate}%` }} aria-valuenow={stats.occupancyRate} aria-valuemin="0" aria-valuemax="100"></div>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="col-auto">
                  <i className="fas fa-clipboard-list fa-2x text-gray-300"></i>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Due <= 90 Days */}
        <div className="col-xl-3 col-md-6 mb-4" style={{ cursor: 'pointer' }} onClick={() => goToAgreements('due_soon')}>
          <div className="card border-left-warning shadow h-100 py-2">
            <div className="card-body">
              <div className="row no-gutters align-items-center">
                <div className="col mr-2">
                  <div className="text-xs font-weight-bold text-warning text-uppercase mb-1">Due in ≤ 90 Days</div>
                  <div className="h5 mb-0 font-weight-bold text-gray-800">{stats.dueAgreements}</div>
                </div>
                <div className="col-auto">
                  <i className="fas fa-exclamation-triangle fa-2x text-gray-300"></i>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Past Due */}
        <div className="col-xl-3 col-md-6 mb-4" style={{ cursor: 'pointer' }} onClick={() => goToAgreements('past_due')}>
          <div className="card border-left-danger shadow h-100 py-2">
            <div className="card-body">
              <div className="row no-gutters align-items-center">
                <div className="col mr-2">
                  <div className="text-xs font-weight-bold text-danger text-uppercase mb-1">Past Due</div>
                  <div className="h5 mb-0 font-weight-bold text-gray-800">{stats.pastDueAgreements}</div>
                </div>
                <div className="col-auto">
                  <i className="fas fa-calendar-times fa-2x text-gray-300"></i>
                </div>
              </div>
            </div>
          </div>
        </div>

         {/* Inactive Employees */}
         <div className="col-xl-3 col-md-6 mb-4" style={{ cursor: 'pointer' }} onClick={goToEmployees}>
          <div className="card border-left-secondary shadow h-100 py-2">
            <div className="card-body">
              <div className="row no-gutters align-items-center">
                <div className="col mr-2">
                  <div className="text-xs font-weight-bold text-secondary text-uppercase mb-1">Inactive Employees</div>
                  <div className="h5 mb-0 font-weight-bold text-gray-800">{stats.inactiveEmployees}</div>
                </div>
                <div className="col-auto">
                  <i className="fas fa-user-slash fa-2x text-gray-300"></i>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Graphs Row */}
      <div className="row">
        {/* Rent by Department Bar Chart */}
        <div className="col-xl-8 col-lg-7">
          <div className="card shadow mb-4">
            <div className="card-header py-3 d-flex flex-row align-items-center justify-content-between">
              <h6 className="m-0 font-weight-bold text-primary">Monthly Rent Cost by Department</h6>
            </div>
            <div className="card-body">
              <div className="chart-bar" style={{ position: 'relative', height: '320px', width: '100%' }}>
                {stats.rentByDepartment?.labels.length > 0 ? (
                  <Bar 
                    data={barChartData} 
                    options={{ 
                      maintainAspectRatio: false,
                      plugins: {
                        legend: { display: false }
                      }
                    }} 
                  />
                ) : (
                  <div className="text-center pt-5 text-gray-500">No active rent data found</div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Occupancy Doughnut Chart */}
        <div className="col-xl-4 col-lg-5">
          <div className="card shadow mb-4">
            <div className="card-header py-3 d-flex flex-row align-items-center justify-content-between">
              <h6 className="m-0 font-weight-bold text-primary">Occupancy Overview</h6>
            </div>
            <div className="card-body">
              <div className="chart-pie pt-4 pb-2" style={{ position: 'relative', height: '250px' }}>
                <Doughnut 
                  data={doughnutData} 
                  options={{ 
                    maintainAspectRatio: false, 
                    cutout: '70%',
                  }} 
                />
              </div>
              <div className="mt-4 text-center small">
                <span className="mr-2">
                  <i className="fas fa-circle text-info"></i> Occupied
                </span>
                <span className="mr-2">
                  <i className="fas fa-circle text-danger"></i> Vacant
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DashboardHome;