const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { getClient, query } = require('../config/db');

const SALT_ROUNDS = 10;
const TOKEN_EXPIRES_IN = '8h';
const DEFAULT_ROLE = 'CLIENT';
const LOGIN_LOCK_MS = 2 * 60 * 1000;
const LOGIN_MAX_ATTEMPTS = 5;
const LOGIN_LOCK_MESSAGE =
  'Demasiados intentos fallidos. Por razones de seguridad, el inicio de sesión se ha bloqueado temporalmente';
const loginAttempts = new Map();

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const publicUserFields = `
  u.user_id,
  u.first_name,
  u.last_name,
  u.email,
  u.phone,
  u.address,
  u.emergency_contact,
  u.status,
  u.job_title,
  u.terms_accepted_at,
  u.last_login_at,
  u.created_at,
  u.updated_at
`;

const getUserWithRoles = async (userId, executor = query) => {
  const result = await executor(
    `
      SELECT
        ${publicUserFields},
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

const signToken = (user) => {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET no está configurado');
  }

  return jwt.sign(
    {
      user_id: user.user_id,
      email: user.email,
      roles: user.roles || [],
    },
    secret,
    { expiresIn: TOKEN_EXPIRES_IN }
  );
};

const ensureDefaultRole = async (client) => {
  const existing = await client.query(
    `
      SELECT role_id, name
      FROM roles
      WHERE UPPER(name) = UPPER($1)
        AND is_active = true
      LIMIT 1
    `,
    [DEFAULT_ROLE]
  );

  if (existing.rowCount > 0) {
    return existing.rows[0];
  }

  const created = await client.query(
    `
      INSERT INTO roles (name, description)
      VALUES ($1, $2)
      RETURNING role_id, name
    `,
    [DEFAULT_ROLE, 'Cliente de Pet Resort']
  );

  return created.rows[0];
};

const register = async (req, res) => {
  const {
    first_name,
    last_name,
    email,
    password,
    phone,
    terms_accepted,
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

  const client = await getClient();

  try {
    await client.query('BEGIN');

    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
    const termsAcceptedAt = terms_accepted ? new Date() : null;
    const status = terms_accepted ? 'ACTIVE' : 'PENDING';

    const insertedUser = await client.query(
      `
        INSERT INTO users (
          first_name,
          last_name,
          email,
          phone,
          password_hash,
          status,
          terms_accepted_at
        )
        VALUES ($1, $2, $3, $4, $5, $6::pet_resort.user_status, $7)
        RETURNING user_id
      `,
      [
        first_name.trim(),
        last_name.trim(),
        String(email).trim().toLowerCase(),
        phone || null,
        passwordHash,
        status,
        termsAcceptedAt,
      ]
    );

    const userId = insertedUser.rows[0].user_id;
    const role = await ensureDefaultRole(client);

    await client.query(
      `
        INSERT INTO user_roles (user_id, role_id)
        VALUES ($1, $2)
      `,
      [userId, role.role_id]
    );

    const user = await getUserWithRoles(userId, client.query.bind(client));
    await client.query('COMMIT');

    return res.status(201).json({
      message: 'Usuario registrado correctamente',
      user,
    });
  } catch (error) {
    await client.query('ROLLBACK');

    if (error.code === '23505') {
      return res.status(409).json({
        message: 'Ya existe un usuario con ese correo electrónico',
      });
    }

    console.error('Error en register:', error);
    return res.status(500).json({ message: 'No se pudo registrar el usuario' });
  } finally {
    client.release();
  }
};

const loginKey = (req, email) => {
  const ip = String(req.ip || req.headers['x-forwarded-for'] || 'local')
    .split(',')[0]
    .trim();
  const normalizedEmail = String(email || '').trim().toLowerCase();
  return `${ip}:${normalizedEmail || 'unknown'}`;
};

const getLoginAttempt = (key) => {
  const now = Date.now();
  const current = loginAttempts.get(key) || { count: 0, lockedUntil: 0 };
  if (current.lockedUntil && now >= current.lockedUntil) {
    loginAttempts.delete(key);
    return { count: 0, lockedUntil: 0 };
  }
  return current;
};

const isLoginLocked = (req, email) => {
  const current = getLoginAttempt(loginKey(req, email));
  return current.lockedUntil > Date.now();
};

const registerFailedLogin = (req, email) => {
  const key = loginKey(req, email);
  const current = getLoginAttempt(key);
  current.count += 1;
  if (current.count >= LOGIN_MAX_ATTEMPTS) {
    current.lockedUntil = Date.now() + LOGIN_LOCK_MS;
  }
  loginAttempts.set(key, current);
  return current;
};

const clearLoginAttempts = (req, email) => {
  loginAttempts.delete(loginKey(req, email));
};

const login = async (req, res) => {
  const { email, password } = req.body || {};

  if (!email || !password) {
    return res.status(400).json({
      message: 'email y password son obligatorios',
    });
  }

  if (isLoginLocked(req, email)) {
    return res.status(429).json({ message: LOGIN_LOCK_MESSAGE });
  }

  try {
    const result = await query(
      `
        SELECT
          u.user_id,
          u.email,
          u.password_hash,
          u.status,
          COALESCE(
            array_agg(r.name ORDER BY r.name) FILTER (WHERE r.name IS NOT NULL),
            '{}'
          ) AS roles
        FROM users u
        LEFT JOIN user_roles ur ON ur.user_id = u.user_id
        LEFT JOIN roles r ON r.role_id = ur.role_id AND r.is_active = true
        WHERE u.email = $1
        GROUP BY u.user_id
      `,
      [String(email).trim().toLowerCase()]
    );

    const user = result.rows[0];

    if (!user) {
      const attempt = registerFailedLogin(req, email);
      if (attempt.lockedUntil > Date.now()) {
        return res.status(429).json({ message: LOGIN_LOCK_MESSAGE });
      }
      return res.status(401).json({ message: 'Credenciales inválidas' });
    }

    const passwordMatch = await bcrypt.compare(password, user.password_hash);
    if (!passwordMatch) {
      const attempt = registerFailedLogin(req, email);
      if (attempt.lockedUntil > Date.now()) {
        return res.status(429).json({ message: LOGIN_LOCK_MESSAGE });
      }
      return res.status(401).json({ message: 'Credenciales inválidas' });
    }

    if (user.status === 'BLOCKED' || user.status === 'INACTIVE' || user.status === 'PENDING') {
      return res.status(403).json({
        message: 'La cuenta no está habilitada para iniciar sesión',
        status: user.status,
      });
    }

    clearLoginAttempts(req, email);

    await query(
      `
        UPDATE users
        SET last_login_at = NOW(), updated_at = NOW()
        WHERE user_id = $1
      `,
      [user.user_id]
    );

    const profile = await getUserWithRoles(user.user_id);
    const token = signToken(profile);

    return res.status(200).json({
      message: 'Inicio de sesión correcto',
      token,
      user: profile,
    });
  } catch (error) {
    console.error('Error en login:', error);
    return res.status(500).json({ message: 'No se pudo iniciar sesión' });
  }
};

const getProfile = async (req, res) => {
  try {
    const user = await getUserWithRoles(req.user.user_id);

    if (!user) {
      return res.status(404).json({ message: 'Usuario no encontrado' });
    }

    return res.status(200).json({ user });
  } catch (error) {
    console.error('Error en getProfile:', error);
    return res.status(500).json({
      message: 'No se pudo obtener el perfil del usuario',
    });
  }
};

module.exports = {
  register,
  login,
  getProfile,
};
