const { getClient, query } = require('../config/db');

const SPACE_STATUSES = ['AVAILABLE', 'MAINTENANCE', 'INACTIVE'];
const SPACE_TYPES = ['ROOM', 'KENNEL', 'RECREATION', 'MULTIPURPOSE', 'DOG_SUITE', 'CAT_SUITE', 'SPA'];

const SERVICE_SELECT = `
  s.service_id,
  s.category_id,
  s.name,
  s.description,
  s.target_pet_type,
  s.duration_label,
  s.duration_minutes,
  COALESCE(sph.price, s.current_price) AS current_price,
  s.is_available,
  s.created_at,
  s.updated_at,
  sc.name AS category_name,
  sc.category_type,
  sc.description AS category_description
`;

const SERVICE_FROM = `
  FROM services s
  LEFT JOIN service_categories sc ON sc.category_id = s.category_id
  LEFT JOIN LATERAL (
    SELECT price
    FROM service_price_history
    WHERE service_id = s.service_id
      AND valid_from <= NOW()
      AND (valid_to IS NULL OR valid_to > NOW())
    ORDER BY valid_from DESC
    LIMIT 1
  ) sph ON TRUE
`;

const parsePositiveInt = (value) => {
  if (value === undefined || value === null || value === '') {
    return null;
  }
  if (!/^\d+$/.test(String(value))) {
    return undefined;
  }
  return Number(value);
};

const getAllServices = async (req, res) => {
  const category = req.query.category || req.query.categoria;
  const species = req.query.species || req.query.especie;
  const includeUnavailable = String(req.query.includeUnavailable || '') === 'true';

  const filters = [];
  const values = [];

  if (!includeUnavailable) {
    filters.push('s.is_available = true');
    filters.push('(sc.is_active IS NULL OR sc.is_active = true)');
  }

  if (category) {
    if (/^\d+$/.test(String(category))) {
      values.push(category);
      filters.push(`s.category_id = $${values.length}`);
    } else {
      values.push(String(category).trim());
      const index = values.length;
      filters.push(`(
        sc.name ILIKE '%' || $${index} || '%'
        OR sc.category_type::text ILIKE '%' || $${index} || '%'
      )`);
    }
  }

  if (species) {
    values.push(String(species).trim());
    filters.push(`s.target_pet_type ILIKE '%' || $${values.length} || '%'`);
  }

  const whereClause = filters.length > 0 ? `WHERE ${filters.join(' AND ')}` : '';

  try {
    const result = await query(
      `
        SELECT ${SERVICE_SELECT}
        ${SERVICE_FROM}
        ${whereClause}
        ORDER BY sc.name NULLS LAST, s.name
      `,
      values
    );

    return res.status(200).json({ services: result.rows });
  } catch (error) {
    console.error('Error en getAllServices:', error);
    return res.status(500).json({ message: 'No se pudo obtener el catálogo de servicios' });
  }
};

const getServiceById = async (req, res) => {
  const serviceId = parsePositiveInt(req.params.id);
  if (serviceId === undefined || serviceId === null) {
    return res.status(400).json({ message: 'ID de servicio inválido' });
  }

  try {
    const result = await query(
      `
        SELECT ${SERVICE_SELECT}
        ${SERVICE_FROM}
        WHERE s.service_id = $1
      `,
      [serviceId]
    );

    const service = result.rows[0];
    if (!service) {
      return res.status(404).json({ message: 'Servicio no encontrado' });
    }

    const history = await query(
      `
        SELECT
          price_history_id,
          price,
          valid_from,
          valid_to
        FROM service_price_history
        WHERE service_id = $1
        ORDER BY valid_from DESC
      `,
      [serviceId]
    );

    return res.status(200).json({
      service: {
        ...service,
        price_history: history.rows,
      },
    });
  } catch (error) {
    console.error('Error en getServiceById:', error);
    return res.status(500).json({ message: 'No se pudo obtener el servicio' });
  }
};

