const { query } = require('../config/db');

const IN_HOUSE_STATUSES = ['IN_HOUSE', 'CHECKED_IN', 'IN_PROGRESS'];
const TODAY_STATUSES = ['PENDING', 'CONFIRMED', 'IN_HOUSE', 'CHECKED_IN', 'IN_PROGRESS'];

const DEFAULT_CARE_TASKS = [
  { task_code: 'FED', label: 'Alimentado' },
  { task_code: 'WALK', label: 'Paseo completado' },
  { task_code: 'BATH', label: 'Baño realizado' },
  { task_code: 'MEDICATION', label: 'Medicación administrada' },
];

const AGENDA_SELECT = `
  b.booking_id,
  b.booking_type,
  b.status,
  b.start_at,
  b.end_at,
  b.notes,
  b.reception_notes,
  b.check_in_at,
  b.check_out_at,
  b.assigned_staff_id,
  p.pet_id,
  p.name AS pet_name,
  p.species,
  p.breed,
  p.age_years,
  p.photo_url AS pet_photo_url,
  p.notes AS temperament,
  p.allergies AS pet_allergies,
  u.first_name AS owner_first_name,
  u.last_name AS owner_last_name,
  u.phone AS owner_phone,
  u.email AS owner_email,
  staff.first_name AS assigned_staff_first_name,
  staff.last_name AS assigned_staff_last_name,
  staff.job_title AS assigned_staff_job_title,
  COALESCE(sv_l.name, sv_a.name, sv_r.name) AS service_name,
  CASE b.booking_type::text
    WHEN 'RECREATION' THEN COALESCE(sp_r.name, sp_l.name)
    WHEN 'APPOINTMENT' THEN COALESCE(sp_a.name, sp_l.name)
    ELSE COALESCE(sp_l.name, sp_r.name, sp_a.name)
  END AS space_name,
  CASE b.booking_type::text
    WHEN 'RECREATION' THEN COALESCE(rs.space_id, l.space_id)
    WHEN 'APPOINTMENT' THEN COALESCE(a.space_id, l.space_id)
    ELSE COALESCE(l.space_id, rs.space_id, a.space_id)
  END AS space_id,
  CASE b.booking_type::text
    WHEN 'LODGING' THEN 'Suite'
    WHEN 'RECREATION' THEN 'Patio'
    WHEN 'APPOINTMENT' THEN 'Estación de Spa'
    ELSE COALESCE(sp_l.name, sp_a.name, sp_r.name)
  END AS destination_kind,
          pci.special_care,
          pci.allergies,
          pci.medications,
          pci.feeding_instructions,
          pci.emergency_notes
`;

const AGENDA_FROM = `
  FROM bookings b
  JOIN pets p ON p.pet_id = b.pet_id
  JOIN users u ON u.user_id = b.owner_id
  LEFT JOIN users staff ON staff.user_id = b.assigned_staff_id
  LEFT JOIN lodgings l ON l.booking_id = b.booking_id
  LEFT JOIN appointments a ON a.booking_id = b.booking_id
  LEFT JOIN recreation_sessions rs ON rs.booking_id = b.booking_id
  LEFT JOIN services sv_l ON sv_l.service_id = l.service_id
  LEFT JOIN services sv_a ON sv_a.service_id = a.service_id
  LEFT JOIN services sv_r ON sv_r.service_id = rs.service_id
  LEFT JOIN spaces sp_l ON sp_l.space_id = l.space_id
  LEFT JOIN spaces sp_a ON sp_a.space_id = a.space_id
  LEFT JOIN spaces sp_r ON sp_r.space_id = rs.space_id
  LEFT JOIN pet_care_instructions pci ON pci.pet_id = p.pet_id
`;

const ensureDefaultTasks = async (bookingId, petId) => {
  for (const task of DEFAULT_CARE_TASKS) {
    await query(
      `
        INSERT INTO care_tasks (booking_id, pet_id, task_code, label)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (booking_id, task_code) DO NOTHING
      `,
      [bookingId, petId, task.task_code, task.label]
    );
  }
};

const getTasksForBooking = async (bookingId) => {
  const result = await query(
    `
      SELECT
        care_task_id,
        booking_id,
        pet_id,
        task_code,
        label,
        is_done,
        notes,
        done_at,
        done_by
      FROM care_tasks
      WHERE booking_id = $1
      ORDER BY care_task_id
    `,
    [bookingId]
  );
  return result.rows;
};

const BOOKING_SPACE_ID = `
  CASE b.booking_type::text
    WHEN 'RECREATION' THEN COALESCE(rs.space_id, l.space_id)
    WHEN 'APPOINTMENT' THEN COALESCE(a.space_id, l.space_id)
    ELSE COALESCE(l.space_id, rs.space_id, a.space_id)
  END
`;

const SPACE_BOOKING_MATCH = `
  (
    (
      s.space_type::text IN ('DOG_SUITE', 'CAT_SUITE', 'ROOM', 'KENNEL')
      AND b.booking_type::text = 'LODGING'
    )
    OR (s.space_type::text = 'RECREATION' AND b.booking_type::text = 'RECREATION')
    OR (s.space_type::text IN ('MULTIPURPOSE', 'SPA') AND b.booking_type::text = 'APPOINTMENT')
  )
`;

