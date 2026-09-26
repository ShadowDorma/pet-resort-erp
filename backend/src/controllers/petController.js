const { query } = require('../config/db');

const { STAFF_ACCESS_ROLES } = require('../constants/roles');
const GENDERS = ['MALE', 'FEMALE', 'UNKNOWN'];

const PET_COLUMNS = `
  pet_id,
  owner_id,
  name,
  species,
  breed,
  gender,
  birth_date,
  weight_kg,
  color,
  identification,
  photo_url,
  notes,
  age_years,
  allergies,
  diet_notes,
  vet_emergency_contact,
  is_active,
  created_at,
  updated_at
`;

const hasPrivilegedAccess = (user) => {
  const roles = (user?.roles || []).map((role) => String(role).toUpperCase());
  return roles.some((role) => STAFF_ACCESS_ROLES.includes(role));
};

const parsePetId = (value) => {
  if (!/^\d+$/.test(String(value))) {
    return null;
  }
  return String(value);
};

const findPetById = async (petId) => {
  const result = await query(
    `SELECT ${PET_COLUMNS} FROM pets WHERE pet_id = $1`,
    [petId]
  );
  return result.rows[0] || null;
};

const canManagePet = (user, pet) => {
  if (!pet || !user) {
    return false;
  }
  return String(pet.owner_id) === String(user.user_id) || hasPrivilegedAccess(user);
};

const validateGender = (gender) => {
  if (gender === undefined || gender === null || gender === '') {
    return 'UNKNOWN';
  }
  const normalized = String(gender).toUpperCase();
  return GENDERS.includes(normalized) ? normalized : null;
};

const normalizeSpecies = (species) => {
  const value = String(species || '').trim().toLowerCase();
  if (value.includes('gat') || value.includes('cat') || value.includes('felin')) {
    return 'Gato';
  }
  return 'Perro';
};

const syncCareCard = async (petId, body = {}) => {
  const allergies = body.allergies;
  const diet = body.diet_notes ?? body.diet ?? body.special_care;
  const emergency = body.vet_emergency_contact ?? body.emergency_notes ?? body.emergency_contact;
  if (allergies === undefined && diet === undefined && emergency === undefined) {
    return;
  }

  await query(
    `
      INSERT INTO pet_care_instructions (pet_id, allergies, special_care, feeding_instructions, emergency_notes)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (pet_id) DO UPDATE
      SET
        allergies = COALESCE(EXCLUDED.allergies, pet_care_instructions.allergies),
        special_care = COALESCE(EXCLUDED.special_care, pet_care_instructions.special_care),
        feeding_instructions = COALESCE(EXCLUDED.feeding_instructions, pet_care_instructions.feeding_instructions),
        emergency_notes = COALESCE(EXCLUDED.emergency_notes, pet_care_instructions.emergency_notes),
        updated_at = NOW()
    `,
    [
      petId,
      allergies ?? null,
      diet ?? null,
      diet ?? null,
      emergency ?? null,
    ]
  );
};

