const express = require('express');
const { authenticate, authorizeRoles } = require('../middlewares/auth');
const { RECEPTION_ROLES } = require('../constants/roles');
const { checkIn, checkOut, registerClient, getDirectory, getAssignableStaff, updateClient } = require('../controllers/receptionController');

const router = express.Router();

router.use(authenticate, authorizeRoles(...RECEPTION_ROLES));

router.post('/check-in', checkIn);
router.post('/check-out', checkOut);
router.post('/clients', registerClient);
router.put('/clients/:id', updateClient);
router.get('/directory', getDirectory);
router.get('/staff', getAssignableStaff);

module.exports = router;
