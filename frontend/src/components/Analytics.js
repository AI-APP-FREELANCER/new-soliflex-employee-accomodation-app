import React, { useState, useEffect, useRef } from 'react';
import {
  Card,
  Row,
  Col,
  Typography,
  Button,
  Space,
  Spin,
  Alert,
  Statistic,
  Select,
  message,
} from 'antd';
import {
  FilePdfOutlined,
  FileExcelOutlined,
  DollarOutlined,
  WalletOutlined,
  RiseOutlined,
  HistoryOutlined,
} from '@ant-design/icons';
import { Column, Pie, Line } from '@ant-design/charts';
import { analyticsAPI, residenceAPI, agreementAPI } from '../services/api';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import * as XLSX from 'xlsx';
import dayjs from 'dayjs';

const { Title } = Typography;
const { Option } = Select;

const Analytics = () => {
  const [loading, setLoading] = useState(false);
  const [financialSummary, setFinancialSummary] = useState(null);
  const [monthlySpend, setMonthlySpend] = useState([]);
  const [employeeBreakdown, setEmployeeBreakdown] = useState(null);
  const [yearlyTrend, setYearlyTrend] = useState([]);
  const [recommendations, setRecommendations] = useState([]);
  const [residences, setResidences] = useState([]);
  const [agreements, setAgreements] = useState([]);
  const analyticsRef = useRef(null);
  
  // Calculate yearly trend data from financial summary
  const currentYear = new Date().getFullYear();
  const previousYear = currentYear - 1;
  const nextYear = currentYear + 1;
  const yearlyTrendData = [];
  
  if (financialSummary) {
    console.log('Financial Summary for Yearly Trend:', financialSummary);
    
    // Add previous year (2023) actual spend
    const year2023Value = parseFloat(financialSummary.year2023) || 0;
    if (year2023Value > 0) {
      yearlyTrendData.push({
        year: previousYear.toString(),
        value: year2023Value,
        type: 'Actual Spend',
      });
    }
    
    // Add current year (2024) actual spend
    const year2024Value = parseFloat(financialSummary.year2024) || 0;
    if (year2024Value > 0) {
      yearlyTrendData.push({
        year: currentYear.toString(),
        value: year2024Value,
        type: 'Actual Spend',
      });
    }
    
    // Add next year (2025) predicted cost
    const year2025Value = parseFloat(financialSummary.year2025) || 0;
    if (year2025Value > 0) {
      yearlyTrendData.push({
        year: nextYear.toString(),
        value: year2025Value,
        type: 'Predicted Cost',
      });
    }
  }
  
  console.log('Yearly Trend Data:', yearlyTrendData);

  useEffect(() => {
    fetchAllData();
  }, []);

  const fetchAllData = async () => {
    setLoading(true);
    try {
      const [
        summaryRes,
        monthlyRes,
        employeeRes,
        yearlyRes,
        recommendationsRes,
        residencesRes,
        agreementsRes,
      ] = await Promise.all([
        analyticsAPI.getFinancialSummary(),
        analyticsAPI.getSpendOverTime('monthly'),
        analyticsAPI.getEmployeeBreakdown(),
        analyticsAPI.getSpendOverTime('yearly'),
        analyticsAPI.getCostOptimizationRecommendations(),
        residenceAPI.getAll(),
        agreementAPI.getAll(),
      ]);

      setFinancialSummary(summaryRes.data);
      
      // Get last 12 months of data (filter by current date and ensure valid numbers)
      const today = dayjs();
      const monthlyData = Array.isArray(monthlyRes.data) ? monthlyRes.data : [];
      console.log('Monthly Spend Raw Data:', monthlyData);
      
      const last12MonthsData = monthlyData
        .map((item) => {
          const amount = parseFloat(item.amount) || 0;
          return {
            ...item,
            amount: isNaN(amount) ? 0 : amount,
          };
        })
        .filter((item) => {
          if (!item.period || item.amount <= 0) return false;
          const [year, month] = item.period.split('-');
          if (!year || !month) return false;
          const itemDate = dayjs(`${year}-${month}-01`);
          if (!itemDate.isValid()) return false;
          const monthsAgo = today.diff(itemDate, 'month');
          return monthsAgo >= 0 && monthsAgo < 12;
        })
        .sort((a, b) => a.period.localeCompare(b.period))
        .slice(-12);
      
      console.log('Monthly Spend Filtered Data (Last 12 months):', last12MonthsData);
      setMonthlySpend(last12MonthsData);
      
      setEmployeeBreakdown(employeeRes.data);
      
      // Get only 2023, 2024, 2025 for trend comparison (ensure valid numbers)
      const currentYear = new Date().getFullYear();
      const allowedYears = [
        (currentYear - 1).toString(), // 2023
        currentYear.toString(),        // 2024
        (currentYear + 1).toString(),  // 2025
      ];
      
      const filteredYears = yearlyRes.data
        .map((item) => {
          const amount = parseFloat(item.amount) || 0;
          return {
            ...item,
            amount: isNaN(amount) ? 0 : amount,
          };
        })
        .filter(item => {
          const year = item.period.toString();
          return allowedYears.includes(year) && item.amount > 0;
        })
        .sort((a, b) => a.period.localeCompare(b.period));
      
      setYearlyTrend(filteredYears);
      
      setRecommendations(recommendationsRes.data.recommendations || []);
      setResidences(residencesRes.data);
      setAgreements(agreementsRes.data);
    } catch (error) {
      message.error('Failed to fetch analytics data');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  // Chart 1: Bar Chart - Monthly Rent Spend (Last 12 months) - Refined Background
  // Debug: Log data structure
  console.log('Monthly Spend Chart Data:', monthlySpend);
  
  const monthlySpendConfig = {
    data: Array.isArray(monthlySpend) && monthlySpend.length > 0
      ? monthlySpend.filter(item => item && item.amount > 0)
      : [],
    xField: 'period',
    yField: 'amount',
    color: '#E87103',
    theme: {
      background: '#F0F2F5', // Light grey background for readability
    },
    label: {
      position: 'top',
      offset: 5,
      style: {
        fill: '#262626', // Dark text on light background
        fontSize: 14,
        fontWeight: 'bold',
      },
      formatter: (datum) => {
        const amount = parseFloat(datum.amount) || 0;
        if (amount > 0) {
          if (amount >= 1000000) {
            return `₹${(amount / 1000000).toFixed(2)}M`;
          } else if (amount >= 1000) {
            return `₹${(amount / 1000).toFixed(1)}k`;
          }
          return `₹${amount.toLocaleString()}`;
        }
        return '';
      },
    },
    xAxis: {
      title: {
        text: 'Period',
        style: {
          fill: '#262626', // Dark text on light background
          fontSize: 14,
          fontWeight: 600,
        },
      },
      label: {
        autoRotate: false,
        style: {
          fill: '#262626', // Dark text on light background
          fontSize: 13,
          fontWeight: 500,
        },
      },
      line: {
        style: {
          stroke: '#D9D9D9', // Light grey axis line
          lineWidth: 1,
        },
      },
      tickLine: {
        style: {
          stroke: '#D9D9D9',
        },
      },
    },
    yAxis: {
      title: {
        text: 'Amount (₹)',
        style: {
          fill: '#262626', // Dark text on light background
          fontSize: 14,
          fontWeight: 600,
        },
      },
      label: {
        style: {
          fill: '#262626', // Dark text on light background
          fontSize: 13,
          fontWeight: 500,
        },
        formatter: (value) => {
          if (value >= 1000000) {
            return `₹${(value / 1000000).toFixed(1)}M`;
          } else if (value >= 1000) {
            return `₹${(value / 1000).toFixed(0)}k`;
          }
          return `₹${value}`;
        },
      },
      grid: {
        line: {
          style: {
            stroke: '#E8E8E8', // Light grey grid lines
            lineWidth: 1,
          },
        },
      },
      line: {
        style: {
          stroke: '#D9D9D9', // Light grey axis line
          lineWidth: 1,
        },
      },
      tickLine: {
        style: {
          stroke: '#D9D9D9',
        },
      },
    },
    tooltip: {
      domStyles: {
        'g2-tooltip': {
          color: '#262626',
          backgroundColor: '#FFFFFF',
          border: '1px solid #D9D9D9',
        },
        'g2-tooltip-title': {
          color: '#262626',
          fontSize: '14px',
          fontWeight: 'bold',
        },
        'g2-tooltip-list-item': {
          color: '#262626',
          fontSize: '13px',
        },
      },
    },
    meta: {
      period: { alias: 'Period' },
      amount: { alias: 'Amount (₹)' },
    },
  };

  // Chart 2: Pie Chart - Employee Breakdown by Department - External Labels Only
  const employeePieConfig = {
    data: (employeeBreakdown?.byDepartment || []).filter(item => item.count > 0),
    angleField: 'count',
    colorField: 'department',
    radius: 0.75,
    innerRadius: 0.4,
    theme: {
      background: '#F0F2F5', // Light grey background for readability
      colors10: ['#E87103', '#1890ff', '#52c41a', '#eb2f96', '#722ed1', '#13c2c2', '#faad14', '#f5222d'],
    },
    label: false, // Remove internal labels
    legend: {
      position: 'right',
      layout: 'vertical',
      itemName: {
        style: {
          fill: '#262626', // Dark text on light background
          fontSize: 14,
          fontWeight: 600,
        },
        formatter: (text, item) => {
          const total = (employeeBreakdown?.byDepartment || []).reduce((sum, d) => sum + (d.count || 0), 0);
          const percentage = total > 0 ? ((item.count / total) * 100).toFixed(1) : 0;
          return `${text}: ${item.count} (${percentage}%)`;
        },
      },
    },
    tooltip: {
      domStyles: {
        'g2-tooltip': {
          color: '#262626',
          backgroundColor: '#FFFFFF',
          border: '1px solid #D9D9D9',
        },
        'g2-tooltip-title': {
          color: '#262626',
          fontSize: '14px',
          fontWeight: 'bold',
        },
        'g2-tooltip-list-item': {
          color: '#262626',
          fontSize: '13px',
        },
      },
      formatter: (datum) => {
        const total = (employeeBreakdown?.byDepartment || []).reduce((sum, d) => sum + (d.count || 0), 0);
        const percentage = total > 0 ? ((datum.count / total) * 100).toFixed(1) : 0;
        return {
          name: datum.department,
          value: `${datum.count} employees (${percentage}%)`,
        };
      },
    },
    interactions: [{ type: 'element-active' }],
  };

  // Chart 3: Line Chart - Yearly Cost Trend - Refined Background
  // Filter to only include valid years (previous, current, next)
  // Use the currentYear already declared at component level
  const validYears = [
    (currentYear - 1).toString(),
    currentYear.toString(),
    (currentYear + 1).toString(),
  ];
  
  const filteredYearlyData = yearlyTrendData.filter(item => {
    const year = item.year.toString();
    const isValidYear = validYears.includes(year);
    const hasValidValue = item.value > 0 && !isNaN(item.value);
    return isValidYear && hasValidValue;
  });
  
  console.log('Filtered Yearly Trend Data:', filteredYearlyData);
  
  const yearlyTrendConfig = {
    data: filteredYearlyData,
    xField: 'year',
    yField: 'value',
    seriesField: 'type',
    color: ['#E87103', '#1890ff'],
    theme: {
      background: '#F0F2F5', // Light grey background for readability
    },
    point: {
      size: 5,
      shape: 'circle',
    },
    label: {
      style: {
        fill: '#262626', // Dark text on light background
        fontSize: 14,
        fontWeight: 'bold',
      },
      formatter: (datum) => {
        const value = parseFloat(datum.value) || 0;
        if (value > 0) {
          if (value >= 10000000) {
            return `₹${(value / 10000000).toFixed(2)}Cr`;
          } else if (value >= 100000) {
            return `₹${(value / 100000).toFixed(1)}L`;
          } else if (value >= 1000) {
            return `₹${(value / 1000).toFixed(1)}k`;
          }
          return `₹${value.toLocaleString()}`;
        }
        return '';
      },
    },
    xAxis: {
      title: {
        text: 'Year',
        style: {
          fill: '#262626', // Dark text on light background
          fontSize: 14,
          fontWeight: 600,
        },
      },
      label: {
        style: {
          fill: '#262626', // Dark text on light background
          fontSize: 13,
          fontWeight: 500,
        },
        formatter: (text) => {
          // Ensure only valid years are shown (2023, 2024, 2025)
          const year = parseInt(text);
          // Use the currentYear already declared at component level
          if (year >= currentYear - 1 && year <= currentYear + 1) {
            return text;
          }
          return ''; // Hide invalid years
        },
      },
      line: {
        style: {
          stroke: '#D9D9D9', // Light grey axis line
          lineWidth: 1,
        },
      },
      tickLine: {
        style: {
          stroke: '#D9D9D9',
        },
      },
    },
    yAxis: {
      title: {
        text: 'Amount (₹)',
        style: {
          fill: '#262626', // Dark text on light background
          fontSize: 14,
          fontWeight: 600,
        },
      },
      label: {
        style: {
          fill: '#262626', // Dark text on light background
          fontSize: 13,
          fontWeight: 500,
        },
        formatter: (value) => {
          if (value >= 10000000) {
            return `₹${(value / 10000000).toFixed(1)}Cr`;
          } else if (value >= 100000) {
            return `₹${(value / 100000).toFixed(0)}L`;
          } else if (value >= 1000) {
            return `₹${(value / 1000).toFixed(0)}k`;
          }
          return `₹${value}`;
        },
      },
      grid: {
        line: {
          style: {
            stroke: '#E8E8E8', // Light grey grid lines
            lineWidth: 1,
          },
        },
      },
      line: {
        style: {
          stroke: '#D9D9D9', // Light grey axis line
          lineWidth: 1,
        },
      },
      tickLine: {
        style: {
          stroke: '#D9D9D9',
        },
      },
    },
    legend: {
      itemName: {
        style: {
          fill: '#262626', // Dark text on light background
          fontSize: 14,
          fontWeight: 600,
        },
      },
    },
    tooltip: {
      domStyles: {
        'g2-tooltip': {
          color: '#262626',
          backgroundColor: '#FFFFFF',
          border: '1px solid #D9D9D9',
        },
        'g2-tooltip-title': {
          color: '#262626',
          fontSize: '14px',
          fontWeight: 'bold',
        },
        'g2-tooltip-list-item': {
          color: '#262626',
          fontSize: '13px',
        },
      },
    },
    meta: {
      year: { alias: 'Year' },
      value: { alias: 'Amount (₹)' },
    },
  };

  // Export to PDF
  const handleExportPDF = async () => {
    if (!analyticsRef.current) return;

    try {
      message.loading({ content: 'Generating PDF...', key: 'pdf' });
      
      const canvas = await html2canvas(analyticsRef.current, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#141414',
      });

      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF('p', 'mm', 'a4');
      const imgWidth = 210;
      const pageHeight = 295;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      let heightLeft = imgHeight;

      let position = 0;

      pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
      heightLeft -= pageHeight;

      while (heightLeft >= 0) {
        position = heightLeft - imgHeight;
        pdf.addPage();
        pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
        heightLeft -= pageHeight;
      }

      pdf.save(`Analytics_Report_${dayjs().format('YYYY-MM-DD')}.pdf`);
      message.success({ content: 'PDF exported successfully!', key: 'pdf' });
    } catch (error) {
      message.error({ content: 'Failed to export PDF', key: 'pdf' });
      console.error(error);
    }
  };

  // Export to Excel
  const handleExportExcel = () => {
    try {
      message.loading({ content: 'Generating Excel...', key: 'excel' });

      // Prepare residences data
      const residencesData = residences.map((r) => ({
        'Residence ID': r.residence_id,
        'Owner Name': r.residence_owner_name || '',
        'Address': [
          r.residence_address_line_1,
          r.residence_address_line_2,
          r.residence_address_line_3,
        ]
          .filter(Boolean)
          .join(', '),
        'House Count': r.residence_house_count || 0,
        'Status': r.residence_status || '',
      }));

      // Prepare agreements data
      const agreementsData = agreements.map((a) => ({
        'Agreement ID': a.agreement_id,
        'Residence ID': a.agreement_residence_id || '',
        'Possession Date': a.agreement_possesion_date || '',
        'Renewal Due Date': a.agreement_renewal_due_date || '',
        'Monthly Rent': a.agreement_monthly_rent_amount || 0,
        'Advance Amount': a.agreement_advance_amount || 0,
        'Status': a.agreement_status || '',
      }));

      // Create workbook
      const wb = XLSX.utils.book_new();

      // Add residences sheet
      const ws1 = XLSX.utils.json_to_sheet(residencesData);
      XLSX.utils.book_append_sheet(wb, ws1, 'Residences');

      // Add agreements sheet
      const ws2 = XLSX.utils.json_to_sheet(agreementsData);
      XLSX.utils.book_append_sheet(wb, ws2, 'Agreements');

      // Add financial summary sheet
      if (financialSummary) {
        const financialData = [
          {
            Metric: 'Total Current Monthly Spend',
            Value: `₹${financialSummary.totalCurrentMonthlySpend?.toLocaleString() || 0}`,
          },
          {
            Metric: 'Total Current Advance Spent',
            Value: `₹${financialSummary.totalCurrentAdvanceSpent?.toLocaleString() || 0}`,
          },
          {
            Metric: 'Likely Cost Prediction (Next Year)',
            Value: `₹${financialSummary.likelyCostPrediction?.toLocaleString() || 0}`,
          },
          {
            Metric: 'Active Agreements Count',
            Value: financialSummary.activeAgreementsCount || 0,
          },
        ];
        const ws3 = XLSX.utils.json_to_sheet(financialData);
        XLSX.utils.book_append_sheet(wb, ws3, 'Financial Summary');
      }

      // Write file
      XLSX.writeFile(wb, `Analytics_Data_${dayjs().format('YYYY-MM-DD')}.xlsx`);
      message.success({ content: 'Excel exported successfully!', key: 'excel' });
    } catch (error) {
      message.error({ content: 'Failed to export Excel', key: 'excel' });
      console.error(error);
    }
  };

  return (
    <div ref={analyticsRef}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '24px' }}>
        <Title level={2} style={{ color: '#262626', margin: 0 }}>
          Analytics Dashboard
        </Title>
        <Space>
          <Button
            type="primary"
            icon={<FilePdfOutlined />}
            onClick={handleExportPDF}
          >
            Export PDF
          </Button>
          <Button
            type="primary"
            icon={<FileExcelOutlined />}
            onClick={handleExportExcel}
          >
            Export Excel
          </Button>
        </Space>
      </div>

      <Spin spinning={loading}>
        {/* Financial Summary Cards */}
        {financialSummary && (
          <Row gutter={[16, 16]} style={{ marginBottom: '24px' }}>
            <Col xs={24} sm={12} lg={6}>
              <Card>
                <Statistic
                  title="Total Monthly Spend"
                  value={financialSummary.totalCurrentMonthlySpend || 0}
                  prefix={<DollarOutlined />}
                  precision={2}
                  formatter={(value) => `₹${value.toLocaleString()}`}
                />
              </Card>
            </Col>
            <Col xs={24} sm={12} lg={6}>
              <Card>
                <Statistic
                  title="Total Advance Spent"
                  value={financialSummary.totalCurrentAdvanceSpent || 0}
                  prefix={<WalletOutlined />}
                  precision={2}
                  formatter={(value) => `₹${value.toLocaleString()}`}
                />
              </Card>
            </Col>
            <Col xs={24} sm={12} lg={6}>
              <Card>
                <Statistic
                  title="Cost Prediction (Next Year)"
                  value={financialSummary.likelyCostPrediction || 0}
                  prefix={<RiseOutlined />}
                  precision={2}
                  formatter={(value) => `₹${value.toLocaleString()}`}
                />
              </Card>
            </Col>
            <Col xs={24} sm={12} lg={6}>
              <Card>
                <Statistic
                  title="Active Agreements"
                  value={financialSummary.activeAgreementsCount || 0}
                  prefix={<HistoryOutlined />}
                />
              </Card>
            </Col>
          </Row>
        )}

        {/* Cost Optimization Recommendations */}
        {recommendations.length > 0 && (
          <Card
            title="Cost Optimization Recommendations"
            style={{ marginBottom: '24px' }}
          >
            {recommendations.map((rec, index) => (
              <Alert
                key={index}
                message={rec.message}
                type={
                  rec.priority === 'high'
                    ? 'error'
                    : rec.priority === 'medium'
                    ? 'warning'
                    : 'info'
                }
                showIcon
                style={{ marginBottom: '12px' }}
              />
            ))}
          </Card>
        )}

        {/* Charts Row 1 */}
        <Row gutter={[16, 16]} style={{ marginBottom: '24px' }}>
          <Col xs={24} lg={12}>
            <Card title="Monthly Rent Spend (Last 12 Months)">
              {monthlySpend.length > 0 ? (
                <div style={{ background: '#F0F2F5', padding: '16px', borderRadius: '8px' }}>
                  <Column {...monthlySpendConfig} height={300} />
                </div>
              ) : (
                <div style={{ padding: '40px', textAlign: 'center', color: '#8c8c8c' }}>
                  No monthly spend data available
                </div>
              )}
            </Card>
          </Col>
          <Col xs={24} lg={12}>
            <Card title="Employee Breakdown by Department">
              <div style={{ background: '#F0F2F5', padding: '16px', borderRadius: '8px' }}>
                <Pie {...employeePieConfig} height={300} />
              </div>
            </Card>
          </Col>
        </Row>

        {/* Charts Row 2 */}
        <Row gutter={[16, 16]}>
          <Col xs={24}>
            <Card title="Yearly Cost Trend (2023, 2024, 2025)">
              {yearlyTrendData.length > 0 ? (
                <div style={{ background: '#F0F2F5', padding: '16px', borderRadius: '8px' }}>
                  <Line {...yearlyTrendConfig} height={300} />
                </div>
              ) : (
                <div style={{ padding: '40px', textAlign: 'center', color: '#8c8c8c' }}>
                  No yearly trend data available
                </div>
              )}
            </Card>
          </Col>
        </Row>
      </Spin>
    </div>
  );
};

export default Analytics;

