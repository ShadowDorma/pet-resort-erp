const { getClient, query, pool } = require('../config/db');
const { STAFF_ACCESS_ROLES } = require('../constants/roles');
const { notifyBookingEvent } = require('../services/notificationService');

const STAFF_ROLES = STAFF_ACCESS_ROLES;
const BOOKING_TYPES = ['LODGING', 'APPOINTMENT', 'RECREATION'];
const BOOKING_STATUSES = [
  'PENDING',
  'CONFIRMED',
  'CHECKED_IN',
  'IN_HOUSE',
  'IN_PROGRESS',
  'COMPLETED',
  'CANCELLED',
  'NO_SHOW',
];
const IN_HOUSE_STATUSES = ['IN_HOUSE', 'CHECKED_IN', 'IN_PROGRESS'];
const CHECK_IN_ALLOWED = ['PENDING', 'CONFIRMED'];
const NON_CANCELLABLE = ['COMPLETED', 'CANCELLED', 'NO_SHOW'];
const CAPACITY_STATUSES = ['PENDING', 'CONFIRMED', 'CHECKED_IN', 'IN_HOUSE', 'IN_PROGRESS'];
const LODGING_CAP_PER_SPECIES = 5;
const SPA_CAP_PER_STYLIST = 1;
const RECREATION_CAP_PER_SLOT = 3;

class HttpError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.statusCode = statusCode;
  }
}

const hasStaffAccess = (user) => {
  const roles = (user?.roles || []).map((role) => String(role).toUpperCase());
  return roles.some((role) => STAFF_ROLES.includes(role));
};

const parseId = (value) => {
  if (value === undefined || value === null || value === '') {
    return null;
  }
  if (!/^\d+$/.test(String(value))) {
    return undefined;
  }
  return String(value);
};

const resolveBookingType = (explicitType, categoryType) => {
  if (explicitType) {
    const normalized = String(explicitType).toUpperCase();
    return BOOKING_TYPES.includes(normalized) ? normalized : null;
  }

  if (categoryType === 'HOTEL') {
    return 'LODGING';
  }
  if (categoryType === 'RECREATION') {
    return 'RECREATION';
  }
  return 'APPOINTMENT';
};

const nightsBetween = (startAt, endAt) => {
  const ms = new Date(endAt).getTime() - new Date(startAt).getTime();
  return Math.max(1, Math.ceil(ms / (1000 * 60 * 60 * 24)));
};

const isCatSpecies = (species) => {
  const value = String(species || '').toLowerCase();
  return value.includes('gato') || value.includes('cat') || value.includes('felin');
};

const normalizeSpecies = (species) => (isCatSpecies(species) ? 'Gato' : 'Perro');

const lodgingSuiteType = (species) => (isCatSpecies(species) ? 'CAT_SUITE' : 'DOG_SUITE');

const pickDefaultStaffId = async (executor, bookingType) => {
  const roleName = String(bookingType).toUpperCase() === 'APPOINTMENT' ? 'STYLIST' : 'CARETAKER';
  const result = await executor(
    `
      SELECT u.user_id
      FROM users u
      JOIN user_roles ur ON ur.user_id = u.user_id
      JOIN roles r ON r.role_id = ur.role_id AND r.is_active = true
      WHERE UPPER(r.name) = $1
        AND u.status = 'ACTIVE'::pet_resort.user_status
      ORDER BY
        CASE WHEN LOWER(u.email) IN ('lucia@petresort.com', 'carlos@petresort.com') THEN 0 ELSE 1 END,
        u.user_id
      LIMIT 1
    `,
    [roleName]
  );
  return result.rows[0]?.user_id || null;
};

const overlappingFilter = `
  tstzrange(b.start_at, b.end_at, '[)') && tstzrange($1::timestamptz, $2::timestamptz, '[)')
  AND b.status::text = ANY($3::text[])
  AND ($4::bigint IS NULL OR b.booking_id <> $4)
`;

const ACTIVE_TIME_STATUSES = CAPACITY_STATUSES;
const BUSINESS_TZ = 'America/Bogota';

const assertWithinBusinessHours = async (executor, startAt, endAt) => {
  const window = await executor(
    `
      SELECT
        EXTRACT(DOW FROM $1::timestamptz AT TIME ZONE $3)::int AS dow,
        ($1::timestamptz AT TIME ZONE $3)::date = ($2::timestamptz AT TIME ZONE $3)::date AS same_day,
        ($1::timestamptz AT TIME ZONE $3)::time AS start_local,
        ($2::timestamptz AT TIME ZONE $3)::time AS end_local
    `,
    [startAt, endAt, BUSINESS_TZ]
  );
  const slot = window.rows[0];
  if (!slot) {
    throw new HttpError(400, 'No se pudo validar el horario de atención');
  }
  if (!slot.same_day) {
    throw new HttpError(400, 'La cita debe iniciar y terminar el mismo día de atención');
  }

  const hours = await executor(
    `
      SELECT opens_at, closes_at, is_closed
      FROM business_hours
      WHERE day_of_week = $1
      LIMIT 1
    `,
    [slot.dow]
  );
  const day = hours.rows[0];
  if (!day || day.is_closed) {
    throw new HttpError(400, 'El resort no atiende ese día');
  }
  if (slot.start_local < day.opens_at || slot.end_local > day.closes_at) {
    throw new HttpError(
      400,
      `El horario debe estar entre ${String(day.opens_at).slice(0, 5)} y ${String(day.closes_at).slice(0, 5)}`
    );
  }
};

const assertPetTimeAvailable = async (executor, { petId, startAt, endAt, excludeBookingId = null }) => {
  const result = await executor(
    `
      SELECT booking_id
      FROM bookings b
      WHERE b.pet_id = $5
        AND ${overlappingFilter}
      LIMIT 1
    `,
    [startAt, endAt, ACTIVE_TIME_STATUSES, excludeBookingId, petId]
  );
  if (result.rowCount) {
    throw new HttpError(409, 'Esta mascota ya tiene otra reserva que se cruza con ese horario');
  }
};

const assertExclusiveSpaceTimeAvailable = async (executor, { spaceId, startAt, endAt, excludeBookingId = null }) => {
  if (!spaceId) {
    return;
  }
  const space = await executor(
    `
      SELECT space_id, name, capacity
      FROM spaces
      WHERE space_id = $1
    `,
    [spaceId]
  );
  const row = space.rows[0];
  if (!row || Number(row.capacity) > 1) {
    return;
  }
  const used = await countOccupiedOnSpace(executor, {
    spaceId,
    startAt,
    endAt,
    excludeBookingId,
  });
  if (used > 0) {
    throw new HttpError(409, `${row.name || 'Ese espacio'} ya está ocupado en ese horario`);
  }
};

const countLodgingBySpecies = async (executor, { startAt, endAt, species, excludeBookingId = null }) => {
  const wantCat = isCatSpecies(species);
  const result = await executor(
    `
      SELECT COUNT(*)::int AS used
      FROM bookings b
      JOIN pets p ON p.pet_id = b.pet_id
      WHERE b.booking_type = 'LODGING'
        AND ${overlappingFilter}
        AND (
          ($5::boolean AND (LOWER(p.species) LIKE '%gato%' OR LOWER(p.species) LIKE '%cat%' OR LOWER(p.species) LIKE '%felin%'))
          OR (
            NOT $5::boolean
            AND NOT (LOWER(p.species) LIKE '%gato%' OR LOWER(p.species) LIKE '%cat%' OR LOWER(p.species) LIKE '%felin%')
          )
        )
    `,
    [startAt, endAt, CAPACITY_STATUSES, excludeBookingId, wantCat]
  );
  return result.rows[0].used;
};

const countOccupiedOnSpace = async (executor, { spaceId, startAt, endAt, excludeBookingId = null }) => {
  if (!spaceId) {
    return 0;
  }
  const result = await executor(
    `
      SELECT COUNT(*)::int AS used
      FROM space_occupancy o
      WHERE o.space_id = $1
        AND o.is_active = true
        AND tstzrange(o.start_at, o.end_at, '[)') && tstzrange($2::timestamptz, $3::timestamptz, '[)')
        AND ($4::bigint IS NULL OR o.booking_id <> $4)
    `,
    [spaceId, startAt, endAt, excludeBookingId]
  );
  return result.rows[0].used;
};

