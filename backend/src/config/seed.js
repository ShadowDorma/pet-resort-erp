const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });
require('dotenv').config({ path: path.resolve(__dirname, '../.env'), override: true });

const bcrypt = require('bcryptjs');
const { getClient, pool } = require('./db');
const { ensureBookingSupportTables } = require('../controllers/bookingController');
const { ensureRbacSchema } = require('./ensureSchema');

const usersSeed = [
  {
    first_name: 'Mercy',
    last_name: 'Machado',
    email: 'mercy@petresort.com',
    phone: '3001110001',
    role: 'ADMIN',
    job_title: 'Administradora',
    password: process.env.SEED_ADMIN_PASSWORD || 'PrAdmin#2026',
  },
  {
    first_name: 'Carlos',
    last_name: 'Mendoza',
    email: 'carlos@petresort.com',
    phone: '3002220001',
    role: 'CARETAKER',
    job_title: 'Cuidador',
    password: process.env.SEED_CARETAKER_PASSWORD || 'PrFront#2026',
  },
  {
    first_name: 'Lucía',
    last_name: 'Herrera',
    email: 'lucia@petresort.com',
    phone: '3002220003',
    role: 'STYLIST',
    job_title: 'Estilista',
    password: process.env.SEED_STYLIST_PASSWORD || 'PrCare#2026',
  },
  {
    first_name: 'Ana',
    last_name: 'Martínez',
    email: 'ana@petresort.com',
    phone: '3002220002',
    role: 'RECEPCIONIST',
    job_title: 'Recepcionista',
    password: process.env.SEED_RECEPTION_PASSWORD || 'PrStyle#2026',
  },
  {
    first_name: 'Laura',
    last_name: 'Ríos',
    email: 'laura@gmail.com',
    phone: '3003330001',
    role: 'CLIENT',
    password: process.env.SEED_CLIENT_PASSWORD || 'PrClient#2026',
  },
];

const rolesSeed = [
  { name: 'CLIENT', description: 'Propietario de mascotas' },
  { name: 'RECEPCIONIST', description: 'Gestión de check-in/out, clientes, reservas y citas' },
  { name: 'CARETAKER', description: 'Cuidador: bitácora de alimentación, paseos e incidencias' },
  { name: 'STYLIST', description: 'Estilista: agenda de spa, corte, estética y reporte de servicios' },
  { name: 'ADMIN', description: 'Control total del establecimiento' },
];

const categoriesSeed = [
  {
    name: 'Hospedaje',
    category_type: 'HOTEL',
    description: 'Alojamiento boutique para perros y gatos',
  },
  {
    name: 'Spa & Grooming',
    category_type: 'SPA',
    description: 'Baño, corte y tratamientos relajantes',
  },
  {
    name: 'Recreación',
    category_type: 'RECREATION',
    description: 'Guardería, juego y socialización',
  },
];

const servicesSeed = [
  {
    category: 'Hospedaje',
    name: 'Hotel Canino Suite',
    description: 'Suite climatizada para perros, con monitoreo y rutina personalizada.',
    target_pet_type: 'Perros',
    duration_label: 'Por día',
    duration_minutes: 1440,
    current_price: 80000,
  },
  {
    category: 'Hospedaje',
    name: 'Hotel Felino Suite',
    description: 'Suite exclusiva para gatos, ambiente calmado y enriquecido.',
    target_pet_type: 'Gatos',
    duration_label: 'Por día',
    duration_minutes: 1440,
    current_price: 60000,
  },
  {
    category: 'Spa & Grooming',
    name: 'Baño y Corte Completo',
    description: 'Baño, corte, secado y acabado estético.',
    target_pet_type: 'Perros y Gatos',
    duration_label: '90 min',
    duration_minutes: 90,
    current_price: 45000,
  },
  {
    category: 'Spa & Grooming',
    name: 'Spa Relajante',
    description: 'Baño hidratante y aromaterapia pet-friendly.',
    target_pet_type: 'Perros y Gatos',
    duration_label: '60 min',
    duration_minutes: 60,
    current_price: 35000,
  },
  {
    category: 'Recreación',
    name: 'Día de Guardería y Recreación',
    description: 'Juego supervisado, socialización y descanso durante el día.',
    target_pet_type: 'Perros y Gatos',
    duration_label: 'Jornada',
    duration_minutes: 480,
    current_price: 30000,
  },
];

