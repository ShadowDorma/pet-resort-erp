const { query } = require('../config/db');

const mapType = (type) => {
  const key = String(type || 'SYSTEM').toUpperCase();
  const aliases = {
    BOOKING: 'BOOKING_CONFIRMATION',
    CONFIRMED: 'BOOKING_CONFIRMATION',
    CREATED: 'BOOKING_CONFIRMATION',
    BOOKING_CHANGE: 'BOOKING_CHANGE',
    CHECK_IN: 'BOOKING_CHANGE',
    CHECK_OUT: 'BOOKING_CHANGE',
    CANCELLED: 'BOOKING_CHANGE',
    RESCHEDULED: 'BOOKING_CHANGE',
    SPA: 'SERVICE_STATUS',
    SPA_STARTED: 'SERVICE_STATUS',
    SPA_DONE: 'SERVICE_STATUS',
    CARE_LOG: 'SERVICE_STATUS',
    CHECKOUT_REMINDER: 'LODGING_REMINDER',
    SPA_REMINDER: 'APPOINTMENT_REMINDER',
    GENERAL: 'SYSTEM',
    SYSTEM: 'SYSTEM',
    BOOKING_CONFIRMATION: 'BOOKING_CONFIRMATION',
    APPOINTMENT_REMINDER: 'APPOINTMENT_REMINDER',
    LODGING_REMINDER: 'LODGING_REMINDER',
    SERVICE_STATUS: 'SERVICE_STATUS',
  };
  return aliases[key] || 'SYSTEM';
};

const createNotification = async ({
  userId,
  type,
  title,
  body,
  link = '/reservar',
  relatedBookingId = null,
}) => {
  if (!userId || !title) {
    return null;
  }

  try {
    const result = await query(
      `
        INSERT INTO notifications (
          user_id,
          notification_type,
          title,
          message,
          status,
          link,
          related_booking_id,
          related_table,
          related_id,
          is_read
        )
        VALUES (
          $1,
          $2::pet_resort.notification_type,
          $3,
          $4,
          'UNREAD'::pet_resort.notification_status,
          $5,
          $6,
          $7,
          $6,
          false
        )
        RETURNING notification_id
      `,
      [
        userId,
        mapType(type),
        title,
        body || '',
        link,
        relatedBookingId,
        relatedBookingId ? 'bookings' : null,
      ]
    );
    return result.rows[0];
  } catch (error) {
    console.error('No se pudo crear la notificación:', error.message);
    return null;
  }
};

const loadBookingAudience = async (bookingId) => {
  const result = await query(
    `
      SELECT
        b.booking_id,
        b.owner_id,
        b.booking_type,
        b.status,
        b.end_at,
        p.pet_id,
        p.name AS pet_name
      FROM bookings b
      JOIN pets p ON p.pet_id = b.pet_id
      WHERE b.booking_id = $1
    `,
    [bookingId]
  );
  return result.rows[0] || null;
};

const notifyBookingEvent = async (bookingId, eventKey) => {
  const booking = await loadBookingAudience(bookingId);
  if (!booking) {
    return null;
  }

  const pet = booking.pet_name || 'tu mascota';
  const isSpa = String(booking.booking_type).toUpperCase() === 'APPOINTMENT';
  const catalog = {
    CREATED: {
      type: 'BOOKING',
      title: 'Reserva registrada',
      body: `Recibimos la reserva de ${pet}. Te avisaremos cuando el equipo la confirme.`,
    },
    CONFIRMED: {
      type: 'BOOKING',
      title: 'Reserva confirmada',
      body: `Tu reserva para ${pet} ha sido confirmada.`,
    },
    CHECK_IN: {
      type: 'BOOKING',
      title: 'Check-in realizado',
      body: `${pet} ya está en Pet Resort. Puedes seguir la bitácora en vivo.`,
    },
    CHECK_OUT: {
      type: 'BOOKING',
      title: 'Check-out registrado',
      body: `${pet} ya fue entregado. Gracias por confiar en Pet Resort.`,
    },
    CANCELLED: {
      type: 'BOOKING',
      title: 'Reserva cancelada',
      body: `La reserva de ${pet} fue cancelada.`,
    },
    RESCHEDULED: {
      type: 'BOOKING',
      title: 'Cambio de horario',
      body: `Se actualizó la fecha u hora de la reserva de ${pet}.`,
    },
    SPA_STARTED: {
      type: 'SPA',
      title: 'Spa en curso',
      body: `El servicio de estética de ${pet} ya comenzó.`,
    },
    SPA_DONE: {
      type: 'SPA',
      title: 'Spa finalizado',
      body: `El servicio de estética de ${pet} fue completado.`,
    },
  };

  const payload = catalog[eventKey];
  if (!payload) {
    return null;
  }

  return createNotification({
    userId: booking.owner_id,
    type: isSpa && payload.type === 'BOOKING' ? 'SPA' : payload.type,
    title: payload.title,
    body: payload.body,
    link: eventKey === 'CHECK_IN' ? `/mis-mascotas/${booking.pet_id}?tab=bitacora` : '/reservar',
    relatedBookingId: booking.booking_id,
  });
};