const createPet = async (req, res) => {
  const {
    name,
    species,
    breed,
    gender,
    birth_date,
    weight_kg,
    color,
    identification,
    photo_url,
    notes,
    age,
    age_years,
    allergies,
    diet,
    diet_notes,
    special_care,
    vet_emergency_contact,
    emergency_contact,
  } = req.body || {};

  if (!name || !String(name).trim()) {
    return res.status(400).json({ message: 'El nombre de la mascota es obligatorio' });
  }

  const parsedGender = validateGender(gender);
  if (!parsedGender) {
    return res.status(400).json({
      message: 'gender debe ser MALE, FEMALE o UNKNOWN',
    });
  }

  if (weight_kg !== undefined && weight_kg !== null && Number(weight_kg) <= 0) {
    return res.status(400).json({ message: 'weight_kg debe ser mayor que 0' });
  }

  try {
    const result = await query(
      `
        INSERT INTO pets (
          owner_id,
          name,
          species,
          breed,
          gender,
          birth_date,
          weight_kg,
          color,
          identification,
          photo_url,
          notes,
          age_years,
          allergies,
          diet_notes,
          vet_emergency_contact
        )
        VALUES (
          $1, $2, $3, $4, $5::pet_resort.gender_type,
          $6, $7, $8, $9, $10, $11, $12, $13, $14, $15
        )
        RETURNING ${PET_COLUMNS}
      `,
      [
        hasPrivilegedAccess(req.user) && req.body?.owner_id
          ? req.body.owner_id
          : req.user.user_id,
        String(name).trim(),
        normalizeSpecies(species),
        breed || null,
        parsedGender,
        birth_date || null,
        weight_kg ?? null,
        color || null,
        identification ? String(identification).trim() : null,
        photo_url || null,
        notes || special_care || diet_notes || diet || null,
        age_years ?? age ?? null,
        allergies || null,
        diet_notes || diet || special_care || null,
        vet_emergency_contact || emergency_contact || null,
      ]
    );

    await syncCareCard(result.rows[0].pet_id, {
      allergies,
      diet_notes: diet_notes || diet || special_care,
      vet_emergency_contact: vet_emergency_contact || emergency_contact,
    });

    return res.status(201).json({
      message: 'Mascota registrada correctamente',
      pet: result.rows[0],
    });
  } catch (error) {
    if (error.code === '23505') {
      return res.status(409).json({
        message: 'Ya existe una mascota con esa identificación',
      });
    }
    if (error.code === '23514') {
      return res.status(400).json({ message: 'Los datos de la mascota no son válidos' });
    }

    console.error('Error en createPet:', error);
    return res.status(500).json({ message: 'No se pudo registrar la mascota' });
  }
};

const getUserPets = async (req, res) => {
  try {
    const includeInactive = String(req.query.includeInactive || '') === 'true';
    const ownerId = hasPrivilegedAccess(req.user) && req.query.owner_id
      ? req.query.owner_id
      : req.user.user_id;
    const result = await query(
      `
        SELECT ${PET_COLUMNS}
        FROM pets
        WHERE owner_id = $1
          AND ($2::boolean OR is_active = true)
        ORDER BY created_at DESC
      `,
      [ownerId, includeInactive]
    );

    return res.status(200).json({ pets: result.rows });
  } catch (error) {
    console.error('Error en getUserPets:', error);
    return res.status(500).json({ message: 'No se pudieron obtener las mascotas' });
  }
};

const getPetById = async (req, res) => {
  const petId = parsePetId(req.params.id);
  if (!petId) {
    return res.status(400).json({ message: 'ID de mascota inválido' });
  }

  try {
    const pet = await findPetById(petId);
    if (!pet) {
      return res.status(404).json({ message: 'Mascota no encontrada' });
    }

    if (!canManagePet(req.user, pet)) {
      return res.status(403).json({
        message: 'No tienes permiso para ver esta mascota',
      });
    }

    return res.status(200).json({ pet });
  } catch (error) {
    console.error('Error en getPetById:', error);
    return res.status(500).json({ message: 'No se pudo obtener la mascota' });
  }
};

