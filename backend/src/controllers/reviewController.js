const { query } = require('../config/db');
const { normalizeRole } = require('../constants/roles');

const REVIEW_SELECT = `
  r.review_id,
  r.user_id,
  r.rating,
  r.comment,
  r.created_at,
  r.updated_at,
  u.first_name,
  u.last_name
`;

const isClient = (user) =>
  (user?.roles || []).map((role) => normalizeRole(role)).includes('CLIENT');

const publicName = (row) => {
  const first = String(row.first_name || 'Familia').trim();
  const last = String(row.last_name || '').trim();
  const initial = last ? ` ${last.charAt(0).toUpperCase()}.` : '';
  return `${first}${initial}`;
};

const mapReview = (row) => ({
  review_id: row.review_id,
  rating: Number(row.rating),
  comment: row.comment,
  created_at: row.created_at,
  updated_at: row.updated_at,
  author_name: publicName(row),
  is_mine: false,
});

const getReviews = async (req, res) => {
  try {
    const result = await query(
      `
        SELECT ${REVIEW_SELECT}
        FROM reviews r
        JOIN users u ON u.user_id = r.user_id
        ORDER BY r.updated_at DESC, r.created_at DESC
        LIMIT 60
      `
    );

    const viewerId = req.user?.user_id;
    const reviews = result.rows.map((row) => ({
      ...mapReview(row),
      is_mine: viewerId ? String(row.user_id) === String(viewerId) : false,
    }));

    const total = reviews.length;
    const average =
      total === 0
        ? 0
        : Math.round((reviews.reduce((sum, item) => sum + item.rating, 0) / total) * 10) / 10;

    return res.status(200).json({ reviews, average, total });
  } catch (error) {
    console.error('Error al listar reseñas:', error.message);
    return res.status(500).json({ message: 'No se pudieron cargar las valoraciones' });
  }
};

const upsertReview = async (req, res) => {
  try {
    if (!isClient(req.user)) {
      return res.status(403).json({
        message: 'Solo las familias con rol de cliente pueden enviar una valoración',
      });
    }

    const rating = Number.parseInt(req.body.rating, 10);
    const comment = String(req.body.comment || '').trim();

    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      return res.status(400).json({ message: 'La calificación debe ser un número entero de 1 a 5' });
    }

    if (comment.length < 10) {
      return res.status(400).json({ message: 'La reseña debe tener al menos 10 caracteres' });
    }

    if (comment.length > 600) {
      return res.status(400).json({ message: 'La reseña no puede superar los 600 caracteres' });
    }

    const result = await query(
      `
        INSERT INTO reviews (user_id, rating, comment)
        VALUES ($1, $2, $3)
        ON CONFLICT (user_id)
        DO UPDATE SET
          rating = EXCLUDED.rating,
          comment = EXCLUDED.comment,
          updated_at = CURRENT_TIMESTAMP
        RETURNING review_id, user_id, rating, comment, created_at, updated_at
      `,
      [req.user.user_id, rating, comment]
    );

    const profile = await query(
      `SELECT first_name, last_name FROM users WHERE user_id = $1`,
      [req.user.user_id]
    );

    return res.status(200).json({
      message: 'Gracias por tu valoración',
      review: {
        ...mapReview({ ...result.rows[0], ...profile.rows[0] }),
        is_mine: true,
      },
    });
  } catch (error) {
    console.error('Error al guardar reseña:', error.message);
    return res.status(500).json({ message: 'No se pudo guardar la valoración' });
  }
};

module.exports = {
  getReviews,
  upsertReview,
};
