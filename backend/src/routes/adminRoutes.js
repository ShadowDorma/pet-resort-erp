const express = require('express');
const { authenticate, authorizeRoles } = require('../middlewares/auth');
const { getMetrics, getUsersByRole, getStaffPositions } = require('../controllers/adminController');
const { createUser, updateUser, deactivateUser } = require('../controllers/userController');
const {
  getAllServices,
  createService,
  updateService,
  deleteService,
  getSpaces,
  createSpace,
  updateSpace,
  deleteSpace,
} = require('../controllers/serviceController');

const router = express.Router();

router.use(authenticate, authorizeRoles('ADMIN'));

router.get('/metrics', getMetrics);
router.get('/positions', getStaffPositions);

router.get('/users', getUsersByRole);
router.post('/users', createUser);
router.put('/users/:id', updateUser);
router.delete('/users/:id', deactivateUser);

router.get('/services', (req, res) => {
  req.query.includeUnavailable = 'true';
  return getAllServices(req, res);
});
router.post('/services', createService);
router.put('/services/:id', updateService);
router.delete('/services/:id', deleteService);

router.get('/spaces', getSpaces);
router.post('/spaces', createSpace);
router.put('/spaces/:id', updateSpace);
router.delete('/spaces/:id', deleteSpace);

module.exports = router;
