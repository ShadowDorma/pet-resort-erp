const bcrypt = require('bcryptjs');
const { getClient, query } = require('../config/db');
const { STAFF_POSITIONS, STAFF_ACCESS_ROLES, USER_STATUSES, normalizeRole } = require('../constants/roles');

const SALT_ROUNDS = 10;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const POSITION_NAMES = STAFF_POSITIONS.map((position) => position.name);

const fetchUser = async (userId, executor = query) => {
  const result = await executor(
    `
      SELECT
        u.user_id,
        u.first_name,
        u.last_name,
        u.email,
        u.phone,
        u.address,
        u.emergency_contact,
        u.status,
        u.job_title,
        u.created_at,
        u.updated_at,
        COALESCE(
          array_agg(r.name ORDER BY r.name) FILTER (WHERE r.name IS NOT NULL),
          '{}'
        ) AS roles
      FROM users u
      LEFT JOIN user_roles ur ON ur.user_id = u.user_id
      LEFT JOIN roles r ON r.role_id = ur.role_id AND r.is_active = true
      WHERE u.user_id = $1
      GROUP BY u.user_id
    `,
    [userId]
  );
  return result.rows[0] || null;
};

const resolvePosition = (value) => {
  if (!value) {
    return null;
  }
  const normalized = normalizeRole(value);
  return POSITION_NAMES.includes(normalized) ? normalized : null;
};

const positionLabel = (name) => {
  const found = STAFF_POSITIONS.find((position) => position.name === name);
  return found ? found.description : name;
};

const getRoleId = async (client, roleName) => {
  const result = await client.query(
    `
      INSERT INTO roles (name, description, is_active)
      VALUES ($1, $2, true)
      ON CONFLICT (name)
      DO UPDATE SET is_active = true
      RETURNING role_id
    `,
    [roleName, positionLabel(roleName)]
  );
  return result.rows[0].role_id;
};

const replaceStaffRoles = async (client, userId, positionName) => {
  const positionRoleId = await getRoleId(client, positionName);

  await client.query(
    `
      DELETE FROM user_roles
      WHERE user_id = $1
        AND role_id IN (
          SELECT role_id FROM roles
          WHERE UPPER(name) = ANY($2::text[])
        )
    `,
    [userId, POSITION_NAMES.concat(['STAFF', 'RECEPTIONIST', 'CAREGIVER', 'GROOMER'])]
  );

  await client.query(
    `
      INSERT INTO user_roles (user_id, role_id)
      VALUES ($1, $2)
      ON CONFLICT (user_id, role_id) DO NOTHING
    `,
    [userId, positionRoleId]
  );
};

const createUser = async (req, res) => {
  const {
    first_name,
    last_name,
    email,
    phone,
    password,
    status,
    staff_role,
    job_title,
    role,
  } = req.body || {};

  if (!first_name || !last_name || !email || !password) {
    return res.status(400).json({
      message: 'first_name, last_name, email y password son obligatorios',
    });
  }

  if (!EMAIL_REGEX.test(String(email).trim())) {
    return res.status(400).json({ message: 'El correo electrónico no es válido' });
  }

  if (String(password).length < 8) {
    return res.status(400).json({
      message: 'La contraseña debe tener al menos 8 caracteres',
    });
  }

  const normalizedRole = normalizeRole(role || '');
  const position = resolvePosition(staff_role || role) || (normalizedRole === 'CLIENT' ? null : 'RECEPCIONIST');
  const requestedRole = normalizedRole === 'CLIENT' ? 'CLIENT' : position;

  const nextStatus = String(status || 'ACTIVE').toUpperCase();
  if (!USER_STATUSES.includes(nextStatus)) {
    return res.status(400).json({ message: `status debe ser uno de: ${USER_STATUSES.join(', ')}` });
  }

  const client = await getClient();

  try {
    await client.query('BEGIN');
    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
    const title = requestedRole !== 'CLIENT'
      ? (job_title || positionLabel(position))
      : null;

    const inserted = await client.query(
      `
        INSERT INTO users (
          first_name,
          last_name,
          email,
          phone,
          password_hash,
          status,
          job_title,
          terms_accepted_at
        )
        VALUES ($1, $2, $3, $4, $5, $6::pet_resort.user_status, $7, NOW())
        RETURNING user_id
      `,
      [
        first_name.trim(),
        last_name.trim(),
        String(email).trim().toLowerCase(),
        phone || null,
        passwordHash,
        nextStatus,
        title,
      ]
    );

    const userId = inserted.rows[0].user_id;

    if (requestedRole !== 'CLIENT' && position) {
      await replaceStaffRoles(client, userId, position);
    } else {
      const clientRoleId = await getRoleId(client, 'CLIENT');
      await client.query(
        `INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2)`,
        [userId, clientRoleId]
      );
    }

    const user = await fetchUser(userId, client.query.bind(client));
    await client.query('COMMIT');

    return res.status(201).json({
      message: 'Usuario creado correctamente',
      user,
    });
  } catch (error) {
    await client.query('ROLLBACK');
    if (error.code === '23505') {
      return res.status(409).json({ message: 'Ya existe un usuario con ese correo electrónico' });
    }
    console.error('Error en createUser:', error);
    return res.status(500).json({ message: 'No se pudo crear el usuario' });
  } finally {
    client.release();
  }
};

