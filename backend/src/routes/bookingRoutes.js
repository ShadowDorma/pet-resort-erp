const express = require('express');
const { STAFF_ACCESS_ROLES, RECEPTION_ROLES } = require('../constants/roles');
const { authenticate, authorizeRoles } = require('../middlewares/auth');
const {
  createBooking,
  getUserBookings,
  getBookingById,
  cancelBooking,
  getAllBookings,
  getAvailability,
  approveBooking,
  assignBooking,
  checkInBooking,
  checkOutBooking,
  rescheduleBooking,
} = require('../controllers/bookingController');

const staffRoles = STAFF_ACCESS_ROLES;

const router = express.Router();

router.use(authenticate);

router.post('/', createBooking);
router.get('/', getUserBookings);
router.get('/availability', getAvailability);
router.get('/admin/all', authorizeRoles(...staffRoles), getAllBookings);
router.put('/:id/approve', authorizeRoles(...RECEPTION_ROLES), approveBooking);
router.put('/:id/assign', authorizeRoles(...RECEPTION_ROLES), assignBooking);
router.put('/:id/check-in', authorizeRoles(...RECEPTION_ROLES), checkInBooking);
router.put('/:id/check-out', authorizeRoles(...RECEPTION_ROLES), checkOutBooking);
router.put('/:id/reschedule', authorizeRoles(...RECEPTION_ROLES), rescheduleBooking);
router.get('/:id', getBookingById);
router.put('/:id/cancel', cancelBooking);

module.exports = router;