const spacesSeed = [
  ...[1, 2, 3, 4, 5].map((index) => ({
    name: `Suite Canina 0${index}`,
    space_type: 'DOG_SUITE',
    capacity: 1,
    description: 'Suite individual de hotel canino',
  })),
  ...[1, 2, 3, 4, 5].map((index) => ({
    name: `Suite Felina 0${index}`,
    space_type: 'CAT_SUITE',
    capacity: 1,
    description: 'Suite individual de hotel felino',
  })),
  {
    name: 'Patio Canino 01',
    space_type: 'RECREATION',
    capacity: 3,
    description: 'Patio de guardería y recreación para perros',
  },
  {
    name: 'Patio Felino 01',
    space_type: 'RECREATION',
    capacity: 3,
    description: 'Patio de guardería y recreación para gatos',
  },
  {
    name: 'Cabina de Spa & Estética 01',
    space_type: 'SPA',
    capacity: 1,
    description: 'Cabina de baño, corte y spa relajante',
  },
];

const upsertRole = async (client, role) => {
  const result = await client.query(
    `
      INSERT INTO roles (name, description, is_active)
      VALUES ($1, $2, true)
      ON CONFLICT (name)
      DO UPDATE SET description = EXCLUDED.description, is_active = true
      RETURNING role_id, name
    `,
    [role.name, role.description]
  );
  return result.rows[0];
};

const upsertUser = async (client, user, passwordHash) => {
  const result = await client.query(
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
      VALUES ($1, $2, $3, $4, $5, 'ACTIVE'::pet_resort.user_status, $6, NOW())
      ON CONFLICT (email)
      DO UPDATE SET
        first_name = EXCLUDED.first_name,
        last_name = EXCLUDED.last_name,
        phone = EXCLUDED.phone,
        password_hash = EXCLUDED.password_hash,
        status = 'ACTIVE'::pet_resort.user_status,
        job_title = COALESCE(EXCLUDED.job_title, users.job_title),
        terms_accepted_at = COALESCE(users.terms_accepted_at, NOW()),
        updated_at = NOW()
      RETURNING user_id, email
    `,
    [user.first_name, user.last_name, user.email, user.phone, passwordHash, user.job_title || null]
  );
  return result.rows[0];
};

const assignRole = async (client, userId, roleId) => {
  await client.query(
    `
      INSERT INTO user_roles (user_id, role_id)
      VALUES ($1, $2)
      ON CONFLICT (user_id, role_id) DO NOTHING
    `,
    [userId, roleId]
  );
};

const upsertCategory = async (client, category) => {
  const result = await client.query(
    `
      INSERT INTO service_categories (name, category_type, description, is_active)
      VALUES ($1, $2::pet_resort.service_category_enum, $3, true)
      ON CONFLICT (name)
      DO UPDATE SET
        category_type = EXCLUDED.category_type,
        description = EXCLUDED.description,
        is_active = true
      RETURNING category_id, name
    `,
    [category.name, category.category_type, category.description]
  );
  return result.rows[0];
};

const upsertService = async (client, service, categoryId) => {
  const result = await client.query(
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
      VALUES ($1, $2, $3, $4, $5, $6, $7, true)
      ON CONFLICT (name)
      DO UPDATE SET
        category_id = EXCLUDED.category_id,
        description = EXCLUDED.description,
        target_pet_type = EXCLUDED.target_pet_type,
        duration_label = EXCLUDED.duration_label,
        duration_minutes = EXCLUDED.duration_minutes,
        current_price = EXCLUDED.current_price,
        is_available = true,
        updated_at = NOW()
      RETURNING service_id, name, current_price
    `,
    [
      categoryId,
      service.name,
      service.description,
      service.target_pet_type,
      service.duration_label,
      service.duration_minutes,
      service.current_price,
    ]
  );
  return result.rows[0];
};

