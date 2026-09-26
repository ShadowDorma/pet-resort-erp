const OPERATIONAL_ROLES = ['CLIENT', 'RECEPCIONIST', 'CARETAKER', 'STYLIST', 'ADMIN'];

const STAFF_POSITIONS = [
  { name: 'RECEPCIONIST', description: 'Recepcionista' },
  { name: 'CARETAKER', description: 'Cuidador' },
  { name: 'STYLIST', description: 'Estilista / Groomer' },
];

const ROLE_ALIASES = {
  STAFF: 'RECEPCIONIST',
  RECEPTIONIST: 'RECEPCIONIST',
  RECEPCIONISTA: 'RECEPCIONIST',
  CAREGIVER: 'CARETAKER',
  GROOMER: 'STYLIST',
  PELUQUERO: 'STYLIST',
};

const STAFF_ACCESS_ROLES = [
  'ADMIN',
  'RECEPCIONIST',
  'CARETAKER',
  'STYLIST',
  'STAFF',
  'RECEPTIONIST',
  'RECEPCIONISTA',
  'CAREGIVER',
  'GROOMER',
];

const RECEPTION_ROLES = ['ADMIN', 'RECEPCIONIST', 'RECEPTIONIST', 'RECEPCIONISTA'];
const CARETAKER_ROLES = ['ADMIN', 'CARETAKER', 'CAREGIVER'];
const STYLIST_ROLES = ['ADMIN', 'STYLIST', 'GROOMER', 'PELUQUERO'];

const USER_STATUSES = ['ACTIVE', 'INACTIVE', 'BLOCKED', 'PENDING'];

const normalizeRole = (role) => {
  const upper = String(role || '').toUpperCase();
  return ROLE_ALIASES[upper] || upper;
};

module.exports = {
  OPERATIONAL_ROLES,
  STAFF_POSITIONS,
  STAFF_ACCESS_ROLES,
  RECEPTION_ROLES,
  CARETAKER_ROLES,
  STYLIST_ROLES,
  USER_STATUSES,
  ROLE_ALIASES,
  normalizeRole,
};