const updateUser = async (req, res) => {
  const userId = String(req.params.id || '');
  if (!/^\d+$/.test(userId)) {
    return res.status(400).json({ message: 'ID de usuario inválido' });
  }

  const {
    first_name,
    last_name,
    email,
    phone,
    status,
    staff_role,
    job_title,
  } = req.body || {};

  const client = await getClient();

  try {
    await client.query('BEGIN');
    const current = await fetchUser(userId, client.query.bind(client));
    if (!current) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Usuario no encontrado' });
    }

    const nextStatus = status ? String(status).toUpperCase() : current.status;
    if (!USER_STATUSES.includes(nextStatus)) {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: `status debe ser uno de: ${USER_STATUSES.join(', ')}` });
    }

    if (email && !EMAIL_REGEX.test(String(email).trim())) {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: 'El correo electrónico no es válido' });
    }

    const position = staff_role ? resolvePosition(staff_role) : null;
    if (staff_role && !position) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        message: `staff_role debe ser uno de: ${POSITION_NAMES.join(', ')}`,
      });
    }

    const isStaff = (current.roles || []).some((role) => STAFF_ACCESS_ROLES.includes(String(role).toUpperCase()));
    const title = job_title !== undefined
      ? job_title
      : (position ? positionLabel(position) : current.job_title);

    await client.query(
      `
        UPDATE users
        SET
          first_name = COALESCE($2, first_name),
          last_name = COALESCE($3, last_name),
          email = COALESCE($4, email),
          phone = $5,
          status = $6::pet_resort.user_status,
          job_title = $7,
          updated_at = NOW()
        WHERE user_id = $1
      `,
      [
        userId,
        first_name ? first_name.trim() : null,
        last_name ? last_name.trim() : null,
        email ? String(email).trim().toLowerCase() : null,
        phone === undefined ? current.phone : (phone || null),
        nextStatus,
        title,
      ]
    );

    if (position && isStaff) {
      await replaceStaffRoles(client, userId, position);
    }

    const user = await fetchUser(userId, client.query.bind(client));
    await client.query('COMMIT');

    return res.status(200).json({
      message: 'Usuario actualizado',
      user,
    });
  } catch (error) {
    await client.query('ROLLBACK');
    if (error.code === '23505') {
      return res.status(409).json({ message: 'Ya existe un usuario con ese correo electrónico' });
    }
    console.error('Error en updateUser:', error);
    return res.status(500).json({ message: 'No se pudo actualizar el usuario' });
  } finally {
    client.release();
  }
};

const deactivateUser = async (req, res) => {
  const userId = String(req.params.id || '');
  if (!/^\d+$/.test(userId)) {
    return res.status(400).json({ message: 'ID de usuario inválido' });
  }

  try {
    const result = await query(
      `
        UPDATE users
        SET status = 'INACTIVE'::pet_resort.user_status, updated_at = NOW()
        WHERE user_id = $1
        RETURNING user_id, first_name, last_name, email, status
      `,
      [userId]
    );
    if (!result.rowCount) {
      return res.status(404).json({ message: 'Usuario no encontrado' });
    }
    return res.status(200).json({ message: 'Usuario desactivado', user: result.rows[0] });
  } catch (error) {
    console.error('Error en deactivateUser:', error);
    return res.status(500).json({ message: 'No se pudo desactivar el usuario' });
  }
};

const splitFullName = (fullName, fallbackFirst, fallbackLast) => {
  const trimmed = String(fullName || '').trim();
  if (!trimmed) {
    return { first_name: fallbackFirst, last_name: fallbackLast };
  }
  const parts = trimmed.split(/\s+/);
  if (parts.length === 1) {
    return { first_name: parts[0], last_name: fallbackLast || parts[0] };
  }
  return {
    first_name: parts[0],
    last_name: parts.slice(1).join(' '),
  };
};

