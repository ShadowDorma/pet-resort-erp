const { query } = require('../config/db');
const { notifyCareLog } = require('../services/notificationService');

const IN_HOUSE = ['IN_HOUSE', 'CHECKED_IN', 'IN_PROGRESS'];
const LOG_TYPES = ['FEEDING', 'ACTIVITY', 'MEDICAL', 'NOTE'];
const LOG_TYPE_TO_DB = {
  FEEDING: 'FEEDING',
  ACTIVITY: 'RECREATION',
  MEDICAL: 'MEDICATION',
  NOTE: 'INCIDENT',
  RECREATION: 'RECREATION',
  MEDICATION: 'MEDICATION',
  INCIDENT: 'INCIDENT',
};
const LOG_TYPE_SQL = `
  CASE cl.log_type::text
    WHEN 'RECREATION' THEN 'ACTIVITY'
    WHEN 'MEDICATION' THEN 'MEDICAL'
    WHEN 'INCIDENT' THEN 'NOTE'
    WHEN 'OBSERVATION' THEN 'NOTE'
    WHEN 'SPECIAL_CARE' THEN 'NOTE'
    ELSE cl.log_type::text
  END
`;

const CARETAKER_BOOKING_TYPES = ['LODGING', 'RECREATION'];
const BUSINESS_TZ = 'America/Bogota'; // panel operativo en hora Colombia



const getHousedPets = async (req, res) => {
  try {
    const rawDate = String(req.query?.date || '').slice(0, 10);
    const selectedDate = /^\d{4}-\d{2}-\d{2}$/.test(rawDate) ? rawDate : null;

    const result = await query(
      `
        SELECT
          b.booking_id,
          b.booking_type,
          b.status,
          b.start_at,
          b.end_at,
          b.assigned_staff_id,
          p.pet_id,
          p.name AS pet_name,
          p.photo_url AS pet_photo_url,
          p.species,
          p.breed,
          p.notes AS temperament,
          u.first_name AS owner_first_name,
          u.last_name AS owner_last_name,
          pci.feeding_instructions,
          pci.medications,
          pci.special_care,
          pci.allergies,
          pci.emergency_notes,
          COALESCE(sv_l.name, sv_r.name) AS service_name,
          COALESCE(sp_l.name, sp_r.name) AS space_name,
          CASE b.booking_type::text
            WHEN 'LODGING' THEN 'Suite'
            WHEN 'RECREATION' THEN 'Patio'
            ELSE COALESCE(sp_l.name, sp_r.name)
          END AS destination_kind,
          CASE
            WHEN b.status::text = ANY($1::text[]) THEN 'IN_HOUSE'
            ELSE 'ARRIVAL'
          END AS board_section
        FROM bookings b
        JOIN pets p ON p.pet_id = b.pet_id
        JOIN users u ON u.user_id = b.owner_id
        LEFT JOIN lodgings l ON l.booking_id = b.booking_id
        LEFT JOIN recreation_sessions rs ON rs.booking_id = b.booking_id
        LEFT JOIN services sv_l ON sv_l.service_id = l.service_id
        LEFT JOIN services sv_r ON sv_r.service_id = rs.service_id
        LEFT JOIN spaces sp_l ON sp_l.space_id = l.space_id
        LEFT JOIN spaces sp_r ON sp_r.space_id = rs.space_id
        LEFT JOIN pet_care_instructions pci ON pci.pet_id = p.pet_id
        WHERE b.booking_type::text = ANY($2::text[])
          AND b.status::text NOT IN ('CANCELLED', 'NO_SHOW')
          AND daterange(
            (b.start_at AT TIME ZONE $3)::date,
            (b.end_at AT TIME ZONE $3)::date,
            '[]'
          ) @> COALESCE($4::date, (timezone($3, now()))::date)
        ORDER BY
          CASE WHEN b.status::text = ANY($1::text[]) THEN 0 ELSE 1 END,
          b.start_at
      `,
      [IN_HOUSE, CARETAKER_BOOKING_TYPES, BUSINESS_TZ, selectedDate]
    );

    const pets = [];
    for (const row of result.rows || []) {
      try {
        const logs = await query(
          `
            SELECT
              cl.care_log_id AS id,
              ${LOG_TYPE_SQL} AS type,
              cl.description,
              cl.photo_url,
              COALESCE(cl.occurred_at, cl.created_at) AS created_at
            FROM care_logs cl
            LEFT JOIN lodgings l ON l.lodging_id = cl.lodging_id
            WHERE cl.pet_id = $1 OR l.booking_id = $2
            ORDER BY COALESCE(cl.occurred_at, cl.created_at) DESC
            LIMIT 20
          `,
          [row.pet_id, row.booking_id]
        );
        pets.push({ ...row, logs: logs.rows || [] });
      } catch (logError) {
        console.error('Error al cargar bitácora de mascota:', logError.message);
        pets.push({ ...row, logs: [] });
      }
    }

    return res.status(200).json({ pets, date: selectedDate });
  } catch (error) {
    console.error('Error en getHousedPets:', error);
    return res.status(500).json({ message: 'No se pudieron listar las mascotas hospedadas', pets: [] });
  }
};

