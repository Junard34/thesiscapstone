import express from 'express';
import { db } from '../database.js';

const router = express.Router();

router.get('/summary', async (_req, res) => {
  const stats = await db.get(`
    SELECT 
      COUNT(*) AS total_complaints,
      SUM(CASE WHEN status != 'CLOSED' THEN 1 ELSE 0 END) AS open_cases,
      SUM(CASE WHEN status = 'RESOLVED' THEN 1 ELSE 0 END) AS resolved_cases
    FROM complaints
  `);

  const byStatus = await db.all(`
    SELECT status, COUNT(*) AS total
    FROM complaints
    GROUP BY status
  `);

  const byCategory = await db.all(`
    SELECT cat.name AS category, COUNT(c.id) AS total
    FROM complaint_categories cat
    LEFT JOIN complaints c ON c.category_id = cat.id
    GROUP BY cat.id, cat.name
  `);

  res.json({ stats, byStatus, byCategory });
});

export default router;
