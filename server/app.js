import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';
import dotenv from 'dotenv';
import authRoutes from './routes/authRoutes.js';
import adminRoutes from './routes/admin/adminRoutes.js';
import citizenRoutes from './routes/citizen/citizenRoutes.js';
import officialRoutes from './routes/official/officialRoutes.js';
import tanodRoutes from './routes/tanod/tanodRoutes.js';
import luponRoutes from './routes/lupon/luponRoutes.js';
import complaintRoutes from './routes/complaintRoutes.js';

dotenv.config();

const app = express();

app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '7mb' }));
app.use(cookieParser());
app.use(morgan('dev'));

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/citizen', citizenRoutes);
app.use('/api/official', officialRoutes);
app.use('/api/tanod', tanodRoutes);
app.use('/api/lupon', luponRoutes);
app.use('/api/complaints', complaintRoutes);

// Unknown /api routes -> JSON (so the client never parses an HTML 404 as a
// generic "Request failed with status code ...").
app.use('/api', (_req, res) => {
  res.status(404).json({ message: 'Not found.' });
});

// Global error handler -> always JSON. Body-parser errors (malformed JSON,
// payload too large) and unexpected crashes previously surfaced as HTML
// error pages, which axios reports without a message body.
 // eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  console.error('Unhandled API error:', err?.message || err);
  const status = err?.status || err?.statusCode || 500;
  res.status(status).json({
    message: err?.message || 'Internal server error.',
  });
});

export default app;