const loadPatioForSpecies = async (executor, species) => {
  const patioName = isCatSpecies(species) ? 'Patio Felino 01' : 'Patio Canino 01';
  const result = await executor(
    `
      SELECT space_id, capacity, name, space_type
      FROM spaces
      WHERE status = 'AVAILABLE'
        AND name = $1
      LIMIT 1
    `,
    [patioName]
  );
  return result.rows[0] || null;
};

const lockCapacityKey = async (executor, key) => {
  await executor('SELECT pg_advisory_xact_lock(hashtext($1))', [String(key)]);
};

const insertSpaceOccupancy = async (executor, { spaceId, bookingId, startAt, endAt }) => {
  const inserted = await executor(
    `
      INSERT INTO space_occupancy (space_id, booking_id, start_at, end_at, is_active, exclusive_slot)
      SELECT $1, $2, $3, $4, true, (s.capacity <= 1)
      FROM spaces s
      WHERE s.space_id = $1
      RETURNING occupancy_id
    `,
    [spaceId, bookingId, startAt, endAt]
  );
  if (!inserted.rowCount) {
    throw new HttpError(404, 'Espacio no encontrado');
  }
};

const countSpaForStylist = async (executor, { startAt, endAt, stylistId, excludeBookingId = null }) => {
  const result = await executor(
    `
      SELECT COUNT(*)::int AS used
      FROM bookings b
      LEFT JOIN appointments a ON a.booking_id = b.booking_id
      WHERE b.booking_type = 'APPOINTMENT'
        AND ${overlappingFilter}
        AND (
          a.stylist_id = $5
          OR b.assigned_staff_id = $5
        )
    `,
    [startAt, endAt, CAPACITY_STATUSES, excludeBookingId, stylistId]
  );
  return result.rows[0].used;
};

const countBusyStylists = async (executor, { startAt, endAt, excludeBookingId = null }) => {
  const result = await executor(
    `
      SELECT COUNT(DISTINCT COALESCE(a.stylist_id, b.assigned_staff_id))::int AS used
      FROM bookings b
      LEFT JOIN appointments a ON a.booking_id = b.booking_id
      WHERE b.booking_type = 'APPOINTMENT'
        AND ${overlappingFilter}
        AND COALESCE(a.stylist_id, b.assigned_staff_id) IS NOT NULL
    `,
    [startAt, endAt, CAPACITY_STATUSES, excludeBookingId]
  );
  return result.rows[0].used;
};

const countActiveStylists = async (executor) => {
  const result = await executor(
    `
      SELECT COUNT(DISTINCT u.user_id)::int AS total
      FROM users u
      JOIN user_roles ur ON ur.user_id = u.user_id
      JOIN roles r ON r.role_id = ur.role_id AND r.is_active = true
      WHERE u.status = 'ACTIVE'
        AND UPPER(r.name) IN ('STYLIST', 'GROOMER', 'PELUQUERO')
    `
  );
  return Math.max(result.rows[0].total, 1);
};

const assertLodgingCapacity = async (executor, params) => {
  const used = await countLodgingBySpecies(executor, params);
  if (used >= LODGING_CAP_PER_SPECIES) {
    throw new HttpError(409, 'Capacidad máxima de hospedaje alcanzada para esta especie');
  }
};

const assertRecreationCapacity = async (executor, params) => {
  const patio = params.spaceId
    ? (
        await executor(
          `SELECT space_id, capacity, name FROM spaces WHERE space_id = $1`,
          [params.spaceId]
        )
      ).rows[0]
    : await loadPatioForSpecies(executor, params.species);
  if (!patio) {
    throw new HttpError(409, 'No hay patio de recreación disponible para esta especie');
  }
  const used = await countOccupiedOnSpace(executor, {
    spaceId: patio.space_id,
    startAt: params.startAt,
    endAt: params.endAt,
    excludeBookingId: params.excludeBookingId,
  });
  const limit = Number(patio.capacity) || RECREATION_CAP_PER_SLOT;
  if (used >= limit) {
    throw new HttpError(409, `Cupo lleno en ${patio.name || 'el patio'} (máximo ${limit} mascotas)`);
  }
  return patio;
};

const assertSpaCapacity = async (executor, params) => {
  if (params.stylistId) {
    const used = await countSpaForStylist(executor, params);
    if (used >= SPA_CAP_PER_STYLIST) {
      throw new HttpError(409, 'El estilista ya tiene una mascota en este bloque horario');
    }
    return;
  }

  const [busy, stylists] = await Promise.all([
    countBusyStylists(executor, params),
    countActiveStylists(executor),
  ]);
  if (busy >= stylists) {
    throw new HttpError(409, 'No hay cupo de estética en este horario (máximo 1 mascota por estilista)');
  }
};

const pickLodgingSpace = async (executor, { species, startAt, endAt, preferredSpaceId }) => {
  const suiteType = lodgingSuiteType(species);
  if (preferredSpaceId) {
    const space = await executor(
      `
        SELECT space_id, space_type, status, name
        FROM spaces
        WHERE space_id = $1
      `,
      [preferredSpaceId]
    );
    const row = space.rows[0];
    if (!row) {
      throw new HttpError(404, 'Espacio no encontrado');
    }
    if (row.status !== 'AVAILABLE') {
      throw new HttpError(400, 'El espacio no está disponible');
    }
    const lodgingOk = isCatSpecies(species)
      ? row.space_type === 'CAT_SUITE' || (row.space_type === 'ROOM' && /suite felina/i.test(row.name || ''))
      : row.space_type === 'DOG_SUITE' || (row.space_type === 'ROOM' && /suite canina/i.test(row.name || ''));
    if (!lodgingOk) {
      throw new HttpError(400, `La especie ${normalizeSpecies(species)} debe alojarse en una suite ${isCatSpecies(species) ? 'felina' : 'canina'}`);
    }
    const used = await countOccupiedOnSpace(executor, {
      spaceId: row.space_id,
      startAt,
      endAt,
    });
    if (used > 0) {
      throw new HttpError(409, 'Esa suite ya está ocupada en el horario elegido');
    }
    return row.space_id;
  }

  const suiteNamePattern = isCatSpecies(species) ? 'Suite Felina%' : 'Suite Canina%';
  const available = await executor(
    `
      SELECT s.space_id
      FROM spaces s
      WHERE s.status = 'AVAILABLE'
        AND (
          s.space_type = $3::pet_resort.space_type
          OR (s.space_type = 'ROOM' AND s.name ILIKE $4)
        )
        AND NOT EXISTS (
          SELECT 1
          FROM space_occupancy o
          WHERE o.space_id = s.space_id
            AND o.is_active = true
            AND tstzrange(o.start_at, o.end_at, '[)') && tstzrange($1::timestamptz, $2::timestamptz, '[)')
        )
      ORDER BY s.name
      LIMIT 1
    `,
    [startAt, endAt, suiteType, suiteNamePattern]
  );
  if (!available.rowCount) {
    throw new HttpError(409, 'Capacidad máxima de hospedaje alcanzada para esta especie');
  }
  return available.rows[0].space_id;
};

