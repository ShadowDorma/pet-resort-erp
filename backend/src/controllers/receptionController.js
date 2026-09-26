const { checkInBooking, checkOutBooking } = require('./bookingController');
const bcrypt = require('bcryptjs');
const { getClient, query } = require('../config/db');

const attachBookingId = (req) => {
  const bookingId = req.body?.booking_id || req.body?.id || req.query?.booking_id;
  if (bookingId) {
    req.params.id = String(bookingId);
  }
};

const checkIn = (req, res) => {
  attachBookingId(req);
  if (!req.params.id) {
    return res.status(400).json({ message: 'booking_id es obligatorio' });
  }
  return checkInBooking(req, res);
};

const checkOut = (req, res) => {
  attachBookingId(req);
  if (!req.params.id) {
    return res.status(400).json({ message: 'booking_id es obligatorio' });
  }
  return checkOutBooking(req, res);
};

const registerClient = async (req, res) => {
  const { first_name, last_name, email, phone, password } = req.body || {};
  if (!first_name || !last_name || !email || !password) {
    return res.status(400).json({
      message: 'first_name, last_name, email y password son obligatorios',
    });
  }

  const client = await getClient();
  try {
    await client.query('BEGIN');
    const passwordHash = await bcrypt.hash(password, 10);
    const inserted = await client.query(
      `
        INSERT INTO users (first_name, last_name, email, phone, password_hash, status, terms_accepted_at)
        VALUES ($1, $2, $3, $4, $5, 'ACTIVE'::pet_resort.user_status, NOW())
        RETURNING user_id, first_name, last_name, email, phone, status
      `,
      [first_name.trim(), last_name.trim(), String(email).trim().toLowerCase(), phone || null, passwordHash]
    );

    const role = await client.query(
      `
        INSERT INTO roles (name, description, is_active)
        VALUES ('CLIENT', 'Propietario de mascotas', true)
        ON CONFLICT (name) DO UPDATE SET is_active = true
        RETURNING role_id
      `
    );

    await client.query(
      `INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [inserted.rows[0].user_id, role.rows[0].role_id]
    );

    await client.query('COMMIT');
    return res.status(201).json({
      message: 'Cliente registrado',
      user: inserted.rows[0],
    });
  } catch (error) {
    await client.query('ROLLBACK');
    if (error.code === '23505') {
      return res.status(409).json({ message: 'Ya existe un usuario con ese correo' });
    }
    console.error('Error en registerClient:', error);
    return res.status(500).json({ message: 'No se pudo registrar el cliente' });
  } finally {
    client.release();
  }
};

const getDirectory = async (_req, res) => {
  try {
    const clients = await query(
      `
        SELECT
          u.user_id,
          u.first_name,
          u.last_name,
          u.email,
          u.phone,
          u.status,
          COALESCE(
            json_agg(
              json_build_object(
                'pet_id', p.pet_id,
                'name', p.name,
                'species', p.species,
                'breed', p.breed,
                'photo_url', p.photo_url,
                'age_years', p.age_years,
                'allergies', p.allergies,
                'diet_notes', p.diet_notes,
                'birth_date', p.birth_date,
                'notes', p.notes,
                'is_active', p.is_active
              )
              ORDER BY p.name
            ) FILTER (WHERE p.pet_id IS NOT NULL),
            '[]'
          ) AS pets
        FROM users u
        JOIN user_roles ur ON ur.user_id = u.user_id
        JOIN roles r ON r.role_id = ur.role_id AND r.is_active = true
        LEFT JOIN pets p ON p.owner_id = u.user_id AND p.is_active = true
        WHERE UPPER(r.name) = 'CLIENT'
        GROUP BY u.user_id
        ORDER BY u.last_name, u.first_name
      `
    );
    return res.status(200).json({ clients: clients.rows });
  } catch (error) {
    console.error('Error en getDirectory:', error);
    return res.status(500).json({ message: 'No se pudo cargar el directorio' });
  }
};

const getAssignableStaff = async (_req, res) => {
  try {
    const result = await query(
      `
        SELECT
          u.user_id,
          u.first_name,
          u.last_name,
          u.job_title,
          u.status,
          COALESCE(array_agg(UPPER(r.name)) FILTER (WHERE r.name IS NOT NULL), '{}') AS roles
        FROM users u
        JOIN user_roles ur ON ur.user_id = u.user_id
        JOIN roles r ON r.role_id = ur.role_id AND r.is_active = true
        WHERE u.status = 'ACTIVE'
          AND UPPER(r.name) IN ('CARETAKER', 'CAREGIVER', 'STYLIST', 'GROOMER', 'PELUQUERO', 'ADMIN')
        GROUP BY u.user_id
        ORDER BY u.first_name
      `
    );
    return res.status(200).json({ staff: result.rows });
  } catch (error) {
    console.error('Error en getAssignableStaff:', error);
    return res.status(500).json({ message: 'No se pudo listar el personal' });
  }
};

const updateClient = async (req, res) => {
  const userId = String(req.params.id || '');
  if (!/^\d+$/.test(userId)) {
    return res.status(400).json({ message: 'ID de cliente inválido' });
  }

  const { first_name, last_name, email, phone } = req.body || {};
  try {
    const current = await query(
      `
        SELECT u.user_id
        FROM users u
        JOIN user_roles ur ON ur.user_id = u.user_id
        JOIN roles r ON r.role_id = ur.role_id
        WHERE u.user_id = $1 AND UPPER(r.name) = 'CLIENT'
      `,
      [userId]
    );
    if (!current.rowCount) {
      return res.status(404).json({ message: 'Cliente no encontrado' });
    }

    const updated = await query(
      `
        UPDATE users
        SET
          first_name = COALESCE($2, first_name),
          last_name = COALESCE($3, last_name),
          email = COALESCE($4, email),
          phone = COALESCE($5, phone),
          updated_at = NOW()
        WHERE user_id = $1
        RETURNING user_id, first_name, last_name, email, phone, status
      `,
      [
        userId,
        first_name ? String(first_name).trim() : null,
        last_name ? String(last_name).trim() : null,
        email ? String(email).trim().toLowerCase() : null,
        phone === undefined ? null : phone,
      ]
    );

    return res.status(200).json({ message: 'Cliente actualizado', user: updated.rows[0] });
  } catch (error) {
    if (error.code === '23505') {
      return res.status(409).json({ message: 'Ya existe un usuario con ese correo' });
    }
    console.error('Error en updateClient:', error);
    return res.status(500).json({ message: 'No se pudo actualizar el cliente' });
  }
};

module.exports = {
  checkIn,
  checkOut,
  registerClient,
  getDirectory,
  getAssignableStaff,
  updateClient,
};
