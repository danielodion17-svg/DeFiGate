import { respondError } from '../utils/response.js';

export const requireRole = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return respondError(res, 401, 'Authentication required', false);
    }

    const role = req.user.role || 'user';
    if (!allowedRoles.includes(role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    next();
  };
};
