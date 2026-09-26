const express = require('express');
const { STAFF_ACCESS_ROLES } = require('../constants/roles');
const { authenticate, authorizeRoles } = require('../middlewares/auth');
const {
  getTodayAgenda,
  getOccupancy,
  getCareBoard,
  toggleCareTask,
} = require('../controllers/staffController');

const router = express.Router();

router.use(authenticate, authorizeRoles(...STAFF_ACCESS_ROLES));

router.get('/today', getTodayAgenda);
router.get('/occupancy', getOccupancy);
router.get('/care', getCareBoard);
router.put('/tasks/:id', toggleCareTask);

module.exports = router;
