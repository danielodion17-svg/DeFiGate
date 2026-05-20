import { respondError } from '../utils/response.js';

export const requireSupport = (req, res, next) => {
  if (!req.user) {
    return respondError(res, 401, 'Authentication required', false);
  }

  const role = req.user.role || 'user';
  if (role !== 'support' && role !== 'admin') {
    return res.status(403).json({ error: 'Support or admin permissions required' });
  }

  next();
};