const seedPriceHistory = async (client, service, changedBy) => {
  await client.query(
    `
      UPDATE service_price_history
      SET valid_to = NOW()
      WHERE service_id = $1
        AND valid_to IS NULL
        AND price IS DISTINCT FROM $2
    `,
    [service.service_id, service.current_price]
  );

  const current = await client.query(
    `
      SELECT price_history_id
      FROM service_price_history
      WHERE service_id = $1
        AND valid_to IS NULL
        AND price = $2
      LIMIT 1
    `,
    [service.service_id, service.current_price]
  );

  if (current.rowCount > 0) {
    return;
  }

  await client.query(
    `
      INSERT INTO service_price_history (service_id, price, valid_from, valid_to, changed_by)
      VALUES ($1, $2, NOW(), NULL, $3)
    `,
    [service.service_id, service.current_price, changedBy]
  );
};

const upsertSpace = async (client, space) => {
  await client.query(
    `
      INSERT INTO spaces (name, space_type, capacity, status, description)
      VALUES ($1, $2::pet_resort.space_type, $3, 'AVAILABLE'::pet_resort.space_status, $4)
      ON CONFLICT (name)
      DO UPDATE SET
        space_type = EXCLUDED.space_type,
        capacity = EXCLUDED.capacity,
        status = 'AVAILABLE'::pet_resort.space_status,
        description = EXCLUDED.description,
        updated_at = NOW()
    `,
    [space.name, space.space_type, space.capacity, space.description]
  );
};

const seedBusinessHours = async (client) => {
  const days = [
    { day: 1, label: 'Lunes' },
    { day: 2, label: 'Martes' },
    { day: 3, label: 'Miércoles' },
    { day: 4, label: 'Jueves' },
    { day: 5, label: 'Viernes' },
    { day: 6, label: 'Sábado' },
    { day: 0, label: 'Domingo' },
  ];

  for (const item of days) {
    await client.query(
      `
        INSERT INTO business_hours (day_of_week, opens_at, closes_at, is_closed)
        VALUES ($1, TIME '08:00', TIME '18:00', false)
        ON CONFLICT (day_of_week)
        DO UPDATE SET
          opens_at = TIME '08:00',
          closes_at = TIME '18:00',
          is_closed = false
      `,
      [item.day]
    );
  }
};

const upsertPet = async (client, ownerId, pet) => {
  const existing = await client.query(
    `
      SELECT pet_id
      FROM pets
      WHERE owner_id = $1 AND name = $2
      LIMIT 1
    `,
    [ownerId, pet.name]
  );

  if (existing.rowCount > 0) {
    await client.query(
      `
        UPDATE pets
        SET species = $2,
            breed = $3,
            is_active = true,
            notes = $4,
            updated_at = NOW()
        WHERE pet_id = $1
      `,
      [existing.rows[0].pet_id, pet.species, pet.breed, pet.notes]
    );
    return existing.rows[0].pet_id;
  }

  const inserted = await client.query(
    `
      INSERT INTO pets (owner_id, name, species, breed, gender, notes, is_active)
      VALUES ($1, $2, $3, $4, 'UNKNOWN'::pet_resort.gender_type, $5, true)
      RETURNING pet_id
    `,
    [ownerId, pet.name, pet.species, pet.breed, pet.notes]
  );
  return inserted.rows[0].pet_id;
};

