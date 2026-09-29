const { query, getClient } = require('../config/db');
const { notifyBookingEvent } = require('../services/notificationService');

const SPA_SERVICE_FILTER = `
  b.booking_type::text = 'APPOINTMENT'
  AND (
    sc.category_type::text = 'SPA'
    OR sv.name ILIKE '%baño%'
    OR sv.name ILIKE '%spa%'
    OR sv.name ILIKE '%corte%'
  )
`;

const getMyAppointments = async (req, res) => {
  try {
    const rawDate = String(req.query?.date || '').slice(0, 10);
    const selectedDate = /^\d{4}-\d{2}-\d{2}$/.test(rawDate) ? rawDate : null;

    const result = await query(
      `
        SELECT
          a.appointment_id,
          a.booking_id,
          a.service_id,
          a.stylist_id,
          a.status AS appointment_status,
          b.status AS booking_status,
          b.booking_type,
          b.start_at,
          b.end_at,
          b.assigned_staff_id,
          p.pet_id,
          p.name AS pet_name,
          p.species,
          p.breed,
          sv.name AS service_name,
          sp.name AS space_name,
          pci.special_care,
          pci.allergies,
          pci.medications,
          a.owner_preferences,
          u.first_name AS owner_first_name,
          u.last_name AS owner_last_name
        FROM appointments a
        JOIN bookings b ON b.booking_id = a.booking_id
        JOIN pets p ON p.pet_id = b.pet_id
        JOIN users u ON u.user_id = b.owner_id
        LEFT JOIN services sv ON sv.service_id = a.service_id
        LEFT JOIN service_categories sc ON sc.category_id = sv.category_id
        LEFT JOIN spaces sp ON sp.space_id = a.space_id
        LEFT JOIN pet_care_instructions pci ON pci.pet_id = p.pet_id
        WHERE b.status::text NOT IN ('CANCELLED', 'NO_SHOW', 'COMPLETED')
          AND COALESCE(a.status::text, b.status::text) NOT IN ('CANCELLED', 'COMPLETED', 'FAILED')
          AND ${SPA_SERVICE_FILTER}
          AND (b.start_at AT TIME ZONE 'America/Bogota')::date =
            COALESCE($1::date, (timezone('America/Bogota', now()))::date)
        ORDER BY b.start_at
      `,
      [selectedDate]
    );

    const rows = result.rows || [];
    return res.status(200).json({ appointments: rows, pets: rows, date: selectedDate });
  } catch (error) {
    console.error('Error en getMyAppointments:', error);
    return res.status(500).json({ message: 'No se pudieron listar las citas del estilista', appointments: [], pets: [] });
  }
};

