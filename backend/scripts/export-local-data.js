const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const { Client } = require('pg');

const OUT = path.resolve(__dirname, '../../migracion_datos_locales.sql');

const SKIP_TABLES = new Set([
  'user_sessions',
  'password_reset_tokens',
  'permissions',
  'role_permissions',
  'establishment',
  'staff_availability',
  'audit_log',
  'notifications',
  'care_tasks',
  'care_logs',
  'service_logs',
  'service_records',
  'reviews',
  'lodgings',
]);

const TABLE_ORDER = [
  'roles',
  'users',
  'user_roles',
  'service_categories',
  'services',
  'service_price_history',
  'spaces',
  'business_hours',
  'pets',
  'pet_care_instructions',
  'bookings',
  'booking_items',
  'recreation_sessions',
  'appointments',
  'space_occupancy',
];

const NUMERIC_TYPES = new Set([
  'smallint',
  'integer',
  'bigint',
  'numeric',
  'real',
  'double precision',
]);

const sqlLiteral = (value, dataType, udtName, columnName) => {
  if (value === null || value === undefined) return 'NULL';
  if (columnName === 'photo_url' && String(value).startsWith('data:')) return 'NULL';
  if (Buffer.isBuffer(value)) return `'\\x${value.toString('hex')}'`;
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
  if (typeof value === 'bigint') return String(value);
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : 'NULL';
  if (value instanceof Date) {
    if (String(dataType).includes('timestamp')) return `'${value.toISOString()}'`;
    return `'${value.toISOString().slice(0, 10)}'`;
  }
  if (Array.isArray(value)) {
    const inner = value
      .map((item) => sqlLiteral(item, dataType, udtName, columnName))
      .join(', ');
    return `ARRAY[${inner}]`;
  }
  if (typeof value === 'object') {
    return `'${JSON.stringify(value).replace(/'/g, "''")}'::jsonb`;
  }

  const type = String(dataType || '').toLowerCase();
  if (NUMERIC_TYPES.has(type) && /^-?\d+(\.\d+)?$/.test(String(value))) {
    return String(value);
  }

  const text = String(value).replace(/'/g, "''");
  if (type.includes('timestamp')) return `'${text}'`;
  if (type === 'date') return `'${text}'`;
  if (type === 'time' || type === 'time without time zone') return `'${text}'`;
  if (udtName === 'citext') return `'${text}'`;
  if (type === 'USER-DEFINED' || type === 'user-defined') {
    return `'${text}'::pet_resort.${udtName}`;
  }
  return `'${text}'`;
};

const run = async () => {
  const client = new Client({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT) || 5432,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  });

  await client.connect();
  await client.query('SET search_path TO pet_resort, public');

  const tablesRes = await client.query(
    `
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'pet_resort' AND table_type = 'BASE TABLE'
      ORDER BY table_name
    `
  );
  const existing = new Set(
    tablesRes.rows.map((row) => row.table_name).filter((name) => !SKIP_TABLES.has(name))
  );
  const ordered = TABLE_ORDER.filter((name) => existing.has(name));

  const lines = ['SET search_path TO pet_resort, public;', ''];

  for (const table of ordered) {
    const colsRes = await client.query(
      `
        SELECT column_name, data_type, udt_name, is_identity, is_generated
        FROM information_schema.columns
        WHERE table_schema = 'pet_resort' AND table_name = $1
        ORDER BY ordinal_position
      `,
      [table]
    );

    const columns = colsRes.rows.filter((col) => col.is_generated !== 'ALWAYS');
    if (!columns.length) continue;

    const colNames = columns.map((col) => col.column_name);
    const hasIdentity = columns.some((col) => col.is_identity === 'YES');
    const data = await client.query(
      `SELECT ${colNames.map((name) => `"${name}"`).join(', ')} FROM "${table}"`
    );
    if (!data.rowCount) continue;

    const overriding = hasIdentity ? ' OVERRIDING SYSTEM VALUE' : '';
    lines.push(`-- ${table}`);

    for (const row of data.rows) {
      if (table === 'spaces' && String(row.status).toUpperCase() === 'INACTIVE') continue;
      const values = columns
        .map((col) =>
          sqlLiteral(row[col.column_name], col.data_type, col.udt_name, col.column_name)
        )
        .join(', ');
      lines.push(
        `INSERT INTO ${table} (${colNames.join(', ')})${overriding} VALUES (${values});`
      );
    }

    const identityCol = columns.find((col) => col.is_identity === 'YES');
    if (identityCol) {
      lines.push(
        `SELECT setval(pg_get_serial_sequence('pet_resort.${table}', '${identityCol.column_name}'), (SELECT MAX(${identityCol.column_name}) FROM ${table}));`
      );
    }
    lines.push('');
  }

  fs.writeFileSync(OUT, `${lines.join('\n').trim()}\n`, 'utf8');
  console.log(`Escrito ${OUT} (${fs.statSync(OUT).size} bytes)`);
  await client.end();
};

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
