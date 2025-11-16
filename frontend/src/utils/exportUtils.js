import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import * as XLSX from 'xlsx';
import dayjs from 'dayjs';

/**
 * Export an HTML element to PDF using html2canvas
 * @param {HTMLElement|React.RefObject} element - The element or ref to capture
 * @param {string} filename - The filename for the PDF
 * @param {object} options - Additional options for html2canvas
 */
export const exportToPDF = async (element, filename, options = {}) => {
  try {
    const elementToCapture = element?.current || element;
    if (!elementToCapture) {
      throw new Error('Element not found for PDF export');
    }

    const canvas = await html2canvas(elementToCapture, {
      scale: 2,
      useCORS: true,
      backgroundColor: '#ffffff',
      ...options,
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

    pdf.save(filename || `export_${dayjs().format('YYYY-MM-DD')}.pdf`);
    return true;
  } catch (error) {
    console.error('Error exporting to PDF:', error);
    throw error;
  }
};

/**
 * Export multiple elements to PDF (for charts and sections)
 * @param {Array} elements - Array of {element, title} objects
 * @param {string} filename - The filename for the PDF
 */
export const exportChartsToPDF = async (elements, filename) => {
  try {
    const pdf = new jsPDF('p', 'mm', 'a4');
    const imgWidth = 210;
    const pageHeight = 295;

    for (let i = 0; i < elements.length; i++) {
      const { element, title } = elements[i];
      const elementToCapture = element?.current || element;
      
      if (!elementToCapture) continue;

      const canvas = await html2canvas(elementToCapture, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#ffffff',
      });

      const imgData = canvas.toDataURL('image/png');
      const imgHeight = (canvas.height * imgWidth) / canvas.width;

      // Add title if provided
      if (title && i > 0) {
        pdf.addPage();
      }
      if (title) {
        pdf.setFontSize(16);
        pdf.text(title, 10, 10);
      }

      let heightLeft = imgHeight;
      let position = title ? 20 : 0;

      // If image is too tall, split across pages
      if (heightLeft > pageHeight - position) {
        pdf.addImage(imgData, 'PNG', 0, position, imgWidth, pageHeight - position);
        heightLeft -= (pageHeight - position);
        
        while (heightLeft > 0) {
          pdf.addPage();
          const currentPageHeight = Math.min(heightLeft, pageHeight);
          pdf.addImage(imgData, 'PNG', 0, 0, imgWidth, currentPageHeight, 0, position - (pageHeight - position));
          heightLeft -= pageHeight;
        }
      } else {
        pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
      }
    }

    pdf.save(filename || `export_${dayjs().format('YYYY-MM-DD')}.pdf`);
    return true;
  } catch (error) {
    console.error('Error exporting charts to PDF:', error);
    throw error;
  }
};

/**
 * Export data array to Excel
 * @param {Array} data - Array of objects to export
 * @param {string} sheetName - Name of the Excel sheet
 * @param {string} filename - The filename for the Excel file
 */
export const exportTableToExcel = (data, sheetName = 'Sheet1', filename) => {
  try {
    if (!data || data.length === 0) {
      throw new Error('No data to export');
    }

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, sheetName);

    const exportFilename = filename || `export_${dayjs().format('YYYY-MM-DD')}.xlsx`;
    XLSX.writeFile(wb, exportFilename);
    return true;
  } catch (error) {
    console.error('Error exporting to Excel:', error);
    throw error;
  }
};

/**
 * Export multiple data arrays to Excel with multiple sheets
 * @param {Array} sheets - Array of {data, sheetName} objects
 * @param {string} filename - The filename for the Excel file
 */
export const exportMultipleSheetsToExcel = (sheets, filename) => {
  try {
    if (!sheets || sheets.length === 0) {
      throw new Error('No sheets to export');
    }

    const wb = XLSX.utils.book_new();

    sheets.forEach(({ data, sheetName }) => {
      if (data && data.length > 0) {
        const ws = XLSX.utils.json_to_sheet(data);
        XLSX.utils.book_append_sheet(wb, ws, sheetName || 'Sheet1');
      }
    });

    const exportFilename = filename || `export_${dayjs().format('YYYY-MM-DD')}.xlsx`;
    XLSX.writeFile(wb, exportFilename);
    return true;
  } catch (error) {
    console.error('Error exporting multiple sheets to Excel:', error);
    throw error;
  }
};