const getAvailableSpaces = async (req, res) => {
  const capacity = parsePositiveInt(req.query.capacity);
  if (capacity === undefined) {
    return res.status(400).json({ message: 'capacity debe ser un entero positivo' });
  }

  const status = String(req.query.status || 'AVAILABLE').toUpperCase();
  if (!SPACE_STATUSES.includes(status)) {
    return res.status(400).json({
      message: `status debe ser uno de: ${SPACE_STATUSES.join(', ')}`,
    });
  }

  const spaceType = req.query.space_type || req.query.type;
  if (spaceType && !SPACE_TYPES.includes(String(spaceType).toUpperCase())) {
    return res.status(400).json({
      message: `space_type debe ser uno de: ${SPACE_TYPES.join(', ')}`,
    });
  }

  const filters = ['status = $1::pet_resort.space_status'];
  const values = [status];

  if (capacity !== null) {
    values.push(capacity);
    filters.push(`capacity >= $${values.length}`);
  }

  if (spaceType) {
    values.push(String(spaceType).toUpperCase());
    filters.push(`space_type = $${values.length}::pet_resort.space_type`);
  }

  try {
    const result = await query(
      `
        SELECT
          space_id,
          name,
          space_type,
          capacity,
          status,
          description,
          created_at,
          updated_at
        FROM spaces
        WHERE ${filters.join(' AND ')}
        ORDER BY space_type, capacity, name
      `,
      values
    );

    return res.status(200).json({ spaces: result.rows });
  } catch (error) {
    console.error('Error en getAvailableSpaces:', error);
    return res.status(500).json({ message: 'No se pudieron consultar los espacios' });
  }
};

const getBusinessHours = async (_req, res) => {
  try {
    const hours = await query(
      `
        SELECT
          business_hour_id,
          day_of_week,
          opens_at,
          closes_at,
          is_closed
        FROM business_hours
        ORDER BY day_of_week
      `
    );

    const staffAvailability = await query(
      `
        SELECT
          day_of_week,
          MIN(starts_at) AS starts_at,
          MAX(ends_at) AS ends_at,
          COUNT(*) FILTER (WHERE is_available = true) AS available_staff
        FROM staff_availability
        WHERE is_available = true
        GROUP BY day_of_week
        ORDER BY day_of_week
      `
    );

    return res.status(200).json({
      hours: hours.rows,
      staff_availability: staffAvailability.rows,
    });
  } catch (error) {
    console.error('Error en getBusinessHours:', error);
    return res.status(500).json({
      message: 'No se pudieron consultar los horarios de atención',
    });
  }
};

const parseServiceId = (value) => {
  if (!/^\d+$/.test(String(value))) {
    return null;
  }
  return String(value);
};

const parseDuration = ({ duration, duration_label, duration_minutes }) => {
  let minutes = duration_minutes === undefined || duration_minutes === null || duration_minutes === ''
    ? null
    : Number(duration_minutes);
  let label = duration_label ? String(duration_label).trim() : '';

  if (!label && duration !== undefined && duration !== null && duration !== '') {
    label = String(duration).trim();
  }

  if (minutes === null && label) {
    const match = label.match(/(\d+)/);
    if (match) {
      minutes = Number(match[1]);
      if (/día|dia|jornada|day/i.test(label) && minutes < 24) {
        minutes = minutes * 1440;
      }
    }
  }

  if (!label && minutes) {
    label = minutes >= 1440 ? `${Math.round(minutes / 1440)} día(s)` : `${minutes} min`;
  }

  return {
    duration_label: label || null,
    duration_minutes: Number.isFinite(minutes) ? minutes : null,
  };
};

const fetchServiceById = async (serviceId) => {
  const result = await query(
    `
      SELECT ${SERVICE_SELECT}
      ${SERVICE_FROM}
      WHERE s.service_id = $1
    `,
    [serviceId]
  );
  return result.rows[0] || null;
};