const updatePet = async (req, res) => {
  const petId = parsePetId(req.params.id);
  if (!petId) {
    return res.status(400).json({ message: 'ID de mascota inválido' });
  }

  try {
    const pet = await findPetById(petId);
    if (!pet) {
      return res.status(404).json({ message: 'Mascota no encontrada' });
    }

    if (!canManagePet(req.user, pet)) {
      return res.status(403).json({
        message: 'No tienes permiso para actualizar esta mascota',
      });
    }

    const allowed = [
      'name',
      'species',
      'breed',
      'gender',
      'birth_date',
      'weight_kg',
      'color',
      'identification',
      'photo_url',
      'notes',
      'is_active',
      'age_years',
      'allergies',
      'diet_notes',
      'vet_emergency_contact',
    ];

    const body = { ...(req.body || {}) };
    if (body.age !== undefined && body.age_years === undefined) {
      body.age_years = body.age;
    }
    if (body.diet !== undefined && body.diet_notes === undefined) {
      body.diet_notes = body.diet;
    }
    if (body.special_care !== undefined && body.diet_notes === undefined) {
      body.diet_notes = body.special_care;
    }
    if (body.emergency_contact !== undefined && body.vet_emergency_contact === undefined) {
      body.vet_emergency_contact = body.emergency_contact;
    }
    if (body.species !== undefined) {
      body.species = normalizeSpecies(body.species);
    }

    const updates = [];
    const values = [];

    allowed.forEach((field) => {
      if (Object.prototype.hasOwnProperty.call(body, field)) {
        let value = body[field];

        if (field === 'name') {
          if (!value || !String(value).trim()) {
            throw Object.assign(new Error('El nombre de la mascota es obligatorio'), {
              statusCode: 400,
            });
          }
          value = String(value).trim();
        }

        if (field === 'gender') {
          value = validateGender(value);
          if (!value) {
            throw Object.assign(new Error('gender debe ser MALE, FEMALE o UNKNOWN'), {
              statusCode: 400,
            });
          }
        }

        if (field === 'weight_kg' && value !== null && Number(value) <= 0) {
          throw Object.assign(new Error('weight_kg debe ser mayor que 0'), {
            statusCode: 400,
          });
        }

        if (field === 'identification' && value) {
          value = String(value).trim();
        }

        updates.push(
          field === 'gender'
            ? `${field} = $${updates.length + 1}::pet_resort.gender_type`
            : `${field} = $${updates.length + 1}`
        );
        values.push(value);
      }
    });

    if (updates.length === 0) {
      return res.status(400).json({ message: 'No hay campos para actualizar' });
    }

    values.push(petId);
    const result = await query(
      `
        UPDATE pets
        SET ${updates.join(', ')}, updated_at = NOW()
        WHERE pet_id = $${values.length}
        RETURNING ${PET_COLUMNS}
      `,
      values
    );

    await syncCareCard(petId, body);

    return res.status(200).json({
      message: 'Mascota actualizada correctamente',
      pet: result.rows[0],
    });
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ message: error.message });
    }
    if (error.code === '23505') {
      return res.status(409).json({
        message: 'Ya existe una mascota con esa identificación',
      });
    }
    if (error.code === '23514') {
      return res.status(400).json({ message: 'Los datos de la mascota no son válidos' });
    }

    console.error('Error en updatePet:', error);
    return res.status(500).json({ message: 'No se pudo actualizar la mascota' });
  }
};

const deletePet = async (req, res) => {
  const petId = parsePetId(req.params.id);
  if (!petId) {
    return res.status(400).json({ message: 'ID de mascota inválido' });
  }

  try {
    const pet = await findPetById(petId);
    if (!pet) {
      return res.status(404).json({ message: 'Mascota no encontrada' });
    }

    if (!canManagePet(req.user, pet)) {
      return res.status(403).json({
        message: 'No tienes permiso para eliminar esta mascota',
      });
    }

    const result = await query(
      `
        UPDATE pets
        SET is_active = false, updated_at = NOW()
        WHERE pet_id = $1
        RETURNING ${PET_COLUMNS}
      `,
      [petId]
    );

    return res.status(200).json({
      message: 'Mascota desactivada correctamente',
      pet: result.rows[0],
    });
  } catch (error) {
    console.error('Error en deletePet:', error);
    return res.status(500).json({ message: 'No se pudo eliminar la mascota' });
  }
};