const getOccupancy = async (_req, res) => {
  try {
    const result = await query(
      `
        SELECT
          s.space_id,
          s.name,
          s.space_type,
          s.capacity,
          s.status,
          false AS occupied,
          NULL::text AS current_pet,
          '[]'::json AS current_pets,
          0 AS occupied_count
        FROM spaces s
        WHERE s.status <> 'INACTIVE'
        ORDER BY s.name
      `
    );

    const spaces = result.rows;
    const occupied = spaces.filter((space) => space.occupied).length;
    const available = spaces.filter((space) => !space.occupied && space.status === 'AVAILABLE').length;

    const lodgingSpaces = spaces.filter((space) =>
      ['DOG_SUITE', 'CAT_SUITE', 'ROOM'].includes(String(space.space_type || '').toUpperCase())
    );
    const occupiedLodging = lodgingSpaces.filter((space) => space.occupied).length;

    return res.status(200).json({
      occupied,
      available,
      total: spaces.length,
      lodging: {
        occupied: occupiedLodging,
        available: Math.max(0, 10 - occupiedLodging),
        total: 10,
      },
      spaces,
    });
  } catch (error) {
    console.error('Error en getOccupancy:', error);
    return res.status(500).json({ message: 'No se pudo consultar la ocupación' });
  }
};

const getTodayAgenda = async (req, res) => {
  const includeAll = String(req.query.all || 'true') !== 'false';

  try {
    const result = await query(
      `
        SELECT ${AGENDA_SELECT}
        ${AGENDA_FROM}
        WHERE b.status::text = ANY($1::text[])
          AND (
            $2::boolean
            OR (b.start_at::date <= CURRENT_DATE AND b.end_at::date >= CURRENT_DATE)
            OR b.status::text IN ('PENDING', 'CONFIRMED')
          )
        ORDER BY b.start_at
      `,
      [TODAY_STATUSES, includeAll]
    );

    return res.status(200).json({ agenda: result.rows });
  } catch (error) {
    console.error('Error en getTodayAgenda:', error);
    return res.status(500).json({ message: 'No se pudo obtener la agenda del día' });
  }
};

const getCareBoard = async (req, res) => {
  const assignedOnly = String(req.query.assigned || '') === 'true';
  const includeAll = String(req.query.all || '') === 'true';
  const userId = String(req.user.user_id);
  const statuses = includeAll
    ? TODAY_STATUSES
    : [...IN_HOUSE_STATUSES, 'CONFIRMED'];

  try {
    const values = [statuses];
    let assignedFilter = '';
    if (assignedOnly) {
      values.push(userId);
      assignedFilter = `AND b.assigned_staff_id = $${values.length}`;
    }

    const dateFilter = '';

    const result = await query(
      `
        SELECT ${AGENDA_SELECT}
        ${AGENDA_FROM}
        WHERE b.status::text = ANY($1::text[])
          AND b.booking_type::text IN ('LODGING', 'RECREATION')
          ${dateFilter}
          ${assignedFilter}
        ORDER BY b.start_at
      `,
      values
    );

    const board = [];
    for (const row of result.rows) {
      await ensureDefaultTasks(row.booking_id, row.pet_id);
      const tasks = await getTasksForBooking(row.booking_id);
      board.push({ ...row, tasks });
    }

    return res.status(200).json({ board });
  } catch (error) {
    console.error('Error en getCareBoard:', error);
    return res.status(500).json({ message: 'No se pudo cargar el panel de cuidadores' });
  }
};

const toggleCareTask = async (req, res) => {
  const taskId = String(req.params.id || '');
  if (!/^\d+$/.test(taskId)) {
    return res.status(400).json({ message: 'ID de tarea inválido' });
  }

  const isDone = req.body?.is_done;
  if (typeof isDone !== 'boolean') {
    return res.status(400).json({ message: 'is_done debe ser boolean' });
  }

  try {
    const result = await query(
      `
        UPDATE care_tasks
        SET
          is_done = $2,
          notes = COALESCE($3, notes),
          done_at = CASE WHEN $2 THEN NOW() ELSE NULL END,
          done_by = CASE WHEN $2 THEN $4 ELSE NULL END
        WHERE care_task_id = $1
        RETURNING *
      `,
      [taskId, isDone, req.body?.notes || null, req.user.user_id]
    );

    if (!result.rowCount) {
      return res.status(404).json({ message: 'Tarea no encontrada' });
    }

    return res.status(200).json({
      message: isDone ? 'Tarea marcada como realizada' : 'Tarea revertida',
      task: result.rows[0],
    });
  } catch (error) {
    console.error('Error en toggleCareTask:', error);
    return res.status(500).json({ message: 'No se pudo actualizar la tarea' });
  }
};

module.exports = {
  getTodayAgenda,
  getOccupancy,
  getCareBoard,
  toggleCareTask,
};
