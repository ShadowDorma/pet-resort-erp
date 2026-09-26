const express = require('express');
const jwt = require('jsonwebtoken');
const { authenticate, authorizeRoles } = require('../middlewares/auth');
const { getReviews, upsertReview } = require('../controllers/reviewController');

const router = express.Router();

const optionalAuth = (req, _res, next) => {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token || !process.env.JWT_SECRET) {
    return next();
  }
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.user = {
      user_id: payload.user_id,
      email: payload.email,
      roles: Array.isArray(payload.roles) ? payload.roles : [],
    };
  } catch {
    req.user = undefined;
  }
  return next();
};

router.get('/', optionalAuth, getReviews);
router.post('/', authenticate, authorizeRoles('CLIENT'), upsertReview);

module.exports = router;