const buildAvailability = async (executor, { startAt, endAt, stylistId = null, excludeBookingId = null }) => {
  const dogPatio = await loadPatioForSpecies(executor, 'Perro');
  const catPatio = await loadPatioForSpecies(executor, 'Gato');
  const [dogsUsed, catsUsed, dogsRec, catsRec, spaBusy, stylists] = await Promise.all([
    countLodgingBySpecies(executor, { startAt, endAt, species: 'Perro', excludeBookingId }),
    countLodgingBySpecies(executor, { startAt, endAt, species: 'Gato', excludeBookingId }),
    countOccupiedOnSpace(executor, {
      spaceId: dogPatio?.space_id,
      startAt,
      endAt,
      excludeBookingId,
    }),
    countOccupiedOnSpace(executor, {
      spaceId: catPatio?.space_id,
      startAt,
      endAt,
      excludeBookingId,
    }),
    stylistId
      ? countSpaForStylist(executor, { startAt, endAt, stylistId, excludeBookingId })
      : countBusyStylists(executor, { startAt, endAt, excludeBookingId }),
    countActiveStylists(executor),
  ]);

  const dogPatioLimit = Number(dogPatio?.capacity) || RECREATION_CAP_PER_SLOT;
  const catPatioLimit = Number(catPatio?.capacity) || RECREATION_CAP_PER_SLOT;
  const spaLimit = stylistId ? SPA_CAP_PER_STYLIST : stylists;
  const dogsRecAvail = Math.max(0, dogPatioLimit - dogsRec);
  const catsRecAvail = Math.max(0, catPatioLimit - catsRec);
  return {
    lodging: {
      dogs: {
        used: dogsUsed,
        limit: LODGING_CAP_PER_SPECIES,
        available: Math.max(0, LODGING_CAP_PER_SPECIES - dogsUsed),
      },
      cats: {
        used: catsUsed,
        limit: LODGING_CAP_PER_SPECIES,
        available: Math.max(0, LODGING_CAP_PER_SPECIES - catsUsed),
      },
    },
    recreation: {
      used: dogsRec + catsRec,
      limit: dogPatioLimit + catPatioLimit,
      available: dogsRecAvail + catsRecAvail,
      dogs: { used: dogsRec, limit: dogPatioLimit, available: dogsRecAvail },
      cats: { used: catsRec, limit: catPatioLimit, available: catsRecAvail },
    },
    spa: {
      used: spaBusy,
      limit: spaLimit,
      available: Math.max(0, spaLimit - spaBusy),
      stylist_id: stylistId,
    },
  };
};

