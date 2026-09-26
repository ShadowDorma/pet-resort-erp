-- Pet Resort — roles operativos y bitácoras
-- Roles permitidos: CLIENT, RECEPCIONIST, CARETAKER, STYLIST, ADMIN

CREATE SCHEMA IF NOT EXISTS pet_resort;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'pet_resort' AND t.typname = 'app_role'
  ) THEN
    CREATE TYPE pet_resort.app_role AS ENUM (
      'CLIENT',
      'RECEPCIONIST',
      'CARETAKER',
      'STYLIST',
      'ADMIN'
    );
  END IF;
END
$$;

INSERT INTO pet_resort.roles (name, description, is_active)
VALUES
  ('CLIENT', 'Propietario de mascotas', true),
  ('RECEPCIONIST', 'Gestión de check-in/out, clientes, reservas y citas', true),
  ('CARETAKER', 'Cuidador: bitácora de alimentación, paseos e incidencias', true),
  ('STYLIST', 'Estilista: agenda de spa, corte, estética y reporte de servicios', true),
  ('ADMIN', 'Control total del establecimiento', true)
ON CONFLICT (name) DO UPDATE
SET description = EXCLUDED.description, is_active = true;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'pet_resort' AND t.typname = 'care_log_kind'
  ) THEN
    CREATE TYPE pet_resort.care_log_kind AS ENUM ('FEEDING', 'ACTIVITY', 'MEDICAL', 'NOTE');
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'pet_resort' AND t.typname = 'service_log_status'
  ) THEN
    CREATE TYPE pet_resort.service_log_status AS ENUM ('IN_PROGRESS', 'COMPLETED', 'FAILED');
  END IF;
END
$$;

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
);

CREATE TABLE IF NOT EXISTS pet_resort.service_logs (
  service_log_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  booking_id BIGINT NOT NULL REFERENCES pet_resort.bookings(booking_id) ON DELETE CASCADE,
  stylist_id BIGINT NOT NULL REFERENCES pet_resort.users(user_id) ON DELETE RESTRICT,
  status pet_resort.service_log_status NOT NULL DEFAULT 'IN_PROGRESS',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'pet_resort' AND t.typname = 'space_type' AND e.enumlabel = 'DOG_SUITE'
  ) THEN
    ALTER TYPE pet_resort.space_type ADD VALUE 'DOG_SUITE';
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'pet_resort' AND t.typname = 'space_type' AND e.enumlabel = 'CAT_SUITE'
  ) THEN
    ALTER TYPE pet_resort.space_type ADD VALUE 'CAT_SUITE';
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'pet_resort' AND t.typname = 'space_type' AND e.enumlabel = 'SPA'
  ) THEN
    ALTER TYPE pet_resort.space_type ADD VALUE 'SPA';
  END IF;
END
$$;

INSERT INTO pet_resort.spaces (name, space_type, capacity, status, description)
VALUES
  ('Suite Canina 01', 'DOG_SUITE', 1, 'AVAILABLE', 'Suite individual de hotel canino'),
  ('Suite Canina 02', 'DOG_SUITE', 1, 'AVAILABLE', 'Suite individual de hotel canino'),
  ('Suite Canina 03', 'DOG_SUITE', 1, 'AVAILABLE', 'Suite individual de hotel canino'),
  ('Suite Canina 04', 'DOG_SUITE', 1, 'AVAILABLE', 'Suite individual de hotel canino'),
  ('Suite Canina 05', 'DOG_SUITE', 1, 'AVAILABLE', 'Suite individual de hotel canino'),
  ('Suite Felina 01', 'CAT_SUITE', 1, 'AVAILABLE', 'Suite individual de hotel felino'),
  ('Suite Felina 02', 'CAT_SUITE', 1, 'AVAILABLE', 'Suite individual de hotel felino'),
  ('Suite Felina 03', 'CAT_SUITE', 1, 'AVAILABLE', 'Suite individual de hotel felino'),
  ('Suite Felina 04', 'CAT_SUITE', 1, 'AVAILABLE', 'Suite individual de hotel felino'),
  ('Suite Felina 05', 'CAT_SUITE', 1, 'AVAILABLE', 'Suite individual de hotel felino'),
  ('Patio Canino 01', 'RECREATION', 3, 'AVAILABLE', 'Patio de guardería y recreación para perros'),
  ('Patio Felino 01', 'RECREATION', 3, 'AVAILABLE', 'Patio de guardería y recreación para gatos'),
  ('Cabina de Spa & Estética 01', 'SPA', 1, 'AVAILABLE', 'Cabina de baño, corte y spa relajante')
ON CONFLICT (name) DO UPDATE
SET
  space_type = EXCLUDED.space_type,
  capacity = EXCLUDED.capacity,
  status = 'AVAILABLE',
  description = EXCLUDED.description,
  updated_at = NOW();

CREATE TABLE IF NOT EXISTS pet_resort.reviews (
  review_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id BIGINT NOT NULL UNIQUE REFERENCES pet_resort.users(user_id) ON DELETE CASCADE,
  rating SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
