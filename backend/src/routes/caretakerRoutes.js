const express = require('express');
const { authenticate, authorizeRoles } = require('../middlewares/auth');
const { CARETAKER_ROLES } = require('../constants/roles');
const { getHousedPets, createLog } = require('../controllers/caretakerController');

const router = express.Router();

router.use(authenticate, authorizeRoles(...CARETAKER_ROLES));

router.get('/housed-pets', getHousedPets);
router.get('/pets', getHousedPets);
router.post('/logs', createLog);

module.exports = router;
