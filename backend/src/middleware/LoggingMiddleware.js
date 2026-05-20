const { v4: uuidv4 } = require('uuid');

/**
 * LoggingMiddleware - Handles request logging and audit trail
 * Implements OOP principles with encapsulation and reusability
 */
class LoggingMiddleware {
  /**
   * @param {Object} store - Data store for audit logs
   * @param {Object} options - Configuration options
   * @param {string} options.logLevel - Log level: 'debug', 'info', 'warn', 'error'
   * @param {boolean} options.consoleLogging - Enable console logging
   * @param {boolean} options.databaseLogging - Enable database audit logging
   */
  constructor(store, options = {}) {
    this.store = store;
    this.logLevel = options.logLevel || 'info';
    this.consoleLogging = options.consoleLogging !== false;
    this.databaseLogging = options.databaseLogging !== false;
  }

  /**
   * Express middleware handler
   */
  handle(req, res, next) {
    const requestId = uuidv4();
    const startTime = Date.now();

    // Attach request ID for tracking
    req.requestId = requestId;

    // Log request start in debug mode
    if (this.shouldLog('debug')) {
      this.logToConsole('DEBUG', `[${requestId}] ${req.method} ${req.path} - Request started`);
    }

    // Log when response finishes
    res.on('finish', () => {
      const duration = Date.now() - startTime;
      const logLevel = this.getLogLevelFromStatus(res.statusCode);
      
      // Build log entry
      const logEntry = {
        requestId,
        tenantId: req.user?.tenantId || null,
        method: req.method,
        path: req.path,
        statusCode: res.statusCode,
        durationMs: duration,
        ip: req.ip || req.connection?.remoteAddress,
        userAgent: req.get('User-Agent') || 'Unknown',
        timestamp: new Date().toISOString(),
      };

      // Console logging
      if (this.consoleLogging && this.shouldLog(logLevel)) {
        this.logRequestToConsole(logEntry, logLevel);
      }

      // Database audit logging
      if (this.databaseLogging) {
        this.logToDatabase(logEntry);
      }
    });

    next();
  }

  /**
   * Determine if message should be logged based on log level
   */
  shouldLog(level) {
    const levels = { debug: 0, info: 1, warn: 2, error: 3 };
    return levels[level] >= levels[this.logLevel];
  }

  /**
   * Get log level based on HTTP status code
   */
  getLogLevelFromStatus(statusCode) {
    if (statusCode >= 500) return 'error';
    if (statusCode >= 400) return 'warn';
    return 'info';
  }

  /**
   * Log request to console with formatting
   */
  logRequestToConsole(logEntry, level) {
    const { requestId, method, path, statusCode, durationMs, ip } = logEntry;
    const statusColor = this.getStatusColor(statusCode);
    const message = `[${requestId}] ${method} ${path} → ${statusColor}${statusCode}§[0m (${durationMs}ms) ${ip ? `- ${ip}` : ''}`;

    switch (level) {
      case 'error':
        console.error(`❌ ERROR: ${message}`);
        break;
      case 'warn':
        console.warn(`⚠️  WARN: ${message}`);
        break;
      case 'info':
        console.log(`✅ ${message}`);
        break;
      case 'debug':
        console.log(`🔍 ${message}`);
        break;
    }
  }

  /**
   * Get ANSI color code for status code
   */
  getStatusColor(statusCode) {
    if (statusCode >= 500) return '\x1b[31m'; // Red
    if (statusCode >= 400) return '\x1b[33m'; // Yellow
    if (statusCode >= 300) return '\x1b[36m'; // Cyan
    if (statusCode >= 200) return '\x1b[32m'; // Green
    return '\x1b[0m'; // Reset
  }

  /**
   * Generic console logger
   */
  logToConsole(level, message) {
    switch (level) {
      case 'error':
        console.error(message);
        break;
      case 'warn':
        console.warn(message);
        break;
      case 'info':
        console.log(message);
        break;
      case 'debug':
        console.debug(message);
        break;
    }
  }

  /**
   * Log to database with proper error handling
   */
  async logToDatabase(logEntry) {
    try {
      if (!this.store || !this.store.auditLogs) {
        console.warn('Audit log store not available');
        return;
      }

      await this.store.auditLogs.create({
        method: logEntry.method,
        path: logEntry.path,
        statusCode: logEntry.statusCode,
        durationMs: logEntry.durationMs,
        tenantId: logEntry.tenantId,
      });
    } catch (error) {
      // Log error but don't break the request
      console.error('Failed to write audit log:', error.message);
      
      // In development, log full error
      if (process.env.NODE_ENV !== 'production') {
        console.error('Audit log error details:', error.stack);
      }
    }
  }

  /**
   * Log authentication events
   */
  logAuthentication(req, success, reason = '') {
    const level = success ? 'info' : 'warn';
    const message = success
      ? `Authentication successful: ${req.user?.email || 'Unknown'} - ${req.method} ${req.path}`
      : `Authentication failed: ${reason} - ${req.method} ${req.path}`;

    if (this.consoleLogging && this.shouldLog(level)) {
      this.logToConsole(level, success ? `✅ ${message}` : `❌ ${message}`);
    }
  }

  /**
   * Log authorization events
   */
  logAuthorization(req, success, resource = '') {
    const level = success ? 'info' : 'warn';
    const message = success
      ? `Authorization granted: ${req.user?.email} accessed ${resource}`
      : `Authorization denied: ${req.user?.email} attempted to access ${resource}`;

    if (this.consoleLogging && this.shouldLog(level)) {
      this.logToConsole(level, success ? `✅ ${message}` : `🚫 ${message}`);
    }
  }
}

module.exports = { LoggingMiddleware };
