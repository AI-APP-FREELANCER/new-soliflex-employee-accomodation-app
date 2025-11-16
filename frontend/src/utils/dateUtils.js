import dayjs from 'dayjs';
import customParseFormat from 'dayjs/plugin/customParseFormat';

dayjs.extend(customParseFormat);

// Minimum valid year for all dates (2023)
const MIN_VALID_YEAR = 2023;
const MAX_VALID_YEAR = 2100; // Reasonable upper bound

/**
 * Convert Excel serial date to JavaScript Date
 * Excel dates are stored as days since January 1, 1900
 * @param {number} excelSerial - Excel serial date number
 * @returns {dayjs.Dayjs|null} dayjs object or null if invalid
 */
const convertExcelSerialDate = (excelSerial) => {
  if (typeof excelSerial !== 'number' || isNaN(excelSerial)) return null;
  
  // Excel epoch is January 1, 1900, but Excel incorrectly treats 1900 as a leap year
  // So we need to adjust: Excel day 1 = Jan 1, 1900, but we subtract 2 days for the correction
  const excelEpoch = dayjs('1899-12-30');
  const jsDate = excelEpoch.add(excelSerial - 1, 'day');
  
  // Validate the converted date is reasonable
  if (jsDate.year() < MIN_VALID_YEAR || jsDate.year() > MAX_VALID_YEAR) {
    return null;
  }
  
  return jsDate;
};

/**
 * Robust date parser that handles multiple formats including Excel serial dates
 * @param {string|number|dayjs.Dayjs|Date} dateInput - Date input in various formats
 * @returns {dayjs.Dayjs|null} dayjs object or null if invalid
 */
const robustDateParser = (dateInput) => {
  if (!dateInput && dateInput !== 0) return null;
  
  // If it's already a dayjs object and valid, return it
  if (dayjs.isDayjs(dateInput) && dateInput.isValid()) {
    return dateInput;
  }
  
  // If it's a number, check if it's an Excel serial date
  if (typeof dateInput === 'number') {
    // Excel serial dates are typically between 40000-50000 (for 2023-2037)
    // Or could be milliseconds timestamp (13 digits) or seconds timestamp (10 digits)
    if (dateInput > 40000 && dateInput < 100000) {
      // Likely Excel serial date
      const converted = convertExcelSerialDate(dateInput);
      if (converted && converted.isValid()) return converted;
    } else if (dateInput > 1000000000000) {
      // Milliseconds timestamp (13+ digits)
      const dateObj = dayjs(dateInput);
      if (dateObj.isValid()) return dateObj;
    } else if (dateInput > 1000000000 && dateInput < 10000000000) {
      // Seconds timestamp (10 digits)
      const dateObj = dayjs(dateInput * 1000);
      if (dateObj.isValid()) return dateObj;
    }
    return null;
  }
  
  // Try parsing as string in various formats
  if (typeof dateInput === 'string') {
    // Try YYYY-MM-DD format first (most common from API)
    let dateObj = dayjs(dateInput, 'YYYY-MM-DD', true);
    if (dateObj.isValid()) return dateObj;
    
    // Try DD-MM-YYYY format
    dateObj = dayjs(dateInput, 'DD-MM-YYYY', true);
    if (dateObj.isValid()) return dateObj;
    
    // Try ISO format
    dateObj = dayjs(dateInput);
    if (dateObj.isValid()) return dateObj;
  }
  
  // Try as Date object
  if (dateInput instanceof Date) {
    const dateObj = dayjs(dateInput);
    if (dateObj.isValid()) return dateObj;
  }
  
  return null;
};

/**
 * Validate date is in the expected range (2023-2100)
 * @param {dayjs.Dayjs} dateObj - dayjs object to validate
 * @returns {boolean} true if date is in valid range
 */
const validateDateRange = (dateObj) => {
  if (!dateObj || !dateObj.isValid()) return false;
  const year = dateObj.year();
  return year >= MIN_VALID_YEAR && year <= MAX_VALID_YEAR;
};

