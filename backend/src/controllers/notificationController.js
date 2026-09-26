const { query } = require('../config/db');
const { ensureReminderNotifications } = require('../services/notificationService');

const mapRow = (row) => ({
  notification_id: row.notification_id,
  type: row.notification_type,
  title: row.title,
  body: row.message,
  link: row.link,
  is_read: Boolean(row.is_read) || String(row.status || '').toUpperCase() === 'READ' || Boolean(row.read_at),
  created_at: row.created_at,
});

const listNotifications = async (req, res) => {
  try {
    await ensureReminderNotifications(req.user.user_id);
  } catch (error) {
    console.error('No se pudieron generar recordatorios:', error.message);
  }

  try {
    const result = await query(
      `
        SELECT
          notification_id,
          notification_type,
          title,
          message,
          link,
          is_read,
          status,
          read_at,
          created_at
        FROM notifications
        WHERE user_id = $1
        ORDER BY created_at DESC
        LIMIT 80
      `,
      [req.user.user_id]
    );

    const notifications = result.rows.map(mapRow);
    const unread = notifications.filter((item) => !item.is_read).length;

    return res.status(200).json({ notifications, unread });
  } catch (error) {
    console.error('Error al listar notificaciones:', error.message);
    return res.status(500).json({ message: 'No se pudieron cargar las notificaciones' });
  }
};

const markAllRead = async (req, res) => {
  try {
    await query(
      `
        UPDATE notifications
        SET
          is_read = true,
          status = 'READ',
          read_at = COALESCE(read_at, NOW())
        WHERE user_id = $1
          AND (is_read = false OR status IS DISTINCT FROM 'READ' OR read_at IS NULL)
      `,
      [req.user.user_id]
    );
    return res.status(200).json({ message: 'Notificaciones marcadas como leídas' });
  } catch (error) {
    console.error('Error al marcar notificaciones:', error.message);
    return res.status(500).json({ message: 'No se pudieron actualizar las notificaciones' });
  }
};

const markOneRead = async (req, res) => {
  const id = req.params.id;
  if (!/^\d+$/.test(String(id))) {
    return res.status(400).json({ message: 'ID inválido' });
  }

  try {
    await query(
      `
        UPDATE notifications
        SET
          is_read = true,
          status = 'READ',
          read_at = COALESCE(read_at, NOW())
        WHERE notification_id = $1 AND user_id = $2
      `,
      [id, req.user.user_id]
    );
    return res.status(200).json({ message: 'Notificación leída' });
  } catch (error) {
    console.error('Error al marcar notificación:', error.message);
    return res.status(500).json({ message: 'No se pudo actualizar la notificación' });
  }
};

module.exports = {
  listNotifications,
  markAllRead,
  markOneRead,
};
