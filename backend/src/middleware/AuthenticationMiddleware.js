const jwt = require('jsonwebtoken');
const { UnauthorizedError } = require('../errors');

/**
 * AuthenticationMiddleware - Handles JWT token verification
 * Implements OOP principles with encapsulation and reusability
 */
class AuthenticationMiddleware {
  /**
   * @param {Object} options - Configuration options
   * @param {string} options.tokenSecret - JWT secret key
   * @param {string[]} options.publicRoutes - Routes that don't require authentication
   * @param {Object} logger - LoggingMiddleware instance for auth event logging
   */
  constructor(options = {}) {
    this.tokenSecret = options.tokenSecret || process.env.TOKEN_SECRET || 'dev-secret';
    this.publicRoutes = options.publicRoutes || [
      '/',
      '/health',
      '/api/auth/login',
      '/api/auth/register',
      '/api-docs',
      '/api-docs.json',
    ];
    this.logger = options.logger || null;
    this.tokenBlacklist = new Set(); // In-memory blacklist (use Redis in production)
  }

  /**
   * Express middleware handler
   */
  handle(req, res, next) {
    // Skip authentication for public routes
    if (this.isPublicRoute(req.path)) {
      return next();
    }

    // Extract token from Authorization header
    const token = this.extractToken(req);

    if (!token) {
      this.logAuthEvent(req, false, 'No token provided');
      return next(new UnauthorizedError('Authentication required. Please provide a valid token.'));
    }

    // Check if token is blacklisted
    if (this.isTokenBlacklisted(token)) {
      this.logAuthEvent(req, false, 'Token has been revoked');
      return next(new UnauthorizedError('Token has been revoked. Please login again.'));
    }

    // Verify token
    const user = this.verifyToken(token);

    if (!user) {
      this.logAuthEvent(req, false, 'Invalid or expired token');
      return next(new UnauthorizedError('Invalid or expired token. Please login again.'));
    }

    // Attach user to request
    req.user = user;
    this.logAuthEvent(req, true);

    next();
  }

  /**
   * Check if route is public (doesn't require authentication)
   */
  isPublicRoute(path) {
    return this.publicRoutes.includes(path);
  }

  /**
   * Extract Bearer token from Authorization header
   */
  extractToken(req) {
    const authHeader = req.headers.authorization;
    
    if (!authHeader) {
      return null;
    }

    // Support both "Bearer <token>" and direct token
    if (authHeader.startsWith('Bearer ')) {
      return authHeader.slice(7);
    }

    return authHeader || null;
  }

  /**
   * Verify JWT token
   */
  verifyToken(token) {
    try {
      return jwt.verify(token, this.tokenSecret);
    } catch (error) {
      // Log token verification failures
      if (process.env.NODE_ENV !== 'production') {
        console.debug('Token verification failed:', error.message);
      }
      return null;
    }
  }

  /**
   * Sign a new JWT token
   */
  signToken(payload, options = {}) {
    const expiresIn = options.expiresIn || process.env.TOKEN_EXPIRY || '8h';
    
    return jwt.sign(payload, this.tokenSecret, {
      expiresIn,
    });
  }

  /**
   * Blacklist a token (for logout)
   */
  blacklistToken(token) {
    this.tokenBlacklist.add(token);
    
    // Clean up old tokens periodically (every 1000 tokens)
    if (this.tokenBlacklist.size > 1000) {
      this.cleanBlacklist();
    }
  }

  /**
   * Check if token is blacklisted
   */
  isTokenBlacklisted(token) {
    return this.tokenBlacklist.has(token);
  }

  /**
   * Clean up token blacklist
   * In production, use Redis with TTL instead
   */
  cleanBlacklist() {
    // Keep only the most recent 500 tokens
    const tokens = Array.from(this.tokenBlacklist);
    this.tokenBlacklist.clear();
    tokens.slice(-500).forEach(token => this.tokenBlacklist.add(token));
  }

  /**
   * Log authentication events
   */
  logAuthEvent(req, success, reason = '') {
    if (this.logger) {
      this.logger.logAuthentication(req, success, reason);
    }
  }

  /**
   * Check if user has required role
   */
  requireRole(...roles) {
    return (req, res, next) => {
      if (!req.user) {
        return next(new UnauthorizedError('Authentication required'));
      }

      if (!roles.includes(req.user.role)) {
        if (this.logger) {
          this.logger.logAuthorization(req, false, `Required: ${roles.join(', ')}`);
        }
        return res.status(403).json({
          message: `Forbidden. Required role: ${roles.join(' or ')}`,
        });
      }

      if (this.logger) {
        this.logger.logAuthorization(req, true, req.path);
      }

      next();
    };
  }

  /**
   * Check if user is admin
   */
  requireAdmin() {
    return this.requireRole('admin');
  }

  /**
   * Check if user is admin or agent
   */
  requireAdminOrAgent() {
    return this.requireRole('admin', 'agent');
  }
}

module.exports = { AuthenticationMiddleware };
