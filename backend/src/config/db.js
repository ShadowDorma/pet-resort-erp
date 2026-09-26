const { Pool } = require('pg');

const resolveSchema = () => {
  const value = process.env.DB_SCHEMA || 'pet_resort';
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(value)) {
    throw new Error('DB_SCHEMA inválido');
  }
  return value;
};

const schema = resolveSchema();

const useSsl =
  Boolean(process.env.DATABASE_URL) &&
  process.env.PGSSLMODE !== 'disable' &&
  !/localhost|127\.0\.0\.1/i.test(process.env.DATABASE_URL);

const pool = process.env.DATABASE_URL
  ? new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: useSsl ? { rejectUnauthorized: false } : undefined,
      options: `-c search_path=${schema},public`,
    })
  : new Pool({
      host: process.env.DB_HOST,
      port: Number(process.env.DB_PORT) || 5432,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
      options: `-c search_path=${schema},public`,
    });

pool.on('connect', (client) => {
  client.query(`SET search_path TO ${schema}, public`);
});

pool.on('error', (err) => {
  console.error('Error inesperado en el pool de PostgreSQL:', err);
});

const query = (text, params) => pool.query(text, params);

const getClient = async () => {
  const client = await pool.connect();
  await client.query(`SET search_path TO ${schema}, public`);
  return client;
};

module.exports = {
  pool,
  query,
  getClient,
  schema,
};