const closeCurrentPrice = async (client, serviceId) => {
  await client.query(
    `
      UPDATE service_price_history
      SET valid_to = NOW()
      WHERE service_id = $1
        AND valid_to IS NULL
    `,
    [serviceId]
  );
};

const insertPrice = async (client, serviceId, price, changedBy) => {
  await closeCurrentPrice(client, serviceId);
  await client.query(
    `
      INSERT INTO service_price_history (service_id, price, valid_from, valid_to, changed_by)
      VALUES ($1, $2, NOW(), NULL, $3)
    `,
    [serviceId, price, changedBy || null]
  );
};

const getCategories = async (_req, res) => {
  try {
    const result = await query(
      `
        SELECT category_id, name, category_type, description, is_active
        FROM service_categories
        ORDER BY name
      `
    );
    return res.status(200).json({ categories: result.rows });
  } catch (error) {
    console.error('Error en getCategories:', error);
    return res.status(500).json({ message: 'No se pudieron listar las categorías' });
  }
};

const getSpaces = async (req, res) => {
  const status = req.query.status ? String(req.query.status).toUpperCase() : null;
  if (status && status !== 'ALL' && !SPACE_STATUSES.includes(status)) {
    return res.status(400).json({
      message: `status debe ser uno de: ${SPACE_STATUSES.join(', ')}`,
    });
  }

  try {
    const values = [];
    const filters = [];
    if (status && status !== 'ALL') {
      values.push(status);
      filters.push(`status = $1::pet_resort.space_status`);
    }

    const result = await query(
      `
        SELECT
          space_id,
          name,
          space_type,
          capacity,
          status,
          description,
          created_at,
          updated_at
        FROM spaces
        ${filters.length ? `WHERE ${filters.join(' AND ')}` : ''}
        ORDER BY space_type, name
      `,
      values
    );

    return res.status(200).json({ spaces: result.rows });
  } catch (error) {
    console.error('Error en getSpaces:', error);
    return res.status(500).json({ message: 'No se pudieron listar los espacios' });
  }
};

const createService = async (req, res) => {
  const {
    name,
    category_id,
    category,
    price,
    current_price,
    description,
    duration,
    duration_label,
    duration_minutes,
    target_pet_type,
    is_available,
  } = req.body || {};

  if (!name) {
    return res.status(400).json({ message: 'El nombre del servicio es obligatorio' });
  }

  const amount = Number(price ?? current_price);
  if (!Number.isFinite(amount) || amount < 0) {
    return res.status(400).json({ message: 'El precio es obligatorio y debe ser un número positivo' });
  }

  const durationFields = parseDuration({ duration, duration_label, duration_minutes });
  const client = await getClient();

  try {
    await client.query('BEGIN');

    let categoryId = category_id || null;
    if (!categoryId && category) {
      const found = await client.query(
        `
          SELECT category_id
          FROM service_categories
          WHERE category_id::text = $1 OR name ILIKE $2
          LIMIT 1
        `,
        [String(category), String(category).trim()]
      );
      categoryId = found.rows[0]?.category_id || null;
    }

    if (!categoryId) {
      throw Object.assign(new Error('La categoría es obligatoria'), { statusCode: 400 });
    }

    const inserted = await client.query(
      `
        INSERT INTO services (
          category_id,
          name,
          description,
          target_pet_type,
          duration_label,
          duration_minutes,
          current_price,
          is_available
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING service_id
      `,
      [
        categoryId,
        name.trim(),
        description || null,
        target_pet_type || 'Perros y Gatos',
        durationFields.duration_label,
        durationFields.duration_minutes,
        amount,
        is_available === false ? false : true,
      ]
    );

    const serviceId = inserted.rows[0].service_id;
    await insertPrice(client, serviceId, amount, req.user?.user_id);
    await client.query('COMMIT');

    return res.status(201).json({
      message: 'Servicio creado',
      service: await fetchServiceById(serviceId),
    });
  } catch (error) {
    await client.query('ROLLBACK');
    if (error.statusCode) {
      return res.status(error.statusCode).json({ message: error.message });
    }
    console.error('Error en createService:', error);
    return res.status(500).json({ message: 'No se pudo crear el servicio' });
  } finally {
    client.release();
  }
};