const addCareInstruction = async (req, res) => {
  const petId = parsePetId(req.params.id);
  if (!petId) {
    return res.status(400).json({ message: 'ID de mascota inválido' });
  }

  const {
    feeding_instructions,
    feeding_frequency,
    allergies,
    medications,
    special_care,
    recreation_preferences,
    grooming_preferences,
    emergency_notes,
  } = req.body || {};

  const instructionFields = {
    feeding_instructions,
    feeding_frequency,
    allergies,
    medications,
    special_care,
    recreation_preferences,
    grooming_preferences,
    emergency_notes,
  };

  const provided = Object.entries(instructionFields).filter(
    ([, value]) => value !== undefined
  );

  if (provided.length === 0) {
    return res.status(400).json({
      message: 'Debes enviar al menos un campo de instrucción de cuidado',
    });
  }

  try {
    const pet = await findPetById(petId);
    if (!pet) {
      return res.status(404).json({ message: 'Mascota no encontrada' });
    }

    if (!canManagePet(req.user, pet)) {
      return res.status(403).json({
        message: 'No tienes permiso para agregar instrucciones a esta mascota',
      });
    }

    const columns = provided.map(([field]) => field);
    const values = provided.map(([, value]) => value);
    const placeholders = columns.map((_, index) => `$${index + 2}`);
    const updateSet = columns
      .map((field) => `${field} = EXCLUDED.${field}`)
      .join(', ');

    const result = await query(
      `
        INSERT INTO pet_care_instructions (pet_id, ${columns.join(', ')})
        VALUES ($1, ${placeholders.join(', ')})
        ON CONFLICT (pet_id) DO UPDATE
        SET ${updateSet}, updated_at = NOW()
        RETURNING *
      `,
      [petId, ...values]
    );

    return res.status(201).json({
      message: 'Instrucción de cuidado guardada correctamente',
      instruction: result.rows[0],
    });
  } catch (error) {
    console.error('Error en addCareInstruction:', error);
    return res.status(500).json({
      message: 'No se pudo guardar la instrucción de cuidado',
    });
  }
};

const getCareInstructions = async (req, res) => {
  const petId = parsePetId(req.params.id);
  if (!petId) {
    return res.status(400).json({ message: 'ID de mascota inválido' });
  }

  try {
    const pet = await findPetById(petId);
    if (!pet) {
      return res.status(404).json({ message: 'Mascota no encontrada' });
    }

    if (!canManagePet(req.user, pet)) {
      return res.status(403).json({
        message: 'No tienes permiso para ver las instrucciones de esta mascota',
      });
    }

    const result = await query(
      `
        SELECT *
        FROM pet_care_instructions
        WHERE pet_id = $1
      `,
      [petId]
    );

    return res.status(200).json({
      instructions: result.rows,
    });
  } catch (error) {
    console.error('Error en getCareInstructions:', error);
    return res.status(500).json({
      message: 'No se pudieron obtener las instrucciones de cuidado',
    });
  }
};

const getPetCareLogs = async (req, res) => {
  const petId = parsePetId(req.params.id);
  if (!petId) {
    return res.status(400).json({ message: 'ID de mascota inválido' });
  }

  try {
    const pet = await findPetById(petId);
    if (!pet) {
      return res.status(404).json({ message: 'Mascota no encontrada' });
    }
    if (!canManagePet(req.user, pet)) {
      return res.status(403).json({ message: 'No tienes permiso para ver esta bitácora' });
    }

    const result = await query(
      `
        SELECT
          cl.care_log_id AS id,
          l.booking_id,
          CASE cl.log_type::text
            WHEN 'RECREATION' THEN 'ACTIVITY'
            WHEN 'MEDICATION' THEN 'MEDICAL'
            WHEN 'INCIDENT' THEN 'NOTE'
            WHEN 'OBSERVATION' THEN 'NOTE'
            WHEN 'SPECIAL_CARE' THEN 'NOTE'
            ELSE cl.log_type::text
          END AS type,
          cl.description,
          cl.photo_url,
          COALESCE(cl.occurred_at, cl.created_at) AS created_at,
          b.status AS booking_status,
          caretaker.first_name AS caretaker_first_name,
          caretaker.last_name AS caretaker_last_name
        FROM care_logs cl
        LEFT JOIN lodgings l ON l.lodging_id = cl.lodging_id
        LEFT JOIN bookings b ON b.booking_id = l.booking_id
        LEFT JOIN users caretaker ON caretaker.user_id = cl.registered_by
        WHERE cl.pet_id = $1 OR b.pet_id = $1
        ORDER BY COALESCE(cl.occurred_at, cl.created_at) DESC
        LIMIT 50
      `,
      [petId]
    );

    return res.status(200).json({ logs: result.rows });
  } catch (error) {
    console.error('Error en getPetCareLogs:', error);
    return res.status(500).json({ message: 'No se pudo obtener el seguimiento en vivo' });
  }
};

module.exports = {
  createPet,
  getUserPets,
  getMyPets: getUserPets,
  getPetById,
  updatePet,
  deletePet,
  addCareInstruction,
  getCareInstructions,
  getPetCareLogs,
};
