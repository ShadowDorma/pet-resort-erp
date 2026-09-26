const express = require('express');
const { authMiddleware, requireRole } = require('../middlewares/authMiddleware');
const {
  getSpaces,
  createSpace,
  updateSpace,
} = require('../controllers/serviceController');

const router = express.Router();
const adminOnly = [authMiddleware, requireRole('ADMIN')];

router.get('/', getSpaces);
router.post('/', ...adminOnly, createSpace);
router.put('/:id', ...adminOnly, updateSpace);

module.exports = router;