const updateService = async (req, res) => {
  const serviceId = parseServiceId(req.params.id);
  if (!serviceId) {
    return res.status(400).json({ message: 'ID de servicio inválido' });
  }

  const existing = await fetchServiceById(serviceId);
  if (!existing) {
    return res.status(404).json({ message: 'Servicio no encontrado' });
  }

  const {
    name,
    category_id,
    category,
    price,
    current_price,
    description,
    duration,
    duration_label,
    duration_minutes,
    target_pet_type,
    is_available,
  } = req.body || {};

  const durationFields = parseDuration({
    duration,
    duration_label: duration_label ?? existing.duration_label,
    duration_minutes: duration_minutes ?? existing.duration_minutes,
  });

  const nextPrice = price !== undefined || current_price !== undefined
    ? Number(price ?? current_price)
    : Number(existing.current_price);

  if (!Number.isFinite(nextPrice) || nextPrice < 0) {
    return res.status(400).json({ message: 'El precio debe ser un número positivo' });
  }

  const client = await getClient();

  try {
    await client.query('BEGIN');

    let categoryId = category_id || existing.category_id;
    if (category && !category_id) {
      const found = await client.query(
        `
          SELECT category_id
          FROM service_categories
          WHERE category_id::text = $1 OR name ILIKE $2
          LIMIT 1
        `,
        [String(category), String(category).trim()]
      );
      if (found.rows[0]) {
        categoryId = found.rows[0].category_id;
      }
    }

    await client.query(
      `
        UPDATE services
        SET
          category_id = $2,
          name = $3,
          description = $4,
          target_pet_type = $5,
          duration_label = $6,
          duration_minutes = $7,
          current_price = $8,
          is_available = $9,
          updated_at = NOW()
        WHERE service_id = $1
      `,
      [
        serviceId,
        categoryId,
        name ? name.trim() : existing.name,
        description === undefined ? existing.description : description,
        target_pet_type === undefined ? existing.target_pet_type : target_pet_type,
        durationFields.duration_label,
        durationFields.duration_minutes,
        nextPrice,
        is_available === undefined ? existing.is_available : Boolean(is_available),
      ]
    );

    if (Number(existing.current_price) !== nextPrice) {
      await insertPrice(client, serviceId, nextPrice, req.user?.user_id);
    }

    await client.query('COMMIT');
    return res.status(200).json({
      message: 'Servicio actualizado',
      service: await fetchServiceById(serviceId),
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error en updateService:', error);
    return res.status(500).json({ message: 'No se pudo actualizar el servicio' });
  } finally {
    client.release();
  }
};

const deleteService = async (req, res) => {
  const serviceId = parseServiceId(req.params.id);
  if (!serviceId) {
    return res.status(400).json({ message: 'ID de servicio inválido' });
  }

  try {
    const result = await query(
      `
        UPDATE services
        SET is_available = false, updated_at = NOW()
        WHERE service_id = $1
        RETURNING service_id
      `,
      [serviceId]
    );

    if (!result.rowCount) {
      return res.status(404).json({ message: 'Servicio no encontrado' });
    }

    return res.status(200).json({ message: 'Servicio desactivado' });
  } catch (error) {
    console.error('Error en deleteService:', error);
    return res.status(500).json({ message: 'No se pudo desactivar el servicio' });
  }
};

const createSpace = async (req, res) => {
  const { name, space_type, capacity, status, description } = req.body || {};
  if (!name || !space_type) {
    return res.status(400).json({ message: 'name y space_type son obligatorios' });
  }

  const type = String(space_type).toUpperCase();
  if (!SPACE_TYPES.includes(type)) {
    return res.status(400).json({ message: `space_type debe ser uno de: ${SPACE_TYPES.join(', ')}` });
  }

  const nextStatus = String(status || 'AVAILABLE').toUpperCase();
  if (!SPACE_STATUSES.includes(nextStatus)) {
    return res.status(400).json({ message: `status debe ser uno de: ${SPACE_STATUSES.join(', ')}` });
  }

  const nextCapacity = Number(capacity || 1);
  if (!Number.isInteger(nextCapacity) || nextCapacity < 1) {
    return res.status(400).json({ message: 'capacity debe ser un entero positivo' });
  }

  try {
    const result = await query(
      `
        INSERT INTO spaces (name, space_type, capacity, status, description)
        VALUES ($1, $2::pet_resort.space_type, $3, $4::pet_resort.space_status, $5)
        RETURNING *
      `,
      [name.trim(), type, nextCapacity, nextStatus, description || null]
    );

    return res.status(201).json({ message: 'Espacio creado', space: result.rows[0] });
  } catch (error) {
    console.error('Error en createSpace:', error);
    return res.status(500).json({ message: 'No se pudo crear el espacio' });
  }
};

const updateSpace = async (req, res) => {
  const spaceId = parseServiceId(req.params.id);
  if (!spaceId) {
    return res.status(400).json({ message: 'ID de espacio inválido' });
  }

  const { name, space_type, capacity, status, description } = req.body || {};
  const type = space_type ? String(space_type).toUpperCase() : null;
  if (type && !SPACE_TYPES.includes(type)) {
    return res.status(400).json({ message: `space_type debe ser uno de: ${SPACE_TYPES.join(', ')}` });
  }

  const nextStatus = status ? String(status).toUpperCase() : null;
  if (nextStatus && !SPACE_STATUSES.includes(nextStatus)) {
    return res.status(400).json({ message: `status debe ser uno de: ${SPACE_STATUSES.join(', ')}` });
  }

  try {
    const result = await query(
      `
        UPDATE spaces
        SET
          name = COALESCE($2, name),
          space_type = COALESCE($3::pet_resort.space_type, space_type),
          capacity = COALESCE($4, capacity),
          status = COALESCE($5::pet_resort.space_status, status),
          description = COALESCE($6, description),
          updated_at = NOW()
        WHERE space_id = $1
        RETURNING *
      `,
      [
        spaceId,
        name ? name.trim() : null,
        type,
        capacity === undefined || capacity === '' ? null : Number(capacity),
        nextStatus,
        description === undefined ? null : description,
      ]
    );

    if (!result.rowCount) {
      return res.status(404).json({ message: 'Espacio no encontrado' });
    }

    return res.status(200).json({ message: 'Espacio actualizado', space: result.rows[0] });
  } catch (error) {
    console.error('Error en updateSpace:', error);
    return res.status(500).json({ message: 'No se pudo actualizar el espacio' });
  }
};

const deleteSpace = async (req, res) => {
  const spaceId = parseServiceId(req.params.id);
  if (!spaceId) {
    return res.status(400).json({ message: 'ID de espacio inválido' });
  }

  try {
    const result = await query(
      `
        UPDATE spaces
        SET status = 'INACTIVE'::pet_resort.space_status, updated_at = NOW()
        WHERE space_id = $1
        RETURNING *
      `,
      [spaceId]
    );
    if (!result.rowCount) {
      return res.status(404).json({ message: 'Espacio no encontrado' });
    }
    return res.status(200).json({ message: 'Espacio desactivado', space: result.rows[0] });
  } catch (error) {
    console.error('Error en deleteSpace:', error);
    return res.status(500).json({ message: 'No se pudo desactivar el espacio' });
  }
};

module.exports = {
  getAllServices,
  getServiceById,
  getAvailableSpaces,
  getBusinessHours,
  getCategories,
  getSpaces,
  createService,
  updateService,
  deleteService,
  createSpace,
  updateSpace,
  deleteSpace,
};
