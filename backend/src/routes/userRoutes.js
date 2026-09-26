const express = require('express');
const { authMiddleware, requireRole } = require('../middlewares/authMiddleware');
const {
  createUser,
  updateUser,
  getOwnProfile,
  updateOwnProfile,
  changePassword,
} = require('../controllers/userController');

const router = express.Router();

router.use(authMiddleware);

router.get('/profile', getOwnProfile);
router.put('/profile', updateOwnProfile);
router.put('/change-password', changePassword);

router.post('/', requireRole('ADMIN'), createUser);
router.put('/:id', requireRole('ADMIN'), updateUser);

module.exports = router;