const ensureBookingSupportTables = async () => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS pet_resort.booking_items (
      booking_item_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      booking_id BIGINT NOT NULL REFERENCES pet_resort.bookings(booking_id) ON DELETE CASCADE,
      service_id BIGINT NOT NULL REFERENCES pet_resort.services(service_id) ON DELETE RESTRICT,
      description VARCHAR(255),
      quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
      unit_price NUMERIC(12, 2) NOT NULL CHECK (unit_price >= 0),
      line_total NUMERIC(12, 2) NOT NULL CHECK (line_total >= 0),
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS pet_resort.space_occupancy (
      occupancy_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      space_id BIGINT NOT NULL REFERENCES pet_resort.spaces(space_id) ON DELETE RESTRICT,
      booking_id BIGINT NOT NULL REFERENCES pet_resort.bookings(booking_id) ON DELETE CASCADE,
      start_at TIMESTAMPTZ NOT NULL,
      end_at TIMESTAMPTZ NOT NULL,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT ck_occupancy_dates CHECK (end_at > start_at)
    )
  `);

  await pool.query(`CREATE EXTENSION IF NOT EXISTS btree_gist`);
  await pool.query(`
    ALTER TABLE pet_resort.space_occupancy
      ADD COLUMN IF NOT EXISTS exclusive_slot BOOLEAN NOT NULL DEFAULT TRUE
  `);
  await pool.query(`
    UPDATE pet_resort.space_occupancy o
    SET exclusive_slot = false
    FROM pet_resort.spaces s
    WHERE o.space_id = s.space_id
      AND s.capacity > 1
  `);
  await pool.query(`ALTER TABLE pet_resort.space_occupancy DROP CONSTRAINT IF EXISTS ex_space_occupancy_overlap`);
  await pool.query(`
    ALTER TABLE pet_resort.space_occupancy
      ADD CONSTRAINT ex_space_occupancy_overlap
      EXCLUDE USING gist (
        space_id WITH =,
        tstzrange(start_at, end_at, '[)') WITH &&
      )
      WHERE (is_active AND exclusive_slot)
  `);

  await pool.query(`ALTER TABLE pet_resort.bookings DROP CONSTRAINT IF EXISTS ex_owner_booking_day`);
  await pool.query(`ALTER TABLE pet_resort.bookings DROP CONSTRAINT IF EXISTS ex_owner_active_booking_overlap`);
  await pool.query(`ALTER TABLE pet_resort.bookings DROP CONSTRAINT IF EXISTS uq_bookings_owner_date`);
  await pool.query(`DROP INDEX IF EXISTS pet_resort.uq_bookings_owner_date`);
  await pool.query(`ALTER TABLE pet_resort.bookings DROP CONSTRAINT IF EXISTS ex_pet_active_booking_overlap`);
  await pool.query(`
    ALTER TABLE pet_resort.bookings
      ADD CONSTRAINT ex_pet_active_booking_overlap
      EXCLUDE USING gist (
        pet_id WITH =,
        tstzrange(start_at, end_at, '[)') WITH &&
      )
      WHERE (
        status = ANY (
          ARRAY[
            'PENDING'::pet_resort.booking_status,
            'CONFIRMED'::pet_resort.booking_status,
            'CHECKED_IN'::pet_resort.booking_status,
            'IN_HOUSE'::pet_resort.booking_status,
            'IN_PROGRESS'::pet_resort.booking_status
          ]
        )
      )
  `);

  await pool.query(`
    ALTER TABLE pet_resort.bookings
      ADD COLUMN IF NOT EXISTS assigned_staff_id BIGINT
      REFERENCES pet_resort.users(user_id) ON DELETE SET NULL
  `);

  await pool.query(`
    ALTER TABLE pet_resort.users
      ADD COLUMN IF NOT EXISTS job_title VARCHAR(80)
  `);

  const inHouseEnum = await pool.query(
    `
      SELECT 1
      FROM pg_enum e
      JOIN pg_type t ON t.oid = e.enumtypid
      JOIN pg_namespace n ON n.oid = t.typnamespace
      WHERE n.nspname = 'pet_resort'
        AND t.typname = 'booking_status'
        AND e.enumlabel = 'IN_HOUSE'
    `
  );
  if (inHouseEnum.rowCount === 0) {
    await pool.query(`ALTER TYPE pet_resort.booking_status ADD VALUE 'IN_HOUSE'`);
  }

  await pool.query(`
    ALTER TABLE pet_resort.bookings
      ADD COLUMN IF NOT EXISTS reception_notes TEXT,
      ADD COLUMN IF NOT EXISTS check_in_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS check_out_at TIMESTAMPTZ
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS pet_resort.care_tasks (
      care_task_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      booking_id BIGINT NOT NULL REFERENCES pet_resort.bookings(booking_id) ON DELETE CASCADE,
      pet_id BIGINT NOT NULL REFERENCES pet_resort.pets(pet_id) ON DELETE CASCADE,
      task_code VARCHAR(40) NOT NULL,
      label VARCHAR(120) NOT NULL,
      is_done BOOLEAN NOT NULL DEFAULT FALSE,
      notes TEXT,
      done_at TIMESTAMPTZ,
      done_by BIGINT REFERENCES pet_resort.users(user_id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (booking_id, task_code)
    )
  `);

  const suites = [
    ...[1, 2, 3, 4, 5].map((index) => [`Suite Canina 0${index}`, 'DOG_SUITE', 'Suite individual de hotel canino', 1]),
    ...[1, 2, 3, 4, 5].map((index) => [`Suite Felina 0${index}`, 'CAT_SUITE', 'Suite individual de hotel felino', 1]),
    ['Patio Canino 01', 'RECREATION', 'Patio de guardería y recreación para perros', 3],
    ['Patio Felino 01', 'RECREATION', 'Patio de guardería y recreación para gatos', 3],
    ['Cabina de Spa & Estética 01', 'SPA', 'Cabina de baño, corte y spa relajante', 1],
  ];
  for (const [name, type, description, capacity] of suites) {
    await pool.query(
      `
        INSERT INTO spaces (name, space_type, capacity, status, description)
        VALUES ($1, $2::pet_resort.space_type, $3, 'AVAILABLE'::pet_resort.space_status, $4)
        ON CONFLICT (name)
        DO UPDATE SET
          space_type = EXCLUDED.space_type,
          capacity = EXCLUDED.capacity,
          status = 'AVAILABLE'::pet_resort.space_status,
          description = EXCLUDED.description
      `,
      [name, type, capacity, description]
    );
  }
  await pool.query(
    `
      UPDATE spaces
      SET status = 'INACTIVE'::pet_resort.space_status, updated_at = NOW()
      WHERE name <> ALL($1::text[])
    `,
    [suites.map((item) => item[0])]
  );
};

const fetchBookingDetail = async (bookingId, executor = query) => {
  const bookingResult = await executor(
    `
      SELECT
        b.booking_id,
        b.owner_id,
        b.pet_id,
        b.booking_type,
        b.start_at,
        b.end_at,
        b.status,
        b.notes,
        b.reception_notes,
        b.check_in_at,
        b.check_out_at,
        b.assigned_staff_id,
        b.created_by,
        b.created_at,
        b.updated_at,
        staff.first_name AS assigned_staff_first_name,
        staff.last_name AS assigned_staff_last_name,
        staff.job_title AS assigned_staff_job_title,
        p.name AS pet_name,
        p.species AS pet_species,
        p.breed AS pet_breed,
        u.first_name AS owner_first_name,
        u.last_name AS owner_last_name,
        u.email AS owner_email,
        COALESCE((
          SELECT SUM(bi.line_total)
          FROM booking_items bi
          WHERE bi.booking_id = b.booking_id
        ), 0) AS total_cost
      FROM bookings b
      JOIN pets p ON p.pet_id = b.pet_id
      JOIN users u ON u.user_id = b.owner_id
      LEFT JOIN users staff ON staff.user_id = b.assigned_staff_id
      WHERE b.booking_id = $1
    `,
    [bookingId]
  );

  const booking = bookingResult.rows[0];
  if (!booking) {
    return null;
  }

  const [items, lodging, appointment, recreation, occupancy] = await Promise.all([
    executor(
      `
        SELECT
          bi.booking_item_id,
          bi.service_id,
          bi.description,
          bi.quantity,
          bi.unit_price,
          bi.line_total,
          s.name AS service_name,
          s.duration_label,
          s.duration_minutes,
          sc.name AS category_name,
          sc.category_type
        FROM booking_items bi
        JOIN services s ON s.service_id = bi.service_id
        LEFT JOIN service_categories sc ON sc.category_id = s.category_id
        WHERE bi.booking_id = $1
        ORDER BY bi.booking_item_id
      `,
      [bookingId]
    ),
    executor(
      `
        SELECT
          l.*,
          s.name AS space_name,
          s.space_type,
          sv.name AS service_name
        FROM lodgings l
        LEFT JOIN spaces s ON s.space_id = l.space_id
        LEFT JOIN services sv ON sv.service_id = l.service_id
        WHERE l.booking_id = $1
      `,
      [bookingId]
    ),
    executor(
      `
        SELECT
          a.*,
          s.name AS space_name,
          s.space_type,
          sv.name AS service_name
        FROM appointments a
        LEFT JOIN spaces s ON s.space_id = a.space_id
        LEFT JOIN services sv ON sv.service_id = a.service_id
        WHERE a.booking_id = $1
      `,
      [bookingId]
    ),
    executor(
      `
        SELECT
          r.*,
          s.name AS space_name,
          s.space_type,
          sv.name AS service_name
        FROM recreation_sessions r
        LEFT JOIN spaces s ON s.space_id = r.space_id
        LEFT JOIN services sv ON sv.service_id = r.service_id
        WHERE r.booking_id = $1
      `,
      [bookingId]
    ),
    executor(
      `
        SELECT
          o.*,
          s.name AS space_name,
          s.space_type,
          s.capacity
        FROM space_occupancy o
        JOIN spaces s ON s.space_id = o.space_id
        WHERE o.booking_id = $1
      `,
      [bookingId]
    ),
  ]);

  return {
    ...booking,
    items: items.rows,
    lodging: lodging.rows[0] || null,
    appointment: appointment.rows[0] || null,
    recreation: recreation.rows[0] || null,
    occupancy: occupancy.rows,
  };
};

const loadService = async (client, serviceId) => {
  const result = await client.query(
    `
      SELECT
        s.service_id,
        s.name,
        s.current_price,
        s.duration_minutes,
        s.is_available,
        sc.category_type
      FROM services s
      LEFT JOIN service_categories sc ON sc.category_id = s.category_id
      WHERE s.service_id = $1
    `,
    [serviceId]
  );

  return result.rows[0] || null;
};

const createBooking = async (req, res) => {
  const {
    pet_id,
    service_id,
    booking_type,
    start_at,
    end_at,
    space_id,
    stylist_id,
    notes,
    owner_preferences,
    quantity,
    items,
    owner_id,
  } = req.body || {};

  if (!pet_id || !start_at) {
    return res.status(400).json({
      message: 'pet_id y start_at son obligatorios',
    });
  }

  const requestedItems = Array.isArray(items) && items.length > 0
    ? items
    : service_id
      ? [{ service_id, quantity: quantity || 1 }]
      : [];

  if (requestedItems.length === 0) {
    return res.status(400).json({
      message: 'Debes enviar service_id o un arreglo items',
    });
  }

  const client = await getClient();

  try {
    await client.query('BEGIN');

    const petResult = await client.query(
      `
        SELECT pet_id, owner_id, name, species, is_active
        FROM pets
        WHERE pet_id = $1
      `,
      [pet_id]
    );
    const pet = petResult.rows[0];

    if (!pet) {
      throw new HttpError(404, 'Mascota no encontrada');
    }
    if (!pet.is_active) {
      throw new HttpError(400, 'La mascota está desactivada');
    }

    const ownerId = hasStaffAccess(req.user)
      ? (owner_id || pet.owner_id)
      : req.user.user_id;

    if (String(pet.owner_id) !== String(ownerId) && !hasStaffAccess(req.user)) {
      throw new HttpError(403, 'La mascota no pertenece al usuario autenticado');
    }

    const primaryService = await loadService(client, requestedItems[0].service_id);
    if (!primaryService) {
      throw new HttpError(404, 'Servicio no encontrado');
    }
    if (!primaryService.is_available) {
      throw new HttpError(400, 'El servicio no está disponible');
    }

    const resolvedType = resolveBookingType(booking_type, primaryService.category_type);
    if (!resolvedType) {
      throw new HttpError(400, 'booking_type debe ser LODGING, APPOINTMENT o RECREATION');
    }

    let resolvedEndAt = end_at;
    if (!resolvedEndAt) {
      const duration = primaryService.duration_minutes || 60;
      resolvedEndAt = new Date(
        new Date(start_at).getTime() + duration * 60 * 1000
      ).toISOString();
    }

    if (!(new Date(resolvedEndAt) > new Date(start_at))) {
      throw new HttpError(400, 'end_at debe ser posterior a start_at');
    }

    if (resolvedType !== 'LODGING') {
      await assertWithinBusinessHours(client.query.bind(client), start_at, resolvedEndAt);
    }

    await assertPetTimeAvailable(client.query.bind(client), {
      petId: pet_id,
      startAt: start_at,
      endAt: resolvedEndAt,
    });

    let resolvedSpaceId = space_id || null;
    const capacityArgs = {
      startAt: start_at,
      endAt: resolvedEndAt,
      species: pet.species,
      stylistId: stylist_id || null,
    };

    if (resolvedType === 'LODGING') {
      await lockCapacityKey(client.query.bind(client), `lodging:${normalizeSpecies(pet.species)}`);
      await assertLodgingCapacity(client.query.bind(client), capacityArgs);
      resolvedSpaceId = await pickLodgingSpace(client.query.bind(client), {
        species: pet.species,
        startAt: start_at,
        endAt: resolvedEndAt,
        preferredSpaceId: space_id || null,
      });
    } else if (resolvedType === 'RECREATION') {
      if (!resolvedSpaceId) {
        const patio = await loadPatioForSpecies(client.query.bind(client), pet.species);
        resolvedSpaceId = patio?.space_id || null;
      }
      await lockCapacityKey(client.query.bind(client), `recreation:${resolvedSpaceId || 'none'}`);
      await assertRecreationCapacity(client.query.bind(client), {
        ...capacityArgs,
        spaceId: resolvedSpaceId,
      });
    } else {
      await lockCapacityKey(client.query.bind(client), `spa:${stylist_id || 'any'}`);
      await assertSpaCapacity(client.query.bind(client), capacityArgs);
      if (!resolvedSpaceId) {
        const spa = await client.query(
          `
            SELECT space_id
            FROM spaces
            WHERE status = 'AVAILABLE'
              AND (
                space_type = 'SPA'::pet_resort.space_type
                OR name ILIKE 'Cabina de Spa%'
              )
            ORDER BY name
            LIMIT 1
          `
        );
        resolvedSpaceId = spa.rows[0]?.space_id || null;
      }
    }

    if (resolvedSpaceId) {
      const spaceResult = await client.query(
        `
          SELECT space_id, status, name
          FROM spaces
          WHERE space_id = $1
        `,
        [resolvedSpaceId]
      );
      const space = spaceResult.rows[0];
      if (!space) {
        throw new HttpError(404, 'Espacio no encontrado');
      }
      if (space.status !== 'AVAILABLE') {
        throw new HttpError(400, 'El espacio no está disponible');
      }
    }

    await assertExclusiveSpaceTimeAvailable(client.query.bind(client), {
      spaceId: resolvedSpaceId,
      startAt: start_at,
      endAt: resolvedEndAt,
    });

    const assignedStaffId = stylist_id || (await pickDefaultStaffId(client.query.bind(client), resolvedType));

    const bookingInsert = await client.query(
      `
        INSERT INTO bookings (
          owner_id,
          pet_id,
          booking_type,
          start_at,
          end_at,
          status,
          notes,
          created_by,
          assigned_staff_id
        )
        VALUES ($1, $2, $3::pet_resort.booking_type, $4, $5, 'PENDING'::pet_resort.booking_status, $6, $7, $8)
        RETURNING booking_id
      `,
      [ownerId, pet_id, resolvedType, start_at, resolvedEndAt, notes || null, req.user.user_id, assignedStaffId]
    );

    const bookingId = bookingInsert.rows[0].booking_id;

    if (resolvedType === 'LODGING') {
      await client.query(
        `
          INSERT INTO lodgings (booking_id, service_id, space_id, status)
          VALUES ($1, $2, $3, 'PENDING'::pet_resort.booking_status)
        `,
        [bookingId, primaryService.service_id, resolvedSpaceId]
      );
    } else if (resolvedType === 'APPOINTMENT') {
      await client.query(
        `
          INSERT INTO appointments (
            booking_id,
            service_id,
            stylist_id,
            space_id,
            status,
            owner_preferences,
            actual_price
          )
          VALUES (
            $1, $2, $3, $4, 'PENDING'::pet_resort.booking_status, $5, $6
          )
        `,
        [
          bookingId,
          primaryService.service_id,
          assignedStaffId,
          resolvedSpaceId || null,
          owner_preferences || notes || null,
          primaryService.current_price,
        ]
      );
    } else {
      await client.query(
        `
          INSERT INTO recreation_sessions (
            booking_id,
            pet_id,
            service_id,
            space_id,
            starts_at,
            ends_at,
            status,
            notes
          )
          VALUES ($1, $2, $3, $4, $5, $6, 'PENDING'::pet_resort.booking_status, $7)
        `,
        [
          bookingId,
          pet_id,
          primaryService.service_id,
          resolvedSpaceId || null,
          start_at,
          resolvedEndAt,
          notes || null,
        ]
      );
    }

    for (const item of requestedItems) {
      const service = await loadService(client, item.service_id);
      if (!service) {
        throw new HttpError(404, `Servicio ${item.service_id} no encontrado`);
      }

      const qty = Number(item.quantity || 1);
      if (!Number.isInteger(qty) || qty <= 0) {
        throw new HttpError(400, 'quantity debe ser un entero positivo');
      }

      const factor = resolvedType === 'LODGING'
        ? nightsBetween(start_at, resolvedEndAt)
        : qty;
      const unitPrice = Number(service.current_price);
      const lineTotal = unitPrice * factor;

      await client.query(
        `
          INSERT INTO booking_items (
            booking_id,
            service_id,
            description,
            quantity,
            unit_price,
            line_total
          )
          VALUES ($1, $2, $3, $4, $5, $6)
        `,
        [bookingId, service.service_id, service.name, factor, unitPrice, lineTotal]
      );
    }

    if (resolvedSpaceId) {
      await insertSpaceOccupancy(client.query.bind(client), {
        spaceId: resolvedSpaceId,
        bookingId,
        startAt: start_at,
        endAt: resolvedEndAt,
      });
    }

    await client.query('COMMIT');

    const detail = await fetchBookingDetail(bookingId);
    notifyBookingEvent(bookingId, 'CREATED');
    return res.status(201).json({
      message: 'Reserva creada correctamente',
      booking: detail,
    });
  } catch (error) {
    await client.query('ROLLBACK');

    if (error.statusCode) {
      return res.status(error.statusCode).json({ message: error.message });
    }
    if (error.code === '23P01') {
      const constraint = String(error.constraint || '');
      if (constraint === 'ex_pet_active_booking_overlap') {
        return res.status(409).json({
          message: 'Esta mascota ya tiene otra reserva que se cruza con ese horario',
        });
      }
      return res.status(409).json({
        message: 'El espacio o el profesional ya tienen una reserva en ese horario',
      });
    }
    if (error.code === '23514') {
      return res.status(400).json({
        message: 'Las fechas o los datos de la reserva no son válidos',
      });
    }

    console.error('Error en createBooking:', error);
    return res.status(500).json({ message: 'No se pudo crear la reserva' });
  } finally {
    client.release();
  }
};

const getAvailability = async (req, res) => {
  const startAt = req.query.start_at;
  const endAt = req.query.end_at;
  if (!startAt || !endAt) {
    return res.status(400).json({ message: 'start_at y end_at son obligatorios' });
  }
  if (!(new Date(endAt) > new Date(startAt))) {
    return res.status(400).json({ message: 'end_at debe ser posterior a start_at' });
  }

  try {
    const availability = await buildAvailability(query, {
      startAt,
      endAt,
      stylistId: req.query.stylist_id || null,
      excludeBookingId: req.query.exclude_booking_id || null,
    });
    return res.status(200).json({ availability });
  } catch (error) {
    console.error('Error en getAvailability:', error);
    return res.status(500).json({ message: 'No se pudo consultar la disponibilidad' });
  }
};

const getUserBookings = async (req, res) => {
  try {
    const result = await query(
      `
        SELECT
          b.booking_id,
          b.pet_id,
          b.booking_type,
          b.start_at,
          b.end_at,
          b.status,
          b.notes,
          b.created_at,
          p.name AS pet_name,
          COALESCE((
            SELECT SUM(bi.line_total)
            FROM booking_items bi
            WHERE bi.booking_id = b.booking_id
          ), 0) AS total_cost
        FROM bookings b
        JOIN pets p ON p.pet_id = b.pet_id
        WHERE b.owner_id = $1
        ORDER BY b.start_at DESC
      `,
      [req.user.user_id]
    );

    return res.status(200).json({ bookings: result.rows });
  } catch (error) {
    console.error('Error en getUserBookings:', error);
    return res.status(500).json({ message: 'No se pudieron obtener las reservas' });
  }
};

const getBookingById = async (req, res) => {
  const bookingId = parseId(req.params.id);
  if (!bookingId) {
    return res.status(400).json({ message: 'ID de reserva inválido' });
  }

  try {
    const booking = await fetchBookingDetail(bookingId);
    if (!booking) {
      return res.status(404).json({ message: 'Reserva no encontrada' });
    }

    if (String(booking.owner_id) !== String(req.user.user_id) && !hasStaffAccess(req.user)) {
      return res.status(403).json({
        message: 'No tienes permiso para ver esta reserva',
      });
    }

    return res.status(200).json({ booking });
  } catch (error) {
    console.error('Error en getBookingById:', error);
    return res.status(500).json({ message: 'No se pudo obtener la reserva' });
  }
};

const cancelBooking = async (req, res) => {
  const bookingId = parseId(req.params.id);
  if (!bookingId) {
    return res.status(400).json({ message: 'ID de reserva inválido' });
  }

  const reason = req.body?.reason || req.body?.cancellation_reason || null;
  const client = await getClient();

  try {
    await client.query('BEGIN');

    const current = await client.query(
      `
        SELECT booking_id, owner_id, status, booking_type
        FROM bookings
        WHERE booking_id = $1
        FOR UPDATE
      `,
      [bookingId]
    );

    const booking = current.rows[0];
    if (!booking) {
      throw new HttpError(404, 'Reserva no encontrada');
    }

    if (String(booking.owner_id) !== String(req.user.user_id) && !hasStaffAccess(req.user)) {
      throw new HttpError(403, 'No tienes permiso para cancelar esta reserva');
    }

    if (NON_CANCELLABLE.includes(booking.status)) {
      throw new HttpError(400, `No se puede cancelar una reserva en estado ${booking.status}`);
    }

    await client.query(
      `
        UPDATE bookings
        SET status = 'CANCELLED'::pet_resort.booking_status, updated_at = NOW()
        WHERE booking_id = $1
      `,
      [bookingId]
    );

    await client.query(
      `
        UPDATE lodgings
        SET status = 'CANCELLED'::pet_resort.booking_status, updated_at = NOW()
        WHERE booking_id = $1
      `,
      [bookingId]
    );

    await client.query(
      `
        UPDATE appointments
        SET
          status = 'CANCELLED'::pet_resort.booking_status,
          cancellation_reason = COALESCE($2, cancellation_reason),
          updated_at = NOW()
        WHERE booking_id = $1
      `,
      [bookingId, reason]
    );

    await client.query(
      `
        UPDATE recreation_sessions
        SET status = 'CANCELLED'::pet_resort.booking_status, updated_at = NOW()
        WHERE booking_id = $1
      `,
      [bookingId]
    );

    await client.query(
      `
        UPDATE space_occupancy
        SET is_active = false
        WHERE booking_id = $1
      `,
      [bookingId]
    );

    await client.query('COMMIT');

    const detail = await fetchBookingDetail(bookingId);
    notifyBookingEvent(bookingId, 'CANCELLED');
    return res.status(200).json({
      message: 'Reserva cancelada correctamente',
      booking: detail,
    });
  } catch (error) {
    await client.query('ROLLBACK');

    if (error.statusCode) {
      return res.status(error.statusCode).json({ message: error.message });
    }

    console.error('Error en cancelBooking:', error);
    return res.status(500).json({ message: 'No se pudo cancelar la reserva' });
  } finally {
    client.release();
  }
};

const getAllBookings = async (req, res) => {
  const { status, from, to, date } = req.query;
  const filters = [];
  const values = [];

  if (status) {
    const normalized = String(status).toUpperCase();
    if (!BOOKING_STATUSES.includes(normalized)) {
      return res.status(400).json({
        message: `status debe ser uno de: ${BOOKING_STATUSES.join(', ')}`,
      });
    }
    values.push(normalized);
    filters.push(`b.status = $${values.length}::pet_resort.booking_status`);
  }

  if (from) {
    values.push(from);
    filters.push(`b.start_at >= $${values.length}`);
  }

  if (to) {
    values.push(to);
    filters.push(`b.end_at <= $${values.length}`);
  }

  if (date) {
    values.push(date);
    filters.push(`b.start_at::date = $${values.length}::date`);
  }

  const whereClause = filters.length > 0 ? `WHERE ${filters.join(' AND ')}` : '';

  try {
    const result = await query(
      `
        SELECT
          b.booking_id,
          b.owner_id,
          b.pet_id,
          b.booking_type,
          b.start_at,
          b.end_at,
          b.status,
          b.notes,
          b.reception_notes,
          b.check_in_at,
          b.check_out_at,
          b.assigned_staff_id,
          b.created_at,
          p.name AS pet_name,
          p.species AS pet_species,
          p.species,
          p.breed,
          p.age_years,
          p.photo_url AS pet_photo_url,
          p.notes AS temperament,
          p.allergies AS pet_allergies,
          u.first_name AS owner_first_name,
          u.last_name AS owner_last_name,
          u.email AS owner_email,
          u.phone AS owner_phone,
          staff.first_name AS assigned_staff_first_name,
          staff.last_name AS assigned_staff_last_name,
          staff.job_title AS assigned_staff_job_title,
          COALESCE(sv_l.name, sv_a.name, sv_r.name) AS service_name,
          CASE b.booking_type::text
            WHEN 'RECREATION' THEN COALESCE(sp_r.name, sp_l.name)
            WHEN 'APPOINTMENT' THEN COALESCE(sp_a.name, sp_l.name)
            ELSE COALESCE(sp_l.name, sp_r.name, sp_a.name)
          END AS space_name,
          CASE b.booking_type::text
            WHEN 'RECREATION' THEN COALESCE(rs.space_id, l.space_id)
            WHEN 'APPOINTMENT' THEN COALESCE(a.space_id, l.space_id)
            ELSE COALESCE(l.space_id, rs.space_id, a.space_id)
          END AS space_id,
          CASE b.booking_type::text
            WHEN 'LODGING' THEN 'Suite'
            WHEN 'RECREATION' THEN 'Patio'
            WHEN 'APPOINTMENT' THEN 'Estación de Spa'
            ELSE COALESCE(sp_l.name, sp_a.name, sp_r.name)
          END AS destination_kind,
          pci.special_care,
          pci.medications,
          pci.allergies,
          pci.feeding_instructions,
          pci.emergency_notes,
          COALESCE((
            SELECT SUM(bi.line_total)
            FROM booking_items bi
            WHERE bi.booking_id = b.booking_id
          ), 0) AS total_cost
        FROM bookings b
        JOIN pets p ON p.pet_id = b.pet_id
        JOIN users u ON u.user_id = b.owner_id
        LEFT JOIN users staff ON staff.user_id = b.assigned_staff_id
        LEFT JOIN lodgings l ON l.booking_id = b.booking_id
        LEFT JOIN appointments a ON a.booking_id = b.booking_id
        LEFT JOIN recreation_sessions rs ON rs.booking_id = b.booking_id
        LEFT JOIN services sv_l ON sv_l.service_id = l.service_id
        LEFT JOIN services sv_a ON sv_a.service_id = a.service_id
        LEFT JOIN services sv_r ON sv_r.service_id = rs.service_id
        LEFT JOIN spaces sp_l ON sp_l.space_id = l.space_id
        LEFT JOIN spaces sp_a ON sp_a.space_id = a.space_id
        LEFT JOIN spaces sp_r ON sp_r.space_id = rs.space_id
        LEFT JOIN pet_care_instructions pci ON pci.pet_id = p.pet_id
        ${whereClause}
        ORDER BY b.start_at DESC
      `,
      values
    );

    return res.status(200).json({ bookings: result.rows });
  } catch (error) {
    console.error('Error en getAllBookings:', error);
    return res.status(500).json({ message: 'No se pudieron listar las reservas' });
  }
};

const syncChildStatus = async (client, bookingId, status) => {
  await client.query(
    `
      UPDATE lodgings
      SET status = $2::pet_resort.booking_status, updated_at = NOW()
      WHERE booking_id = $1
    `,
    [bookingId, status]
  );
  await client.query(
    `
      UPDATE appointments
      SET status = $2::pet_resort.booking_status, updated_at = NOW()
      WHERE booking_id = $1
    `,
    [bookingId, status]
  );
  await client.query(
    `
      UPDATE recreation_sessions
      SET status = $2::pet_resort.booking_status, updated_at = NOW()
      WHERE booking_id = $1
    `,
    [bookingId, status]
  );
};

const applyStaffAssignment = async (client, bookingId, assignedStaffId) => {
  const staffId = assignedStaffId === null || assignedStaffId === '' || assignedStaffId === undefined
    ? null
    : parseId(assignedStaffId);

  if (staffId === undefined) {
    throw new HttpError(400, 'assigned_staff_id inválido');
  }

  if (staffId) {
    const staff = await client.query(
      `
        SELECT
          u.user_id,
          u.status,
          COALESCE(array_agg(UPPER(r.name)) FILTER (WHERE r.name IS NOT NULL), '{}') AS roles
        FROM users u
        LEFT JOIN user_roles ur ON ur.user_id = u.user_id
        LEFT JOIN roles r ON r.role_id = ur.role_id AND r.is_active = true
        WHERE u.user_id = $1
        GROUP BY u.user_id
      `,
      [staffId]
    );

    const member = staff.rows[0];
    if (!member) {
      throw new HttpError(404, 'El empleado asignado no existe');
    }
    if (member.status !== 'ACTIVE') {
      throw new HttpError(400, 'El empleado asignado no está activo');
    }

    const canAssign = (member.roles || []).some((role) => STAFF_ROLES.includes(String(role).toUpperCase()));
    if (!canAssign) {
      throw new HttpError(400, 'El usuario seleccionado no pertenece al personal operativo');
    }
  }

  await client.query(
    `
      UPDATE bookings
      SET assigned_staff_id = $2, updated_at = NOW()
      WHERE booking_id = $1
    `,
    [bookingId, staffId]
  );

  await client.query(
    `
      UPDATE appointments
      SET stylist_id = $2, updated_at = NOW()
      WHERE booking_id = $1
    `,
    [bookingId, staffId]
  );
};

const approveBooking = async (req, res) => {
  const bookingId = parseId(req.params.id);
  if (!bookingId) {
    return res.status(400).json({ message: 'ID de reserva inválido' });
  }

  if (!hasStaffAccess(req.user)) {
    return res.status(403).json({ message: 'No tienes permiso para aprobar reservas' });
  }

  const client = await getClient();

  try {
    await client.query('BEGIN');
    const current = await client.query(
      `SELECT booking_id, status FROM bookings WHERE booking_id = $1 FOR UPDATE`,
      [bookingId]
    );
    const booking = current.rows[0];
    if (!booking) {
      throw new HttpError(404, 'Reserva no encontrada');
    }
    if (booking.status !== 'PENDING') {
      throw new HttpError(400, 'Solo se pueden aprobar reservas en estado PENDING');
    }

    await client.query(
      `
        UPDATE bookings
        SET status = 'CONFIRMED'::pet_resort.booking_status, updated_at = NOW()
        WHERE booking_id = $1
      `,
      [bookingId]
    );
    await syncChildStatus(client, bookingId, 'CONFIRMED');

    if (req.body?.assigned_staff_id !== undefined) {
      await applyStaffAssignment(client, bookingId, req.body.assigned_staff_id);
    } else {
      const detail = await client.query(
        `SELECT booking_type, assigned_staff_id FROM bookings WHERE booking_id = $1`,
        [bookingId]
      );
      if (detail.rows[0] && !detail.rows[0].assigned_staff_id) {
        const defaultStaffId = await pickDefaultStaffId(client.query.bind(client), detail.rows[0].booking_type);
        if (defaultStaffId) {
          await applyStaffAssignment(client, bookingId, defaultStaffId);
        }
      }
    }
    await client.query('COMMIT');

    notifyBookingEvent(bookingId, 'CONFIRMED');
    return res.status(200).json({
      message: 'Reserva aprobada',
      booking: await fetchBookingDetail(bookingId),
    });
  } catch (error) {
    await client.query('ROLLBACK');
    if (error.statusCode) {
      return res.status(error.statusCode).json({ message: error.message });
    }
    console.error('Error en approveBooking:', error);
    return res.status(500).json({ message: 'No se pudo aprobar la reserva' });
  } finally {
    client.release();
  }
};

const assignBooking = async (req, res) => {
  const bookingId = parseId(req.params.id);
  if (!bookingId) {
    return res.status(400).json({ message: 'ID de reserva inválido' });
  }
  if (!hasStaffAccess(req.user)) {
    return res.status(403).json({ message: 'No tienes permiso para asignar reservas' });
  }

  const client = await getClient();

  try {
    await client.query('BEGIN');
    const current = await client.query(
      `
        SELECT b.booking_id, b.booking_type, b.start_at, b.end_at, p.species
        FROM bookings b
        JOIN pets p ON p.pet_id = b.pet_id
        WHERE b.booking_id = $1
        FOR UPDATE OF b
      `,
      [bookingId]
    );
    if (!current.rows[0]) {
      throw new HttpError(404, 'Reserva no encontrada');
    }

    const staffId = req.body?.assigned_staff_id ?? req.body?.assigned_user_id;
    if (current.rows[0].booking_type === 'APPOINTMENT' && staffId) {
      await assertSpaCapacity(client.query.bind(client), {
        startAt: current.rows[0].start_at,
        endAt: current.rows[0].end_at,
        stylistId: staffId,
        excludeBookingId: bookingId,
      });
    }

    await applyStaffAssignment(client, bookingId, staffId);
    await client.query('COMMIT');

    return res.status(200).json({
      message: 'Empleado asignado a la reserva',
      booking: await fetchBookingDetail(bookingId),
    });
  } catch (error) {
    await client.query('ROLLBACK');
    if (error.statusCode) {
      return res.status(error.statusCode).json({ message: error.message });
    }
    console.error('Error en assignBooking:', error);
    return res.status(500).json({ message: 'No se pudo asignar el empleado' });
  } finally {
    client.release();
  }
};

const checkInBooking = async (req, res) => {
  const bookingId = parseId(req.params.id);
  if (!bookingId) {
    return res.status(400).json({ message: 'ID de reserva inválido' });
  }
  if (!hasStaffAccess(req.user)) {
    return res.status(403).json({ message: 'No tienes permiso para hacer check-in' });
  }

  const client = await getClient();

  try {
    await client.query('BEGIN');
    const current = await client.query(
      `
        SELECT booking_id, status, booking_type, assigned_staff_id, start_at, end_at
        FROM bookings
        WHERE booking_id = $1
        FOR UPDATE
      `,
      [bookingId]
    );
    const booking = current.rows[0];
    if (!booking) {
      throw new HttpError(404, 'Reserva no encontrada');
    }
    if (!CHECK_IN_ALLOWED.includes(booking.status)) {
      throw new HttpError(400, `No se puede hacer check-in en estado ${booking.status}`);
    }

    const receptionNotes = req.body?.notes || req.body?.reception_notes || null;
    const spaceId = parseId(req.body?.space_id);

    if (spaceId === undefined) {
      throw new HttpError(400, 'space_id inválido');
    }

    if (spaceId) {
      const space = await client.query(
        `SELECT space_id, name, status FROM spaces WHERE space_id = $1`,
        [spaceId]
      );
      if (!space.rowCount) {
        throw new HttpError(404, 'Espacio no encontrado');
      }
      if (space.rows[0].status !== 'AVAILABLE') {
        throw new HttpError(400, 'El espacio no está disponible');
      }

      const bookingType = String(booking.booking_type).toUpperCase();
      if (bookingType === 'LODGING') {
        const lodging = await client.query(
          `SELECT lodging_id FROM lodgings WHERE booking_id = $1`,
          [bookingId]
        );
        if (lodging.rowCount) {
          await client.query(
            `UPDATE lodgings SET space_id = $2, updated_at = NOW() WHERE booking_id = $1`,
            [bookingId, spaceId]
          );
        } else {
          const item = await client.query(
            `SELECT service_id FROM booking_items WHERE booking_id = $1 LIMIT 1`,
            [bookingId]
          );
          await client.query(
            `
              INSERT INTO lodgings (booking_id, service_id, space_id, status)
              VALUES ($1, $2, $3, 'IN_HOUSE'::pet_resort.booking_status)
            `,
            [bookingId, item.rows[0]?.service_id || null, spaceId]
          );
        }
      } else if (bookingType === 'RECREATION') {
        await client.query(
          `UPDATE recreation_sessions SET space_id = $2, updated_at = NOW() WHERE booking_id = $1`,
          [bookingId, spaceId]
        );
      } else if (bookingType === 'APPOINTMENT') {
        await client.query(
          `UPDATE appointments SET space_id = $2, updated_at = NOW() WHERE booking_id = $1`,
          [bookingId, spaceId]
        );
      }

      await client.query(
        `UPDATE space_occupancy SET is_active = false WHERE booking_id = $1`,
        [bookingId]
      );
      await insertSpaceOccupancy(client.query.bind(client), {
        spaceId,
        bookingId,
        startAt: booking.start_at,
        endAt: booking.end_at,
      });
    }

    if (!booking.assigned_staff_id) {
      const defaultStaffId = await pickDefaultStaffId(client.query.bind(client), booking.booking_type);
      if (defaultStaffId) {
        await applyStaffAssignment(client, bookingId, defaultStaffId);
      }
    }

    await client.query(
      `
        UPDATE bookings
        SET
          status = 'IN_HOUSE'::pet_resort.booking_status,
          check_in_at = COALESCE(check_in_at, NOW()),
          reception_notes = CASE
            WHEN $2::text IS NULL OR $2 = '' THEN reception_notes
            WHEN reception_notes IS NULL OR reception_notes = '' THEN $2
            ELSE reception_notes || E'\n' || $2
          END,
          updated_at = NOW()
        WHERE booking_id = $1
      `,
      [bookingId, receptionNotes]
    );
    await client.query(
      `
        UPDATE lodgings
        SET
          status = 'IN_HOUSE'::pet_resort.booking_status,
          check_in_at = COALESCE(check_in_at, NOW()),
          check_in_by = $2,
          updated_at = NOW()
        WHERE booking_id = $1
      `,
      [bookingId, req.user.user_id]
    );
    await client.query(
      `
        UPDATE appointments
        SET status = 'IN_HOUSE'::pet_resort.booking_status, updated_at = NOW()
        WHERE booking_id = $1
      `,
      [bookingId]
    );
    await client.query(
      `
        UPDATE recreation_sessions
        SET status = 'IN_HOUSE'::pet_resort.booking_status, updated_at = NOW()
        WHERE booking_id = $1
      `,
      [bookingId]
    );
    await client.query('COMMIT');

    notifyBookingEvent(bookingId, 'CHECK_IN');
    return res.status(200).json({
      message: 'Check-in registrado',
      booking: await fetchBookingDetail(bookingId),
    });
  } catch (error) {
    await client.query('ROLLBACK');
    if (error.statusCode) {
      return res.status(error.statusCode).json({ message: error.message });
    }
    console.error('Error en checkInBooking:', error);
    return res.status(500).json({ message: 'No se pudo registrar el check-in' });
  } finally {
    client.release();
  }
};

const checkOutBooking = async (req, res) => {
  const bookingId = parseId(req.params.id);
  if (!bookingId) {
    return res.status(400).json({ message: 'ID de reserva inválido' });
  }
  if (!hasStaffAccess(req.user)) {
    return res.status(403).json({ message: 'No tienes permiso para hacer check-out' });
  }

  const client = await getClient();

  try {
    await client.query('BEGIN');
    const current = await client.query(
      `SELECT booking_id, status FROM bookings WHERE booking_id = $1 FOR UPDATE`,
      [bookingId]
    );
    const booking = current.rows[0];
    if (!booking) {
      throw new HttpError(404, 'Reserva no encontrada');
    }
    if (!IN_HOUSE_STATUSES.includes(booking.status)) {
      throw new HttpError(400, `No se puede hacer check-out en estado ${booking.status}`);
    }

    await client.query(
      `
        UPDATE bookings
        SET
          status = 'COMPLETED'::pet_resort.booking_status,
          check_out_at = NOW(),
          updated_at = NOW()
        WHERE booking_id = $1
      `,
      [bookingId]
    );
    await client.query(
      `
        UPDATE lodgings
        SET
          status = 'COMPLETED'::pet_resort.booking_status,
          check_out_at = NOW(),
          check_out_by = $2,
          updated_at = NOW()
        WHERE booking_id = $1
      `,
      [bookingId, req.user.user_id]
    );
    await client.query(
      `
        UPDATE appointments
        SET status = 'COMPLETED'::pet_resort.booking_status, completed_at = NOW(), updated_at = NOW()
        WHERE booking_id = $1
      `,
      [bookingId]
    );
    await client.query(
      `
        UPDATE recreation_sessions
        SET status = 'COMPLETED'::pet_resort.booking_status, updated_at = NOW()
        WHERE booking_id = $1
      `,
      [bookingId]
    );
    await client.query(
      `
        UPDATE space_occupancy
        SET is_active = false
        WHERE booking_id = $1
      `,
      [bookingId]
    );
    await client.query('COMMIT');

    notifyBookingEvent(bookingId, 'CHECK_OUT');
    return res.status(200).json({
      message: 'Check-out registrado',
      booking: await fetchBookingDetail(bookingId),
    });
  } catch (error) {
    await client.query('ROLLBACK');
    if (error.statusCode) {
      return res.status(error.statusCode).json({ message: error.message });
    }
    console.error('Error en checkOutBooking:', error);
    return res.status(500).json({ message: 'No se pudo registrar el check-out' });
  } finally {
    client.release();
  }
};

const rescheduleBooking = async (req, res) => {
  const bookingId = parseId(req.params.id);
  if (!bookingId) {
    return res.status(400).json({ message: 'ID de reserva inválido' });
  }
  if (!hasStaffAccess(req.user)) {
    return res.status(403).json({ message: 'No tienes permiso para modificar reservas' });
  }

  const startAt = req.body?.start_at;
  const endAt = req.body?.end_at;
  if (!startAt || !endAt) {
    return res.status(400).json({ message: 'start_at y end_at son obligatorios' });
  }
  if (!(new Date(endAt) > new Date(startAt))) {
    return res.status(400).json({ message: 'end_at debe ser posterior a start_at' });
  }

  const client = await getClient();
  try {
    await client.query('BEGIN');
    const current = await client.query(
      `
        SELECT b.booking_id, b.pet_id, b.status, b.booking_type, b.assigned_staff_id, p.species
        FROM bookings b
        JOIN pets p ON p.pet_id = b.pet_id
        WHERE b.booking_id = $1
        FOR UPDATE OF b
      `,
      [bookingId]
    );
    const booking = current.rows[0];
    if (!booking) {
      throw new HttpError(404, 'Reserva no encontrada');
    }
    if (['COMPLETED', 'CANCELLED', 'NO_SHOW'].includes(booking.status)) {
      throw new HttpError(400, `No se puede modificar una reserva en estado ${booking.status}`);
    }

    if (booking.booking_type !== 'LODGING') {
      await assertWithinBusinessHours(client.query.bind(client), startAt, endAt);
    }
    await assertPetTimeAvailable(client.query.bind(client), {
      petId: booking.pet_id,
      startAt,
      endAt,
      excludeBookingId: bookingId,
    });

    const occupancy = await client.query(
      `
        SELECT space_id
        FROM space_occupancy
        WHERE booking_id = $1 AND is_active = true
        LIMIT 1
      `,
      [bookingId]
    );
    await assertExclusiveSpaceTimeAvailable(client.query.bind(client), {
      spaceId: occupancy.rows[0]?.space_id,
      startAt,
      endAt,
      excludeBookingId: bookingId,
    });

    const capacityArgs = {
      startAt,
      endAt,
      species: booking.species,
      stylistId: booking.assigned_staff_id,
      excludeBookingId: bookingId,
    };
    if (booking.booking_type === 'LODGING') {
      await lockCapacityKey(client.query.bind(client), `lodging:${normalizeSpecies(booking.species)}`);
      await assertLodgingCapacity(client.query.bind(client), capacityArgs);
    } else if (booking.booking_type === 'RECREATION') {
      const patio = await loadPatioForSpecies(client.query.bind(client), booking.species);
      await lockCapacityKey(client.query.bind(client), `recreation:${patio?.space_id || 'none'}`);
      await assertRecreationCapacity(client.query.bind(client), {
        ...capacityArgs,
        spaceId: patio?.space_id,
      });
    } else if (booking.booking_type === 'APPOINTMENT') {
      await lockCapacityKey(client.query.bind(client), `spa:${booking.assigned_staff_id || 'any'}`);
      await assertSpaCapacity(client.query.bind(client), capacityArgs);
    }

    await client.query(
      `
        UPDATE bookings
        SET start_at = $2, end_at = $3, updated_at = NOW()
        WHERE booking_id = $1
      `,
      [bookingId, startAt, endAt]
    );
    await client.query(
      `
        UPDATE space_occupancy
        SET start_at = $2, end_at = $3
        WHERE booking_id = $1 AND is_active = true
      `,
      [bookingId, startAt, endAt]
    );

    await client.query('COMMIT');
    notifyBookingEvent(bookingId, 'RESCHEDULED');
    return res.status(200).json({
      message: 'Fecha y hora actualizadas',
      booking: await fetchBookingDetail(bookingId),
    });
  } catch (error) {
    await client.query('ROLLBACK');
    if (error.statusCode) {
      return res.status(error.statusCode).json({ message: error.message });
    }
    if (error.code === '23P01') {
      return res.status(409).json({ message: 'El horario choca con otra reserva' });
    }
    console.error('Error en rescheduleBooking:', error);
    return res.status(500).json({ message: 'No se pudo modificar la reserva' });
  } finally {
    client.release();
  }
};

module.exports = {
  ensureBookingSupportTables,
  createBooking,
  getAvailability,
  getUserBookings,
  getBookingById,
  cancelBooking,
  getAllBookings,
  approveBooking,
  assignBooking,
  checkInBooking,
  checkOutBooking,
  rescheduleBooking,
};
