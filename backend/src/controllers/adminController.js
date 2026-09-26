const { query } = require('../config/db');
const { STAFF_POSITIONS, OPERATIONAL_ROLES } = require('../constants/roles');

const STAFF_ROLE_FILTER = STAFF_POSITIONS.map((position) => position.name);

const getMetrics = async (_req, res) => {
  try {
    const [bookings, revenue, occupancy, clients] = await Promise.all([
      query(`SELECT COUNT(*)::int AS total FROM bookings`),
      query(
        `
          SELECT COALESCE(SUM(bi.line_total), 0) AS total
          FROM booking_items bi
          JOIN bookings b ON b.booking_id = bi.booking_id
          WHERE b.status <> 'CANCELLED'
        `
      ),
      query(
        `
          SELECT
            COUNT(*) FILTER (WHERE status = 'AVAILABLE')::int AS available,
            COUNT(*)::int AS total,
            COUNT(*) FILTER (
              WHERE space_id IN (
                SELECT space_id FROM space_occupancy WHERE is_active = true
              )
            )::int AS occupied
          FROM spaces
        `
      ),
      query(
        `
          SELECT COUNT(DISTINCT u.user_id)::int AS total
          FROM users u
          JOIN user_roles ur ON ur.user_id = u.user_id
          JOIN roles r ON r.role_id = ur.role_id
          WHERE u.status = 'ACTIVE'
            AND UPPER(r.name) = 'CLIENT'
        `
      ),
    ]);

    const occupancyRow = occupancy.rows[0];
    const occupancyRate = occupancyRow.total
      ? Math.round((occupancyRow.occupied / occupancyRow.total) * 100)
      : 0;

    return res.status(200).json({
      total_bookings: bookings.rows[0].total,
      estimated_revenue: Number(revenue.rows[0].total),
      occupancy_rate: occupancyRate,
      occupied_spaces: occupancyRow.occupied,
      total_spaces: occupancyRow.total,
      active_clients: clients.rows[0].total,
    });
  } catch (error) {
    console.error('Error en getMetrics:', error);
    return res.status(500).json({ message: 'No se pudieron obtener las métricas' });
  }
};

const getUsersByRole = async (req, res) => {
  const role = String(req.query.role || '').toUpperCase();
  const allowed = ['STAFF', 'CLIENT', 'ADMIN', ...OPERATIONAL_ROLES];
  if (role && !allowed.includes(role)) {
    return res.status(400).json({ message: `role debe ser uno de: ${allowed.join(', ')}` });
  }

  const roleFilter = !role || role === 'STAFF' ? STAFF_ROLE_FILTER : [role];

  try {
    const result = await query(
      `
        SELECT
          u.user_id,
          u.first_name,
          u.last_name,
          u.email,
          u.phone,
          u.status,
          u.job_title,
          u.created_at,
          COALESCE(array_agg(r.name) FILTER (WHERE r.name IS NOT NULL), '{}') AS roles
        FROM users u
        LEFT JOIN user_roles ur ON ur.user_id = u.user_id
        LEFT JOIN roles r ON r.role_id = ur.role_id
        WHERE EXISTS (
          SELECT 1
          FROM user_roles ur2
          JOIN roles r2 ON r2.role_id = ur2.role_id
          WHERE ur2.user_id = u.user_id
            AND UPPER(r2.name) = ANY($1::text[])
        )
        GROUP BY u.user_id
        ORDER BY u.created_at DESC
      `,
      [roleFilter]
    );

    return res.status(200).json({ users: result.rows, positions: STAFF_POSITIONS });
  } catch (error) {
    console.error('Error en getUsersByRole:', error);
    return res.status(500).json({ message: 'No se pudieron listar los usuarios' });
  }
};

const getStaffPositions = (_req, res) => {
  return res.status(200).json({ positions: STAFF_POSITIONS });
};

module.exports = {
  getMetrics,
  getUsersByRole,
  getStaffPositions,
};
