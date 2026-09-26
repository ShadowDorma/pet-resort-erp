require('dotenv').config();

const path = require('path');
const fs = require('fs');
const express = require('express');
const cors = require('cors');
const { pool, schema } = require('./config/db');
const authRoutes = require('./routes/authRoutes');
const petRoutes = require('./routes/petRoutes');
const serviceRoutes = require('./routes/serviceRoutes');
const bookingRoutes = require('./routes/bookingRoutes');
const adminRoutes = require('./routes/adminRoutes');
const staffRoutes = require('./routes/staffRoutes');
const userRoutes = require('./routes/userRoutes');
const spaceRoutes = require('./routes/spaceRoutes');
const receptionRoutes = require('./routes/receptionRoutes');
const caretakerRoutes = require('./routes/caretakerRoutes');
const stylistRoutes = require('./routes/stylistRoutes');
const reviewRoutes = require('./routes/reviewRoutes');
const notificationRoutes = require('./routes/notificationRoutes');
const { ensureBookingSupportTables } = require('./controllers/bookingController');
const { ensureRbacSchema } = require('./config/ensureSchema');

const app = express();
const PORT = process.env.PORT || 5000;
const publicDir = path.join(__dirname, '..', 'public');
const spaIndex = path.join(publicDir, 'index.html');
const corsOrigins = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(',').map((item) => item.trim()).filter(Boolean)
  : true;

app.set('trust proxy', 1);
app.use(cors({ origin: corsOrigins }));
app.use(express.json({ limit: '5mb' }));

app.use('/api/auth', authRoutes);
app.use('/api/pets', petRoutes);
app.use('/api/services', serviceRoutes);
app.use('/api/bookings', bookingRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/staff', staffRoutes);
app.use('/api/users', userRoutes);
app.use('/api/spaces', spaceRoutes);
app.use('/api/reception', receptionRoutes);
app.use('/api/caretaker', caretakerRoutes);
app.use('/api/stylist', stylistRoutes);
app.use('/api/reviews', reviewRoutes);
app.use('/api/notifications', notificationRoutes);

app.get('/health', async (_req, res) => {
  try {
    const result = await pool.query('SELECT current_schema() AS schema, now() AS timestamp');
    return res.status(200).json({
      status: 'ok',
      schema: result.rows[0].schema,
      timestamp: result.rows[0].timestamp,
    });
  } catch (error) {
    console.error('Error al verificar la base de datos:', error.message);
    return res.status(500).json({
      status: 'error',
      message: 'No se pudo conectar a PostgreSQL',
    });
  }
});

if (fs.existsSync(spaIndex)) {
  app.use(express.static(publicDir, { index: false, maxAge: '1h' }));
}

app.use((req, res, next) => {
  if (!fs.existsSync(spaIndex)) {
    return next();
  }
  if (req.path.startsWith('/api') || req.path === '/health') {
    return next();
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return next();
  }
  return res.sendFile(spaIndex);
});

app.use((_req, res) => {
  res.status(404).json({ message: 'Ruta no encontrada' });
});

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ message: 'Error interno del servidor' });
});

const start = async () => {
  try {
    if (process.env.NODE_ENV === 'production' && !process.env.JWT_SECRET) {
      throw new Error('JWT_SECRET es obligatorio en producción');
    }
    await pool.query(`SET search_path TO ${schema}, public`);
    await pool.query(`SELECT 1`);
    await ensureRbacSchema();
    await ensureBookingSupportTables();

    app.listen(PORT, '0.0.0.0', () => {
      console.log(`Servidor Pet Resort escuchando en el puerto ${PORT}`);
      console.log(`Esquema PostgreSQL por defecto: ${schema}`);
    });
  } catch (error) {
    console.error('No fue posible iniciar el servidor:', error.message);
    process.exit(1);
  }
};

start();
