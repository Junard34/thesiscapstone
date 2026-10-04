import express from 'express';
import { db } from '../database.js';

const router = express.Router();

router.get('/user/:userId', async (req, res) => {
  const notifications = await db.all(
    `SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 50`,
    [req.params.userId]
  );

  res.json({ notifications });
});

router.post('/', async (req, res) => {
  const { userId, title, message } = req.body || {};

  if (!userId || !title || !message) {
    return res.status(400).json({ message: 'User ID, title, and message are required.' });
  }

  const result = await db.run(
    `INSERT INTO notifications (user_id, title, message, is_read, created_at)
     VALUES (?, ?, ?, 0, datetime('now'))`,
    [userId, title, message]
  );

  res.status(201).json({ message: 'Notification created.', notificationId: result.lastID });
});

router.put('/:id/read', async (req, res) => {
  const notification = await db.get(`SELECT id FROM notifications WHERE id = ?`, [req.params.id]);

  if (!notification) {
    return res.status(404).json({ message: 'Notification not found.' });
  }

  await db.run(`UPDATE notifications SET is_read = 1 WHERE id = ?`, [req.params.id]);

  res.json({ message: 'Notification marked as read.' });
});

export default router;