const seedLuckyRecreationToday = async (client, { ownerId, carlosId, createdBy }) => {
  if (!ownerId) {
    return;
  }

  const luckyId = await upsertPet(client, ownerId, {
    name: 'Lucky',
    species: 'Perro',
    breed: 'Golden Retriever',
    notes: 'Guardería de prueba en Patio de Recreación, asignada al cuidador Carlos',
  });

  const service = await client.query(
    `
      SELECT service_id, current_price, name
      FROM services
      WHERE name = 'Día de Guardería y Recreación'
      LIMIT 1
    `
  );
  const space = await client.query(
    `
      SELECT space_id
      FROM spaces
      WHERE name = 'Patio Canino 01'
      LIMIT 1
    `
  );
  if (!service.rowCount) {
    return;
  }

  const existing = await client.query(
    `
      SELECT booking_id, status, booking_type
      FROM bookings
      WHERE pet_id = $1
        AND status::text NOT IN ('CANCELLED', 'NO_SHOW', 'COMPLETED')
      ORDER BY start_at DESC
      LIMIT 1
    `,
    [luckyId]
  );

  const keepInHouse = existing.rowCount
    && ['IN_HOUSE', 'CHECKED_IN', 'IN_PROGRESS'].includes(existing.rows[0].status);
  const nextStatus = keepInHouse ? existing.rows[0].status : 'IN_HOUSE';
  const patioId = space.rows[0]?.space_id || null;

  let bookingId = existing.rows[0]?.booking_id;
  if (bookingId) {
    await client.query(
      `
        UPDATE bookings
        SET
          booking_type = 'RECREATION'::pet_resort.booking_type,
          start_at = timezone('America/Bogota', timezone('America/Bogota', now())::date + TIME '08:00'),
          end_at = timezone('America/Bogota', timezone('America/Bogota', now())::date + TIME '17:00'),
          status = $2::pet_resort.booking_status,
          assigned_staff_id = COALESCE($3, assigned_staff_id),
          notes = 'Reserva de prueba: Lucky en patio de recreación (guardería)',
          updated_at = NOW()
        WHERE booking_id = $1
      `,
      [bookingId, nextStatus, carlosId || null]
    );
  } else {
    const inserted = await client.query(
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
        VALUES (
          $1,
          $2,
          'RECREATION'::pet_resort.booking_type,
          timezone('America/Bogota', timezone('America/Bogota', now())::date + TIME '08:00'),
          timezone('America/Bogota', timezone('America/Bogota', now())::date + TIME '17:00'),
          'IN_HOUSE'::pet_resort.booking_status,
          'Reserva de prueba: Lucky en patio de recreación (guardería)',
          $3,
          $4
        )
        RETURNING booking_id
      `,
      [ownerId, luckyId, createdBy || ownerId, carlosId || null]
    );
    bookingId = inserted.rows[0].booking_id;
  }

  await client.query(`DELETE FROM lodgings WHERE booking_id = $1`, [bookingId]);
  await client.query(
    `
      INSERT INTO recreation_sessions (
        booking_id, pet_id, service_id, space_id, starts_at, ends_at, status, notes
      )
      SELECT
        $1, $2, $3, $4,
        timezone('America/Bogota', timezone('America/Bogota', now())::date + TIME '08:00'),
        timezone('America/Bogota', timezone('America/Bogota', now())::date + TIME '17:00'),
        $5::pet_resort.booking_status,
        'Lucky en Patio de Recreación'
      WHERE NOT EXISTS (
        SELECT 1 FROM recreation_sessions WHERE booking_id = $1
      )
    `,
    [bookingId, luckyId, service.rows[0].service_id, patioId, nextStatus]
  );
  await client.query(
    `
      UPDATE recreation_sessions
      SET
        service_id = $2,
        space_id = $3,
        status = $4::pet_resort.booking_status,
        pet_id = $5
      WHERE booking_id = $1
    `,
    [bookingId, service.rows[0].service_id, patioId, nextStatus, luckyId]
  );

  await client.query(`DELETE FROM booking_items WHERE booking_id = $1`, [bookingId]);
  await client.query(
    `
      INSERT INTO booking_items (
        booking_id, service_id, description, quantity, unit_price, line_total
      )
      VALUES ($1, $2, $3, 1, $4, $4)
    `,
    [bookingId, service.rows[0].service_id, service.rows[0].name, service.rows[0].current_price]
  );

  await client.query(
    `
      UPDATE space_occupancy
      SET is_active = false
      WHERE booking_id = $1
    `,
    [bookingId]
  );
  if (patioId) {
    await client.query(
      `
        INSERT INTO space_occupancy (space_id, booking_id, start_at, end_at, is_active, exclusive_slot)
        SELECT $2, $1, b.start_at, b.end_at, true, false
        FROM bookings b
        WHERE b.booking_id = $1
      `,
      [bookingId, patioId]
    );
  }
};

const seed = async () => {
  const client = await getClient();

  try {
    await ensureRbacSchema();
    await ensureBookingSupportTables();
    await client.query('BEGIN');

    const roles = {};
    for (const role of rolesSeed) {
      const saved = await upsertRole(client, role);
      roles[saved.name] = saved.role_id;
    }

    const usersByEmail = {};
    for (const user of usersSeed) {
      const passwordHash = await bcrypt.hash(user.password, 10);
      const saved = await upsertUser(client, user, passwordHash);
      usersByEmail[saved.email] = saved.user_id;
      await client.query('DELETE FROM user_roles WHERE user_id = $1', [saved.user_id]);
      await assignRole(client, saved.user_id, roles[user.role]);
    }

    const carlosId = usersByEmail['carlos@petresort.com'];
    const luciaId = usersByEmail['lucia@petresort.com'];
    if (carlosId) {
      await client.query(
        `
          UPDATE bookings
          SET assigned_staff_id = $1, updated_at = NOW()
          WHERE assigned_staff_id IS NULL
            AND booking_type::text IN ('LODGING', 'RECREATION')
            AND status::text NOT IN ('CANCELLED', 'NO_SHOW', 'COMPLETED')
        `,
        [carlosId]
      );
    }
    if (luciaId) {
      await client.query(
        `
          UPDATE bookings
          SET assigned_staff_id = $1, updated_at = NOW()
          WHERE booking_type::text = 'APPOINTMENT'
            AND status::text NOT IN ('CANCELLED', 'NO_SHOW', 'COMPLETED')
            AND (
              assigned_staff_id IS NULL
              OR assigned_staff_id = $2
            )
        `,
        [luciaId, carlosId || 0]
      );
      await client.query(
        `
          UPDATE appointments a
          SET stylist_id = $1, updated_at = NOW()
          FROM bookings b
          WHERE a.booking_id = b.booking_id
            AND b.booking_type::text = 'APPOINTMENT'
            AND b.status::text NOT IN ('CANCELLED', 'NO_SHOW', 'COMPLETED')
            AND (
              a.stylist_id IS NULL
              OR a.stylist_id = $2
            )
        `,
        [luciaId, carlosId || 0]
      );
    }

    const categories = {};
    for (const category of categoriesSeed) {
      const saved = await upsertCategory(client, category);
      categories[saved.name] = saved.category_id;
    }

    const adminId = usersByEmail['mercy@petresort.com'];
    for (const service of servicesSeed) {
      const saved = await upsertService(client, service, categories[service.category]);
      await seedPriceHistory(client, saved, adminId);
    }

    for (const space of spacesSeed) {
      await upsertSpace(client, space);
    }

    const officialNames = spacesSeed.map((space) => space.name);
    await client.query(
      `
        UPDATE spaces
        SET status = 'INACTIVE'::pet_resort.space_status, updated_at = NOW()
        WHERE name <> ALL($1::text[])
      `,
      [officialNames]
    );
    await client.query(
      `
        UPDATE appointments
        SET space_id = (SELECT space_id FROM spaces WHERE name = 'Cabina de Spa & Estética 01' LIMIT 1)
        WHERE space_id IN (
          SELECT space_id FROM spaces WHERE name IN ('Estación Grooming & Spa', 'Estación Grooming')
        )
      `
    );
    await client.query(
      `
        UPDATE space_occupancy
        SET space_id = (SELECT space_id FROM spaces WHERE name = 'Cabina de Spa & Estética 01' LIMIT 1)
        WHERE is_active = true
          AND space_id IN (
            SELECT space_id FROM spaces WHERE name IN ('Estación Grooming & Spa', 'Estación Grooming')
          )
      `
    );

    await seedBusinessHours(client);

    await upsertPet(client, usersByEmail['laura@gmail.com'], {
      name: 'Luna',
      species: 'Perro',
      breed: 'Labrador',
      notes: 'Mascota de prueba de Laura Ríos',
    });

    await seedLuckyRecreationToday(client, {
      ownerId: usersByEmail['laura@gmail.com'],
      carlosId: usersByEmail['carlos@petresort.com'],
      createdBy: usersByEmail['ana@petresort.com'] || usersByEmail['mercy@petresort.com'],
    });

    await client.query('COMMIT');

    console.log('Seed de pet_resort completado.');
    console.log('Usuarios de prueba (email). La contraseña sale de SEED_*_PASSWORD o del valor local de seed.');
    usersSeed.forEach((user) => {
      console.log(`- ${user.role}: ${user.email}`);
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error al ejecutar el seed:', error);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
};

seed();