/**
 * Format date for display in DD-MM-YYYY format
 * Handles Excel serial dates and validates date range
 * @param {string|number|dayjs.Dayjs|Date} date - Date to format
 * @returns {string} Formatted date string (DD-MM-YYYY) or 'N/A' if invalid
 */
export const formatDateForDisplay = (date) => {
  if (!date && date !== 0) return 'N/A';
  
  const dateObj = robustDateParser(date);
  if (!dateObj || !dateObj.isValid()) {
    // If parsing failed, log for debugging
    console.warn('Invalid date format detected:', date, typeof date);
    return 'N/A';
  }
  
  // Validate date range
  if (!validateDateRange(dateObj)) {
    console.warn('Date out of valid range (2023-2100):', date, 'parsed as:', dateObj.format('YYYY-MM-DD'));
    return 'N/A';
  }
  
  return dateObj.format('DD-MM-YYYY');
};

/**
 * Format date for API in YYYY-MM-DD format (backend expects this)
 * Handles Excel serial dates and validates date range
 * @param {string|number|dayjs.Dayjs|Date} date - Date to format
 * @returns {string} Formatted date string (YYYY-MM-DD) or null if invalid
 */
export const formatDateForAPI = (date) => {
  if (!date && date !== 0) return null;
  
  const dateObj = robustDateParser(date);
  if (!dateObj || !dateObj.isValid()) {
    console.warn('Failed to format date for API:', date, typeof date);
    return null;
  }
  
  // Validate date range
  if (!validateDateRange(dateObj)) {
    console.warn('Date for API out of valid range (2023-2100):', date);
    return null;
  }
  
  return dateObj.format('YYYY-MM-DD');
};

/**
 * Parse date from API (YYYY-MM-DD) to dayjs object
 * Handles Excel serial dates and validates date range
 * @param {string|number} dateInput - Date string from API (YYYY-MM-DD) or Excel serial number
 * @returns {dayjs.Dayjs|null} dayjs object or null if invalid
 */
export const parseDateFromAPI = (dateInput) => {
  if (!dateInput && dateInput !== 0) return null;
  
  const dateObj = robustDateParser(dateInput);
  if (!dateObj || !dateObj.isValid()) {
    console.warn('Failed to parse date from API:', dateInput, typeof dateInput);
    return null;
  }
  
  // Validate date range
  if (!validateDateRange(dateObj)) {
    console.warn('Date from API out of valid range (2023-2100):', dateInput, 'parsed as:', dateObj.format('YYYY-MM-DD'));
    return null;
  }
  
  return dateObj;
};

/**
 * Format date for DatePicker input (DD-MM-YYYY)
 * Handles Excel serial dates and validates date range
 * @param {string|number|dayjs.Dayjs|Date} date - Date to format
 * @returns {dayjs.Dayjs|null} dayjs object formatted for DatePicker or null
 */
export const formatDateForInput = (date) => {
  if (!date && date !== 0) return null;
  
  const dateObj = robustDateParser(date);
  if (!dateObj || !dateObj.isValid()) return null;
  
  // Validate date range
  if (!validateDateRange(dateObj)) {
    console.warn('Date for input out of valid range (2023-2100):', date);
    return null;
  }
  
  return dateObj;
};

/**
 * Get minimum date for DatePicker (January 1, 2023)
 * @returns {dayjs.Dayjs} Minimum valid date
 */
export const getMinDate = () => {
  return dayjs(`${MIN_VALID_YEAR}-01-01`);
};

/**
 * Get maximum date for DatePicker (reasonable future date)
 * @returns {dayjs.Dayjs} Maximum valid date
 */
export const getMaxDate = () => {
  return dayjs(`${MAX_VALID_YEAR}-12-31`);
};

/**
 * Parse date from DD-MM-YYYY string to dayjs object
 * @param {string} dateString - Date string in DD-MM-YYYY format
 * @returns {dayjs.Dayjs|null} dayjs object or null if invalid
 */
export const parseDateFromDisplay = (dateString) => {
  if (!dateString) return null;
  const dateObj = dayjs(dateString, 'DD-MM-YYYY', true);
  if (!dateObj.isValid()) return null;
  return dateObj;
};

