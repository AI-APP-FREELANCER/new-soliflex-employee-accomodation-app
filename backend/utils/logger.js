/**
 * Production-safe logging utility
 * Only logs in development mode or when explicitly enabled
 */

const isDevelopment = process.env.NODE_ENV === 'development';
const isLoggingEnabled = process.env.ENABLE_LOGGING === 'true';

/**
 * Log error securely without exposing sensitive information
 * @param {string} context - Context where error occurred (e.g., 'User Login')
 * @param {Error} error - Error object
 * @param {object} additionalData - Additional safe data to log (no sensitive info)
 */
const logError = (context, error, additionalData = {}) => {
  if (isDevelopment || isLoggingEnabled) {
    const errorInfo = {
      context,
      message: error?.message || 'Unknown error',
      ...(additionalData && Object.keys(additionalData).length > 0 ? additionalData : {})
    };
    console.error(`[${context}]`, errorInfo);
  }
};

/**
 * Log info message (only in development)
 * @param {string} message - Message to log
 * @param {object} data - Additional data
 */
const logInfo = (message, data = {}) => {
  if (isDevelopment || isLoggingEnabled) {
    console.log(`[INFO] ${message}`, Object.keys(data).length > 0 ? data : '');
  }
};

module.exports = {
  logError,
  logInfo
};

