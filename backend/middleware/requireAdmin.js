// middleware/requireAdmin.js
import { respondError } from '../utils/response.js';

/**
 * Middleware to require admin role for protected routes
 */
export const requireAdmin = (req, res, next) => {
  if (!req.user) {
    return respondError(res, 401, 'Authentication required', false);
  }

  if (req.user.role !== 'admin') {
    return respondError(res, 403, 'Admin access required', false);
  }

  next();
};

/**
 * Middleware to require admin or support role
 */
export const requireAdminOrSupport = (req, res, next) => {
  if (!req.user) {
    return respondError(res, 401, 'Authentication required', false);
  }

  if (req.user.role !== 'admin' && req.user.role !== 'support') {
    return respondError(res, 403, 'Admin or support access required', false);
  }

  next();
};