const completeAppointment = async (req, res) => {
  const appointmentId = String(req.params.id || '');
  if (!/^\d+$/.test(appointmentId)) {
    return res.status(400).json({ message: 'ID de cita inválido' });
  }

  const notes = req.body?.notes || null;
  const client = await getClient();

  try {
    await client.query('BEGIN');
    const current = await client.query(
      `
        SELECT a.appointment_id, a.booking_id, a.stylist_id, b.status
        FROM appointments a
        JOIN bookings b ON b.booking_id = a.booking_id
        WHERE a.appointment_id = $1
        FOR UPDATE
      `,
      [appointmentId]
    );

    const appointment = current.rows[0];
    if (!appointment) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Cita no encontrada' });
    }

    await client.query(
      `
        UPDATE appointments
        SET
          status = 'COMPLETED'::pet_resort.booking_status,
          result_notes = COALESCE($2, result_notes),
          completed_at = NOW(),
          updated_at = NOW()
        WHERE appointment_id = $1
      `,
      [appointmentId, notes]
    );

    await client.query(
      `
        UPDATE bookings
        SET status = 'COMPLETED'::pet_resort.booking_status, updated_at = NOW()
        WHERE booking_id = $1
      `,
      [appointment.booking_id]
    );

    const log = await client.query(
      `
        INSERT INTO service_logs (booking_id, stylist_id, status, notes)
        VALUES ($1, $2, 'COMPLETED'::pet_resort.service_log_status, $3)
        RETURNING
          service_log_id AS id,
          booking_id,
          stylist_id,
          status,
          notes,
          created_at
      `,
      [appointment.booking_id, req.user.user_id, notes]
    );

    await client.query('COMMIT');
    notifyBookingEvent(appointment.booking_id, 'SPA_DONE');
    return res.status(200).json({
      message: 'Servicio de estética marcado como completado',
      log: log.rows[0],
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error en completeAppointment:', error);
    return res.status(500).json({ message: 'No se pudo completar la cita' });
  } finally {
    client.release();
  }
};

const updateAppointmentStatus = async (req, res) => {
  const appointmentId = String(req.params.id || '');
  if (!/^\d+$/.test(appointmentId)) {
    return res.status(400).json({ message: 'ID de cita inválido' });
  }

  const requested = String(req.body?.status || '').toUpperCase();
  const notes = req.body?.notes || null;
  const statusMap = {
    IN_PROGRESS: { booking: 'IN_PROGRESS', log: 'IN_PROGRESS' },
    COMPLETED: { booking: 'COMPLETED', log: 'COMPLETED' },
    FAILED: { booking: 'CANCELLED', log: 'FAILED' },
    CANCELLED: { booking: 'CANCELLED', log: 'FAILED' },
  };

  if (!statusMap[requested]) {
    return res.status(400).json({
      message: 'status debe ser IN_PROGRESS, COMPLETED o FAILED',
    });
  }

  const mapped = statusMap[requested];
  const client = await getClient();

  try {
    await client.query('BEGIN');
    const current = await client.query(
      `
        SELECT a.appointment_id, a.booking_id
        FROM appointments a
        WHERE a.appointment_id = $1
        FOR UPDATE
      `,
      [appointmentId]
    );
    const appointment = current.rows[0];
    if (!appointment) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Cita no encontrada' });
    }

    await client.query(
      `
        UPDATE appointments
        SET
          status = $2::pet_resort.booking_status,
          stylist_id = COALESCE(stylist_id, $3),
          result_notes = COALESCE($4, result_notes),
          completed_at = CASE WHEN $2 = 'COMPLETED' THEN NOW() ELSE completed_at END,
          updated_at = NOW()
        WHERE appointment_id = $1
      `,
      [appointmentId, mapped.booking, req.user.user_id, notes]
    );

    await client.query(
      `
        UPDATE bookings
        SET
          status = $2::pet_resort.booking_status,
          assigned_staff_id = COALESCE(assigned_staff_id, $3),
          updated_at = NOW()
        WHERE booking_id = $1
      `,
      [appointment.booking_id, mapped.booking, req.user.user_id]
    );

    const log = await client.query(
      `
        INSERT INTO service_logs (booking_id, stylist_id, status, notes)
        VALUES ($1, $2, $3::pet_resort.service_log_status, $4)
        RETURNING service_log_id AS id, booking_id, stylist_id, status, notes, created_at
      `,
      [appointment.booking_id, req.user.user_id, mapped.log, notes]
    );

    await client.query('COMMIT');
    notifyBookingEvent(
      appointment.booking_id,
      requested === 'IN_PROGRESS' ? 'SPA_STARTED' : requested === 'COMPLETED' ? 'SPA_DONE' : 'CANCELLED'
    );
    return res.status(200).json({
      message: 'Estado del servicio actualizado',
      log: log.rows[0],
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error en updateAppointmentStatus:', error);
    return res.status(500).json({ message: 'No se pudo actualizar el estado del servicio' });
  } finally {
    client.release();
  }
};

module.exports = {
  getMyAppointments,
  completeAppointment,
  updateAppointmentStatus,
};
