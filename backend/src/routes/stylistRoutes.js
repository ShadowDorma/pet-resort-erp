const express = require('express');
const { authenticate, authorizeRoles } = require('../middlewares/auth');
const { STYLIST_ROLES } = require('../constants/roles');
const { getMyAppointments, completeAppointment, updateAppointmentStatus } = require('../controllers/stylistController');

const router = express.Router();

router.use(authenticate, authorizeRoles(...STYLIST_ROLES));

router.get('/my-appointments', getMyAppointments);
router.get('/pets', getMyAppointments);
router.put('/appointments/:id/complete', completeAppointment);
router.put('/appointments/:id', updateAppointmentStatus);

module.exports = router;
