const express = require('express');
const { authMiddleware, requireRole } = require('../middlewares/authMiddleware');
const {
  getAllServices,
  getServiceById,
  getAvailableSpaces,
  getBusinessHours,
  getCategories,
  getSpaces,
  createService,
  updateService,
  deleteService,
  createSpace,
  updateSpace,
} = require('../controllers/serviceController');

const router = express.Router();
const adminOnly = [authMiddleware, requireRole('ADMIN')];

router.get('/', getAllServices);
router.get('/categories', getCategories);
router.get('/spaces/available', getAvailableSpaces);
router.get('/spaces', getSpaces);
router.get('/hours', getBusinessHours);
router.post('/spaces', ...adminOnly, createSpace);
router.put('/spaces/:id', ...adminOnly, updateSpace);
router.post('/', ...adminOnly, createService);
router.put('/:id', ...adminOnly, updateService);
router.delete('/:id', ...adminOnly, deleteService);
router.get('/:id', getServiceById);

module.exports = router;
