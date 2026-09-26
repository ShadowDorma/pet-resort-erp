const fs = require('fs');
const path = require('path');
const { pool } = require('./db');
const { OPERATIONAL_ROLES } = require('../constants/roles');

const ROLE_DESCRIPTIONS = {
  CLIENT: 'Propietario de mascotas',
  RECEPCIONIST: 'Gestión de check-in/out, clientes, reservas y citas',
  CARETAKER: 'Cuidador: bitácora de alimentación, paseos e incidencias',
  STYLIST: 'Estilista: agenda de spa, corte, estética y reporte de servicios',
  ADMIN: 'Control total del establecimiento',
};

const ensureEnum = async (typeName, labels) => {
  const existing = await pool.query(
    `
      SELECT 1
      FROM pg_type t
      JOIN pg_namespace n ON n.oid = t.typnamespace
      WHERE n.nspname = 'pet_resort' AND t.typname = $1
    `,
    [typeName]
  );

  if (existing.rowCount === 0) {
    const values = labels.map((label) => `'${label}'`).join(', ');
    await pool.query(`CREATE TYPE pet_resort.${typeName} AS ENUM (${values})`);
    return;
  }

  for (const label of labels) {
    const hasLabel = await pool.query(
      `
        SELECT 1
        FROM pg_enum e
        JOIN pg_type t ON t.oid = e.enumtypid
        JOIN pg_namespace n ON n.oid = t.typnamespace
        WHERE n.nspname = 'pet_resort'
          AND t.typname = $1
          AND e.enumlabel = $2
      `,
      [typeName, label]
    );
    if (hasLabel.rowCount === 0) {
      await pool.query(`ALTER TYPE pet_resort.${typeName} ADD VALUE '${label}'`);
    }
  }
};

const ensureRbacSchema = async () => {
  await ensureEnum('app_role', OPERATIONAL_ROLES);
  await ensureEnum('care_log_kind', ['FEEDING', 'ACTIVITY', 'MEDICAL', 'NOTE']);
  await ensureEnum('service_log_status', ['IN_PROGRESS', 'COMPLETED', 'FAILED']);
  await ensureEnum('space_type', ['ROOM', 'KENNEL', 'RECREATION', 'MULTIPURPOSE', 'DOG_SUITE', 'CAT_SUITE', 'SPA']);

  for (const name of OPERATIONAL_ROLES) {
    await pool.query(
      `
        INSERT INTO pet_resort.roles (name, description, is_active)
        VALUES ($1, $2, true)
        ON CONFLICT (name)
        DO UPDATE SET description = EXCLUDED.description, is_active = true
      `,
      [name, ROLE_DESCRIPTIONS[name]]
    );
  }

  await pool.query(`
    CREATE TABLE IF NOT EXISTS pet_resort.service_logs (
      service_log_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      booking_id BIGINT NOT NULL REFERENCES pet_resort.bookings(booking_id) ON DELETE CASCADE,
      stylist_id BIGINT NOT NULL REFERENCES pet_resort.users(user_id) ON DELETE RESTRICT,
      status pet_resort.service_log_status NOT NULL DEFAULT 'IN_PROGRESS',
      notes TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await pool.query(`ALTER TABLE pet_resort.users ADD COLUMN IF NOT EXISTS address TEXT`);
  await pool.query(`ALTER TABLE pet_resort.users ADD COLUMN IF NOT EXISTS emergency_contact TEXT`);
  await pool.query(`ALTER TABLE pet_resort.pets ADD COLUMN IF NOT EXISTS age_years NUMERIC(5,1)`);
  await pool.query(`ALTER TABLE pet_resort.pets ADD COLUMN IF NOT EXISTS allergies TEXT`);
  await pool.query(`ALTER TABLE pet_resort.pets ADD COLUMN IF NOT EXISTS diet_notes TEXT`);
  await pool.query(`ALTER TABLE pet_resort.pets ADD COLUMN IF NOT EXISTS vet_emergency_contact TEXT`);
  await pool.query(`ALTER TABLE pet_resort.pets ADD COLUMN IF NOT EXISTS photo_url TEXT`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS pet_resort.care_logs (
      care_log_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      pet_id BIGINT REFERENCES pet_resort.pets(pet_id) ON DELETE CASCADE,
      lodging_id BIGINT,
      registered_by BIGINT REFERENCES pet_resort.users(user_id) ON DELETE SET NULL,
      log_type TEXT,
      title TEXT,
      description TEXT NOT NULL DEFAULT '',
      occurred_at TIMESTAMPTZ,
      photo_url TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await pool.query(`ALTER TABLE pet_resort.care_logs ADD COLUMN IF NOT EXISTS pet_id BIGINT`);
  await pool.query(`ALTER TABLE pet_resort.care_logs ADD COLUMN IF NOT EXISTS lodging_id BIGINT`);
  await pool.query(`ALTER TABLE pet_resort.care_logs ADD COLUMN IF NOT EXISTS registered_by BIGINT`);
  await pool.query(`ALTER TABLE pet_resort.care_logs ADD COLUMN IF NOT EXISTS log_type TEXT`);
  await pool.query(`ALTER TABLE pet_resort.care_logs ADD COLUMN IF NOT EXISTS title TEXT`);
  await pool.query(`ALTER TABLE pet_resort.care_logs ADD COLUMN IF NOT EXISTS description TEXT`);
  await pool.query(`ALTER TABLE pet_resort.care_logs ADD COLUMN IF NOT EXISTS occurred_at TIMESTAMPTZ`);
  await pool.query(`ALTER TABLE pet_resort.care_logs ADD COLUMN IF NOT EXISTS photo_url TEXT`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS pet_resort.reviews (
      review_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      user_id BIGINT NOT NULL UNIQUE REFERENCES pet_resort.users(user_id) ON DELETE CASCADE,
      rating SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
      comment TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS pet_resort.notifications (
      notification_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      user_id BIGINT NOT NULL REFERENCES pet_resort.users(user_id) ON DELETE CASCADE,
      type TEXT NOT NULL DEFAULT 'GENERAL',
      title TEXT NOT NULL,
      body TEXT NOT NULL DEFAULT '',
      link TEXT,
      related_booking_id BIGINT,
      is_read BOOLEAN NOT NULL DEFAULT false,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await pool.query(`ALTER TABLE pet_resort.notifications ADD COLUMN IF NOT EXISTS related_booking_id BIGINT`);
  await pool.query(`ALTER TABLE pet_resort.notifications ADD COLUMN IF NOT EXISTS link TEXT`);
  await pool.query(`ALTER TABLE pet_resort.notifications ADD COLUMN IF NOT EXISTS is_read BOOLEAN NOT NULL DEFAULT false`);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_notifications_user_created
    ON pet_resort.notifications (user_id, created_at DESC)
  `);
};

const applySchemaFile = async () => {
  const file = path.join(__dirname, 'schema.sql');
  if (fs.existsSync(file)) {
    await ensureRbacSchema();
  }
};

module.exports = {
  ensureRbacSchema,
  applySchemaFile,
};
