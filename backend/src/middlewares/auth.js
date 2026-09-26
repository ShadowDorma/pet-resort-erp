const jwt = require('jsonwebtoken');
const { normalizeRole } = require('../constants/roles');

const extractBearerToken = (headerValue) => {
  if (!headerValue || typeof headerValue !== 'string') {
    return null;
  }

  const [scheme, token] = headerValue.split(' ');
  if (!scheme || !token || scheme.toLowerCase() !== 'bearer') {
    return null;
  }

  return token;
};

const authenticate = (req, res, next) => {
  try {
    const token = extractBearerToken(req.headers.authorization);

    if (!token) {
      return res.status(401).json({
        message: 'Token de autenticación no proporcionado',
      });
    }

    const secret = process.env.JWT_SECRET;
    if (!secret) {
      return res.status(500).json({
        message: 'JWT_SECRET no está configurado',
      });
    }

    const payload = jwt.verify(token, secret);
    const rawRoles = payload.roles;
    const roles = Array.isArray(rawRoles)
      ? rawRoles
      : String(rawRoles || '')
          .replace(/[{}]/g, '')
          .split(/[,\s]+/)
          .map((role) => role.trim())
          .filter(Boolean);

    req.user = {
      user_id: payload.user_id,
      email: payload.email,
      roles,
    };

    return next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ message: 'El token ha expirado' });
    }

    return res.status(401).json({ message: 'Token inválido' });
  }
};

const authorizeRoles = (...allowedRoles) => (req, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Usuario no autenticado' });
    }

    const userRoles = (req.user.roles || []).map((role) => normalizeRole(role));
    const permitted = allowedRoles.map((role) => normalizeRole(role));
    const hasRole =
      userRoles.includes('ADMIN') || permitted.some((role) => userRoles.includes(role));

    if (!hasRole) {
      return res.status(403).json({
        message: 'No tienes permisos para acceder a este recurso',
      });
    }

    return next();
  } catch (error) {
    return res.status(500).json({
      message: 'Error al verificar el rol del usuario',
    });
  }
};

const authMiddleware = authenticate;
const requireRole = authorizeRoles;
const isAdmin = authorizeRoles('ADMIN');
const isClient = authorizeRoles('CLIENT');
const isStaff = authorizeRoles('RECEPCIONIST', 'CARETAKER', 'STYLIST', 'ADMIN');

module.exports = {
  authenticate,
  authorizeRoles,
  authMiddleware,
  requireRole,
  isAdmin,
  isClient,
  isStaff,
};