const getOwnProfile = async (req, res) => {
  try {
    const user = await fetchUser(req.user.user_id);
    if (!user) {
      return res.status(404).json({ message: 'Usuario no encontrado' });
    }

    const roles = (user.roles || []).map((role) => String(role).toUpperCase());
    const isClient = roles.includes('CLIENT') && !roles.some((role) => STAFF_ACCESS_ROLES.includes(role));
    let pets = [];
    if (isClient || roles.includes('CLIENT')) {
      const petsResult = await query(
        `
          SELECT pet_id, name, species, breed, photo_url, age_years, weight_kg, is_active
          FROM pets
          WHERE owner_id = $1 AND is_active = true
          ORDER BY created_at DESC
        `,
        [user.user_id]
      );
      pets = petsResult.rows;
    }

    return res.status(200).json({ user, pets });
  } catch (error) {
    console.error('Error en getOwnProfile:', error);
    return res.status(500).json({ message: 'No se pudo obtener el perfil' });
  }
};

const updateOwnProfile = async (req, res) => {
  const {
    first_name,
    last_name,
    full_name,
    phone,
    email,
    address,
    emergency_contact,
  } = req.body || {};

  try {
    const current = await fetchUser(req.user.user_id);
    if (!current) {
      return res.status(404).json({ message: 'Usuario no encontrado' });
    }

    const names = splitFullName(full_name, first_name || current.first_name, last_name || current.last_name);
    const nextEmail = email ? String(email).trim().toLowerCase() : current.email;
    if (!EMAIL_REGEX.test(nextEmail)) {
      return res.status(400).json({ message: 'El correo electrónico no es válido' });
    }

    await query(
      `
        UPDATE users
        SET
          first_name = $2,
          last_name = $3,
          email = $4,
          phone = $5,
          address = $6,
          emergency_contact = $7,
          updated_at = NOW()
        WHERE user_id = $1
      `,
      [
        req.user.user_id,
        names.first_name,
        names.last_name,
        nextEmail,
        phone === undefined ? current.phone : (phone || null),
        address === undefined ? current.address : (address || null),
        emergency_contact === undefined ? current.emergency_contact : (emergency_contact || null),
      ]
    );

    const user = await fetchUser(req.user.user_id);
    return res.status(200).json({ message: 'Perfil actualizado', user });
  } catch (error) {
    if (error.code === '23505') {
      return res.status(409).json({ message: 'Ya existe un usuario con ese correo electrónico' });
    }
    console.error('Error en updateOwnProfile:', error);
    return res.status(500).json({ message: 'No se pudo actualizar el perfil' });
  }
};

const changePassword = async (req, res) => {
  const { current_password, new_password, confirm_password } = req.body || {};

  if (!current_password || !new_password || !confirm_password) {
    return res.status(400).json({
      message: 'Debes enviar contraseña actual, nueva contraseña y confirmación',
    });
  }
  if (String(new_password).length < 8) {
    return res.status(400).json({ message: 'La nueva contraseña debe tener al menos 8 caracteres' });
  }
  if (String(new_password) !== String(confirm_password)) {
    return res.status(400).json({ message: 'La confirmación no coincide con la nueva contraseña' });
  }

  try {
    const result = await query(
      `SELECT user_id, password_hash FROM users WHERE user_id = $1`,
      [req.user.user_id]
    );
    if (!result.rowCount) {
      return res.status(404).json({ message: 'Usuario no encontrado' });
    }

    const matches = await bcrypt.compare(String(current_password), result.rows[0].password_hash);
    if (!matches) {
      return res.status(401).json({ message: 'La contraseña actual no es correcta' });
    }

    const nextHash = await bcrypt.hash(String(new_password), SALT_ROUNDS);
    await query(
      `UPDATE users SET password_hash = $2, updated_at = NOW() WHERE user_id = $1`,
      [req.user.user_id, nextHash]
    );

    return res.status(200).json({ message: 'Contraseña actualizada correctamente' });
  } catch (error) {
    console.error('Error en changePassword:', error);
    return res.status(500).json({ message: 'No se pudo cambiar la contraseña' });
  }
};

module.exports = {
  createUser,
  updateUser,
  deactivateUser,
  fetchUser,
  getOwnProfile,
  updateOwnProfile,
  changePassword,
};
