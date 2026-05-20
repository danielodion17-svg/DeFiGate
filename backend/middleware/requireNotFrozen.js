import User from '../models/User.js';
import { respondError } from '../utils/response.js';

export const requireNotFrozen = async (req, res, next) => {
  if (!req.user) {
    return respondError(res, 401, 'Authentication required', false);
  }

  try {
    const user = await User.findByPk(req.user.id);
    if (!user) {
      return respondError(res, 404, 'User not found', false);
    }

    if (user.is_frozen) {
      return res.status(423).json({
        ok: false,
        error: 'Account is frozen and cannot perform this action',
        freeze_reason: user.freeze_reason || 'Account under review',
      });
    }

    next();
  } catch (error) {
    console.error('requireNotFrozen error:', error);
    return respondError(res, 500, 'Unable to verify account status', true, error.message);
  }
};