const createLog = async (req, res) => {
  const bookingId = req.body?.booking_id;
  const type = String(req.body?.type || '').toUpperCase();
  const description = String(req.body?.description || '').trim();

  if (!bookingId || !description) {
    return res.status(400).json({ message: 'booking_id y description son obligatorios' });
  }
  if (!LOG_TYPES.includes(type) && !LOG_TYPE_TO_DB[type]) {
    return res.status(400).json({ message: `type debe ser uno de: ${LOG_TYPES.join(', ')}` });
  }

  const dbType = LOG_TYPE_TO_DB[type] || 'INCIDENT';
  const titleMap = {
    FEEDING: 'Alimentación',
    ACTIVITY: 'Paseo',
    MEDICAL: 'Medicamento',
    NOTE: 'Incidencia',
  };

  const photoUrl = req.body?.photo_url || null;

  try {
    const booking = await query(
      `
        SELECT b.booking_id, b.pet_id, b.owner_id, b.booking_type, l.lodging_id, p.name AS pet_name
        FROM bookings b
        JOIN pets p ON p.pet_id = b.pet_id
        LEFT JOIN lodgings l ON l.booking_id = b.booking_id
        WHERE b.booking_id = $1
        LIMIT 1
      `,
      [bookingId]
    );
    if (!booking.rowCount) {
      return res.status(404).json({ message: 'Reserva no encontrada' });
    }
    if (!CARETAKER_BOOKING_TYPES.includes(String(booking.rows[0].booking_type).toUpperCase())) {
      return res.status(400).json({
        message: 'La bitácora del cuidador solo aplica a hospedaje y guardería',
      });
    }

    const result = await query(
      `
        INSERT INTO care_logs (pet_id, lodging_id, registered_by, log_type, title, description, occurred_at, photo_url)
        VALUES ($1, $2, $3, $4::pet_resort.care_log_type, $5, $6, NOW(), $7)
        RETURNING
          care_log_id AS id,
          pet_id,
          lodging_id,
          registered_by AS caretaker_id,
          log_type AS type,
          description,
          photo_url,
          COALESCE(occurred_at, created_at) AS created_at
      `,
      [
        booking.rows[0].pet_id,
        booking.rows[0].lodging_id,
        req.user.user_id,
        dbType,
        titleMap[type] || type,
        description,
        photoUrl,
      ]
    );

    notifyCareLog({
      ownerId: booking.rows[0].owner_id,
      petId: booking.rows[0].pet_id,
      petName: booking.rows[0].pet_name,
      logType: type,
      hasPhoto: Boolean(photoUrl),
    });

    return res.status(201).json({
      message: 'Bitácora registrada',
      log: result.rows[0],
    });
  } catch (error) {
    console.error('Error en createLog:', error);
    return res.status(500).json({ message: 'No se pudo registrar la bitácora' });
  }
};

module.exports = {
  getHousedPets,
  createLog,
};
