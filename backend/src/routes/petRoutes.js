const express = require('express');
const { authMiddleware } = require('../middlewares/authMiddleware');
const {
  createPet,
  getUserPets,
  getPetById,
  updatePet,
  deletePet,
  addCareInstruction,
  getCareInstructions,
  getPetCareLogs,
} = require('../controllers/petController');

const router = express.Router();

router.use(authMiddleware);

router.post('/', createPet);
router.get('/my-pets', getUserPets);
router.get('/', getUserPets);
router.get('/:id/instructions', getCareInstructions);
router.get('/:id/logs', getPetCareLogs);
router.post('/:id/instructions', addCareInstruction);
router.get('/:id', getPetById);
router.put('/:id', updatePet);
router.delete('/:id', deletePet);

module.exports = router;
