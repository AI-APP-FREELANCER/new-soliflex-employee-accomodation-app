import React, { useState, useEffect } from 'react';
import {
  Card,
  Table,
  Typography,
  Space,
  Tag,
  Alert,
  Spin,
  Empty,
  Button,
  message,
} from 'antd';
import { UserOutlined, AlertOutlined, FilePdfOutlined, FileExcelOutlined } from '@ant-design/icons';
import { analyticsAPI, agreementAPI } from '../services/api';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import * as XLSX from 'xlsx';

const { Title } = Typography;

const HRReporting = () => {
  const [occupancy, setOccupancy] = useState([]);
  const [renewalAlerts, setRenewalAlerts] = useState([]);
  const [agreements, setAgreements] = useState([]);
  const [loading, setLoading] = useState(false);
  const occupancyTableRef = React.useRef(null);
  const renewalTableRef = React.useRef(null);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [occupancyRes, alertsRes, agreementsRes] = await Promise.all([
        analyticsAPI.getOccupancy(),
        analyticsAPI.getRenewalAlerts(60),
        agreementAPI.getAll(),
      ]);
      setOccupancy(occupancyRes.data);
      setRenewalAlerts(alertsRes.data);
      setAgreements(agreementsRes.data);
    } catch (error) {
      console.error('Failed to fetch reporting data:', error);
    } finally {
      setLoading(false);
    }
  };

  const occupancyColumns = [
    {
      title: 'Employee Name',
      key: 'employee_name',
      render: (_, record) => {
        const name = record.employee_name || 'N/A';
        const sirName = record.employee_sir_name ? ` ${record.employee_sir_name}` : '';
        return name + sirName;
      },
    },
    {
      title: 'Department',
      dataIndex: 'employee_department',
      key: 'employee_department',
    },
    {
      title: 'Designation',
      dataIndex: 'employee_designation',
      key: 'employee_designation',
    },
    {
      title: 'Residence Address',
      dataIndex: 'residence_address',
      key: 'residence_address',
    },
    {
      title: 'Stay Start Date',
      dataIndex: 'stay_start_date',
      key: 'stay_start_date',
      render: (date) => date || 'N/A',
    },
    {
      title: 'Agreement End Date',
      key: 'agreement_end_date',
      render: (_, record) => {
        const agreement = agreements.find(a => a.agreement_id === record.agreement_id);
        return agreement?.agreement_end_date || 'N/A';
      },
    },
    {
      title: 'Agreement ID',
      dataIndex: 'agreement_id',
      key: 'agreement_id',
    },
  ];

  const renewalColumns = [
    {
      title: 'Residence Address',
      dataIndex: 'residence_address',
      key: 'residence_address',
    },
    {
      title: 'Owner Name',
      dataIndex: 'owner_name',
      key: 'owner_name',
    },
    {
      title: 'Renewal Due Date',
      dataIndex: 'renewal_due_date',
      key: 'renewal_due_date',
      render: (date) => date || 'N/A',
    },
    {
      title: 'Days Until Renewal',
      dataIndex: 'days_until_renewal',
      key: 'days_until_renewal',
      render: (days) => (
        <Tag color={days <= 30 ? 'red' : days <= 60 ? 'orange' : 'blue'}>
          {days} days
        </Tag>
      ),
    },
    {
      title: 'Monthly Rent',
      dataIndex: 'monthly_rent',
      key: 'monthly_rent',
      render: (rent) => `₹${rent || 0}`,
    },
    {
      title: 'Agreement ID',
      dataIndex: 'agreement_id',
      key: 'agreement_id',
    },
  ];

  const handleExportPDF = async () => {
    try {
      message.loading({ content: 'Generating PDF...', key: 'pdf', duration: 0 });
      
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      let yPosition = 20;

      // Title
      pdf.setFontSize(18);
      pdf.text('HR Reporting & Key Information', pageWidth / 2, yPosition, { align: 'center' });
      yPosition += 10;

      // Date
      pdf.setFontSize(10);
      pdf.text(`Generated on: ${new Date().toLocaleDateString()}`, pageWidth / 2, yPosition, { align: 'center' });
      yPosition += 15;

      // Current Occupancy Section
      pdf.setFontSize(14);
      pdf.text('Current Occupancy', 10, yPosition);
      yPosition += 10;

      // Occupancy Table Headers
      pdf.setFontSize(10);
      const occupancyHeaders = ['Employee Name', 'Department', 'Residence Address', 'Stay Start Date', 'Agreement End Date'];
      const colWidths = [40, 30, 50, 30, 30];
      let xPos = 10;
      
      occupancyHeaders.forEach((header, idx) => {
        pdf.text(header, xPos, yPosition);
        xPos += colWidths[idx];
      });
      yPosition += 8;

      // Occupancy Table Data
      pdf.setFontSize(9);
      occupancy.slice(0, 20).forEach((record) => {
        if (yPosition > pageHeight - 30) {
          pdf.addPage();
          yPosition = 20;
        }
        const agreement = agreements.find(a => a.agreement_id === record.agreement_id);
        const endDate = agreement?.agreement_end_date || 'N/A';
        const row = [
          (record.employee_name || 'N/A') + (record.employee_sir_name ? ` ${record.employee_sir_name}` : ''),
          record.employee_department || 'N/A',
          record.residence_address || 'N/A',
          record.stay_start_date || 'N/A',
          endDate,
        ];
        xPos = 10;
        row.forEach((cell, idx) => {
          pdf.text(cell.substring(0, 20), xPos, yPosition);
          xPos += colWidths[idx];
        });
        yPosition += 7;
      });

      yPosition += 10;

      // Renewal Alerts Section
      if (yPosition > pageHeight - 50) {
        pdf.addPage();
        yPosition = 20;
      }
      pdf.setFontSize(14);
      pdf.text('Renewal Alerts (Next 60 Days)', 10, yPosition);
      yPosition += 10;

      // Renewal Table Headers
      pdf.setFontSize(10);
      const renewalHeaders = ['Residence Address', 'Owner Name', 'Renewal Due Date', 'Days Until Renewal'];
      const renewalColWidths = [50, 40, 40, 30];
      xPos = 10;
      
      renewalHeaders.forEach((header, idx) => {
        pdf.text(header, xPos, yPosition);
        xPos += renewalColWidths[idx];
      });
      yPosition += 8;

      // Renewal Table Data
      pdf.setFontSize(9);
      renewalAlerts.slice(0, 20).forEach((record) => {
        if (yPosition > pageHeight - 30) {
          pdf.addPage();
          yPosition = 20;
        }
        const row = [
          record.residence_address || 'N/A',
          record.owner_name || 'N/A',
          record.renewal_due_date || 'N/A',
          `${record.days_until_renewal || 0} days`,
        ];
        xPos = 10;
        row.forEach((cell, idx) => {
          pdf.text(cell.substring(0, 25), xPos, yPosition);
          xPos += renewalColWidths[idx];
        });
        yPosition += 7;
      });

      pdf.save('HR_Reporting.pdf');
      message.success({ content: 'PDF exported successfully', key: 'pdf' });
    } catch (error) {
      console.error('Error exporting PDF:', error);
      message.error({ content: 'Failed to export PDF', key: 'pdf' });
    }
  };

  const handleExportExcel = () => {
    try {
      // Create workbook
      const wb = XLSX.utils.book_new();

      // Current Occupancy Sheet
      const occupancyData = occupancy.map(record => {
        const agreement = agreements.find(a => a.agreement_id === record.agreement_id);
        return {
          'Employee Name': (record.employee_name || 'N/A') + (record.employee_sir_name ? ` ${record.employee_sir_name}` : ''),
          'Department': record.employee_department || 'N/A',
          'Designation': record.employee_designation || 'N/A',
          'Residence Address': record.residence_address || 'N/A',
          'Stay Start Date': record.stay_start_date || 'N/A',
          'Agreement End Date': agreement?.agreement_end_date || 'N/A',
          'Agreement ID': record.agreement_id || 'N/A',
        };
      });
      const occupancyWS = XLSX.utils.json_to_sheet(occupancyData);
      XLSX.utils.book_append_sheet(wb, occupancyWS, 'Current Occupancy');

      // Renewal Alerts Sheet
      const renewalData = renewalAlerts.map(record => ({
        'Residence Address': record.residence_address || 'N/A',
        'Owner Name': record.owner_name || 'N/A',
        'Renewal Due Date': record.renewal_due_date || 'N/A',
        'Days Until Renewal': record.days_until_renewal || 0,
        'Monthly Rent': record.monthly_rent || 0,
        'Agreement ID': record.agreement_id || 'N/A',
      }));
      const renewalWS = XLSX.utils.json_to_sheet(renewalData);
      XLSX.utils.book_append_sheet(wb, renewalWS, 'Renewal Alerts');

      // Save file
      XLSX.writeFile(wb, 'HR_Reporting.xlsx');
      message.success('Excel file exported successfully');
    } catch (error) {
      console.error('Error exporting Excel:', error);
      message.error('Failed to export Excel file');
    }
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '24px' }}>
        <Title level={2} style={{ color: '#262626', margin: 0 }}>
          HR Reporting & Key Information
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
        {/* Current Occupancy Section */}
        <Card
          title={
            <Space>
              <UserOutlined />
              <span>Current Occupancy</span>
            </Space>
          }
          style={{ marginBottom: '24px' }}
        >
          {occupancy.length > 0 ? (
            <Table
              columns={occupancyColumns}
              dataSource={occupancy}
              rowKey="employee_id"
              pagination={{ pageSize: 10 }}
              size="middle"
            />
          ) : (
            <Empty description="No active occupancy records found" />
          )}
        </Card>

        {/* Renewal Alerts Section */}
        <Card
          title={
            <Space>
              <AlertOutlined />
              <span>Renewal Alerts (Next 60 Days)</span>
            </Space>
          }
        >
          {renewalAlerts.length > 0 ? (
            <>
              <Alert
                message={`${renewalAlerts.length} agreement(s) require attention`}
                description="Properties with renewal due dates approaching within the next 60 days"
                type="warning"
                showIcon
                style={{ marginBottom: '16px' }}
              />
              <Table
                columns={renewalColumns}
                dataSource={renewalAlerts}
                rowKey="agreement_id"
                pagination={{ pageSize: 10 }}
                size="middle"
              />
            </>
          ) : (
            <Empty description="No renewal alerts. All agreements are up to date." />
          )}
        </Card>
      </Spin>
    </div>
  );
};

export default HRReporting;