const notifyCareLog = async ({ ownerId, petId, petName, logType, hasPhoto }) => {
  const name = petName || 'tu mascota';
  const labels = {
    FEEDING: 'alimentación',
    ACTIVITY: 'paseo',
    MEDICAL: 'medicación',
    NOTE: 'incidencia',
  };
  const activity = labels[String(logType || '').toUpperCase()] || 'bitácora';

  return createNotification({
    userId: ownerId,
    type: 'CARE_LOG',
    title: hasPhoto ? '¡Nuevo reporte!' : 'Actualización de bitácora',
    body: hasPhoto
      ? `El cuidador subió una foto del ${activity} de ${name}.`
      : `Hay un nuevo registro de ${activity} para ${name}.`,
    link: `/mis-mascotas/${petId}?tab=bitacora`,
  });
};

const ensureReminderNotifications = async (userId) => {
  const lodging = await query(
    `
      SELECT b.booking_id, b.owner_id, p.pet_id, p.name AS pet_name, b.end_at
      FROM bookings b
      JOIN pets p ON p.pet_id = b.pet_id
      WHERE b.owner_id = $1
        AND b.booking_type = 'LODGING'
        AND b.status::text = ANY(ARRAY['CONFIRMED','IN_HOUSE','CHECKED_IN','IN_PROGRESS'])
        AND b.end_at BETWEEN NOW() AND NOW() + INTERVAL '24 hours'
        AND NOT EXISTS (
          SELECT 1
          FROM notifications n
          WHERE n.user_id = b.owner_id
            AND n.related_booking_id = b.booking_id
            AND n.notification_type = 'LODGING_REMINDER'::pet_resort.notification_type
            AND n.created_at >= NOW() - INTERVAL '20 hours'
        )
    `,
    [userId]
  );

  for (const row of lodging.rows) {
    await createNotification({
      userId: row.owner_id,
      type: 'CHECKOUT_REMINDER',
      title: 'Recordatorio de check-out',
      body: `Hoy o en las próximas horas es el check-out de ${row.pet_name}.`,
      link: '/reservar',
      relatedBookingId: row.booking_id,
    });
  }

  const spa = await query(
    `
      SELECT b.booking_id, b.owner_id, p.pet_id, p.name AS pet_name, b.start_at
      FROM bookings b
      JOIN pets p ON p.pet_id = b.pet_id
      WHERE b.owner_id = $1
        AND b.booking_type = 'APPOINTMENT'
        AND b.status::text = ANY(ARRAY['PENDING','CONFIRMED'])
        AND b.start_at BETWEEN NOW() AND NOW() + INTERVAL '12 hours'
        AND NOT EXISTS (
          SELECT 1
          FROM notifications n
          WHERE n.user_id = b.owner_id
            AND n.related_booking_id = b.booking_id
            AND n.notification_type = 'APPOINTMENT_REMINDER'::pet_resort.notification_type
            AND n.created_at >= NOW() - INTERVAL '12 hours'
        )
    `,
    [userId]
  );

  for (const row of spa.rows) {
    await createNotification({
      userId: row.owner_id,
      type: 'SPA_REMINDER',
      title: 'Recordatorio de spa',
      body: `Se acerca la cita de estética de ${row.pet_name}.`,
      link: '/reservar',
      relatedBookingId: row.booking_id,
    });
  }
};

module.exports = {
  createNotification,
  notifyBookingEvent,
  notifyCareLog,
  ensureReminderNotifications,
};
