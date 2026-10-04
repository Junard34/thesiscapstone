import express from 'express';
import { db } from '../database.js';
import { triageComplaint } from '../../src/lib/triageService.js';

const router = express.Router();

router.get('/', async (_req, res) => {
  const complaints = await db.all(`
    SELECT c.*, cat.name AS category_name, ch.name AS channel_name, u.full_name AS citizen_name
    FROM complaints c
    LEFT JOIN complaint_categories cat ON cat.id = c.category_id
    LEFT JOIN channels ch ON ch.id = c.channel_id
    LEFT JOIN users u ON u.id = c.citizen_id
    ORDER BY c.created_at DESC
  `);

  res.json({ complaints });
});

router.get('/:id', async (req, res) => {
  const complaint = await db.get(`
    SELECT c.*, cat.name AS category_name, ch.name AS channel_name, u.full_name AS citizen_name
    FROM complaints c
    LEFT JOIN complaint_categories cat ON cat.id = c.category_id
    LEFT JOIN channels ch ON ch.id = c.channel_id
    LEFT JOIN users u ON u.id = c.citizen_id
    WHERE c.id = ?
  `, [req.params.id]);

  if (!complaint) {
    return res.status(404).json({ message: 'Complaint not found.' });
  }

  return res.json({ complaint });
});

router.post('/', async (req, res) => {
  const { citizenId, title, description, channel, categoryName, priority } = req.body || {};

  if (!citizenId || !description) {
    return res.status(400).json({ message: 'Citizen and description are required.' });
  }

  const channelRow = await db.get(`SELECT id FROM channels WHERE name = ?`, [channel || 'Online form']);
  const categoryRow = await db.get(`SELECT id FROM complaint_categories WHERE name = ?`, [categoryName || 'Public Safety']);

  const triage = triageComplaint(description);
  const complaintId = `CMP-${Date.now()}`;

  const result = await db.run(
    `INSERT INTO complaints (citizen_id, complaint_id, title, description, category_id, priority, status, channel_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, 'SUBMITTED', ?, datetime('now'), datetime('now'))`,
    [citizenId, complaintId, title || 'Complaint', description, categoryRow?.id || null, priority || triage.priority, channelRow?.id || null]
  );

  const complaint = await db.get(`SELECT * FROM complaints WHERE id = ?`, [result.lastID]);

  await db.run(
    `INSERT INTO triage_results (complaint_id, category_id, suggested_priority, confidence, model_type, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'Naive Bayes', datetime('now'), datetime('now'))`,
    [complaint.id, categoryRow?.id || null, triage.priority, triage.confidence]
  );

  res.status(201).json({ message: 'Complaint submitted successfully.', complaint, triage });
});

router.delete('/:id', async (req, res) => {
  const complaint = await db.get(`SELECT id FROM complaints WHERE id = ?`, [req.params.id]);

  if (!complaint) {
    return res.status(404).json({ message: 'Complaint not found.' });
  }

  await db.run(`DELETE FROM triage_results WHERE complaint_id = ?`, [req.params.id]);
  await db.run(`DELETE FROM remarks WHERE complaint_id = ?`, [req.params.id]);
  await db.run(`DELETE FROM hearings WHERE complaint_id = ?`, [req.params.id]);
  await db.run(`DELETE FROM system_logs WHERE target_record = ?`, [`complaint_${req.params.id}`]);
  await db.run(`DELETE FROM complaints WHERE id = ?`, [req.params.id]);

  return res.json({ message: 'Complaint deleted successfully.' });
});

router.put('/:id/status', async (req, res) => {
  const { status } = req.body || {};
  const complaint = await db.get(`SELECT id FROM complaints WHERE id = ?`, [req.params.id]);

  if (!complaint) {
    return res.status(404).json({ message: 'Complaint not found.' });
  }

  await db.run(`UPDATE complaints SET status = ?, updated_at = datetime('now') WHERE id = ?`, [status, req.params.id]);
  return res.json({ message: 'Complaint status updated.' });
});

router.post('/:id/remarks', async (req, res) => {
  const { userId, userRole, remarkText, actionType } = req.body || {};

  if (!userId || !remarkText) {
    return res.status(400).json({ message: 'User and remark text are required.' });
  }

  await db.run(
    `INSERT INTO remarks (complaint_id, user_id, user_role, remark_text, action_type, created_at)
     VALUES (?, ?, ?, ?, ?, datetime('now'))`,
    [req.params.id, userId, userRole || 'OFFICIAL', remarkText, actionType || 'UPDATE']
  );

  res.status(201).json({ message: 'Remark added successfully.' });
});

router.get('/:id/remarks', async (req, res) => {
  const remarks = await db.all(
    `SELECT r.*, u.full_name AS user_name FROM remarks r
     LEFT JOIN users u ON u.id = r.user_id
     WHERE r.complaint_id = ?
     ORDER BY r.created_at DESC`,
    [req.params.id]
  );

  res.json({ remarks });
});

router.put('/:id/assign', async (req, res) => {
  const { assignedTo, userId, userRole } = req.body || {};
  const complaint = await db.get(`SELECT id FROM complaints WHERE id = ?`, [req.params.id]);

  if (!complaint) {
    return res.status(404).json({ message: 'Complaint not found.' });
  }

  await db.run(
    `UPDATE complaints SET assigned_to = ?, status = 'ASSIGNED', updated_at = datetime('now') WHERE id = ?`,
    [assignedTo, req.params.id]
  );

  await db.run(
    `INSERT INTO system_logs (user_id, action, target_record, details, created_at)
     VALUES (?, 'COMPLAINT_ASSIGNED', ?, ?, datetime('now'))`,
    [userId, `complaint_${req.params.id}`, JSON.stringify({ assigned_to: assignedTo, role: userRole })]
  );

  res.json({ message: 'Complaint assigned successfully.' });
});

router.put('/:id/priority', async (req, res) => {
  const { priority, userId, userRole, reason } = req.body || {};
  const complaint = await db.get(`SELECT priority FROM complaints WHERE id = ?`, [req.params.id]);

  if (!complaint) {
    return res.status(404).json({ message: 'Complaint not found.' });
  }

  await db.run(
    `UPDATE complaints SET priority = ?, updated_at = datetime('now') WHERE id = ?`,
    [priority, req.params.id]
  );

  await db.run(
    `INSERT INTO system_logs (user_id, action, target_record, details, created_at)
     VALUES (?, 'PRIORITY_CHANGED', ?, ?, datetime('now'))`,
    [userId, `complaint_${req.params.id}`, JSON.stringify({ old_priority: complaint.priority, new_priority: priority, reason })]
  );

  res.json({ message: 'Priority updated successfully.' });
});

router.post('/:id/hearings', async (req, res) => {
  const { scheduledDate, scheduledTime, location, notes, userId, userRole } = req.body || {};

  if (!scheduledDate || !scheduledTime) {
    return res.status(400).json({ message: 'Date and time are required.' });
  }

  const result = await db.run(
    `INSERT INTO hearings (complaint_id, scheduled_date, scheduled_time, location, notes, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 'SCHEDULED', datetime('now'), datetime('now'))`,
    [req.params.id, scheduledDate, scheduledTime, location || '', notes || '']
  );

  await db.run(
    `UPDATE complaints SET status = 'FOR HEARING / MEDIATION', updated_at = datetime('now') WHERE id = ?`,
    [req.params.id]
  );

  await db.run(
    `INSERT INTO system_logs (user_id, action, target_record, details, created_at)
     VALUES (?, 'HEARING_CREATED', ?, ?, datetime('now'))`,
    [userId, `complaint_${req.params.id}`, JSON.stringify({ date: scheduledDate, time: scheduledTime, location })]
  );

  res.status(201).json({ message: 'Hearing scheduled successfully.', hearingId: result.lastID });
});

router.get('/:id/hearings', async (req, res) => {
  const hearings = await db.all(
    `SELECT * FROM hearings WHERE complaint_id = ? ORDER BY created_at DESC`,
    [req.params.id]
  );

  res.json({ hearings });
});

router.put('/:complaintId/hearings/:hearingId', async (req, res) => {
  const { status, notes, result, userId, userRole } = req.body || {};

  const hearing = await db.get(`SELECT * FROM hearings WHERE id = ? AND complaint_id = ?`, [req.params.hearingId, req.params.complaintId]);
  if (!hearing) {
    return res.status(404).json({ message: 'Hearing not found.' });
  }

  await db.run(
    `UPDATE hearings SET status = ?, notes = ?, updated_at = datetime('now') WHERE id = ?`,
    [status, notes || hearing.notes, req.params.hearingId]
  );

  if (result) {
    await db.run(
      `UPDATE complaints SET resolution = ?, status = 'RESOLVED', updated_at = datetime('now') WHERE id = ?`,
      [result, req.params.complaintId]
    );
  }

  await db.run(
    `INSERT INTO system_logs (user_id, action, target_record, details, created_at)
     VALUES (?, 'HEARING_UPDATED', ?, ?, datetime('now'))`,
    [userId, `hearing_${req.params.hearingId}`, JSON.stringify({ status, result })]
  );

  res.json({ message: 'Hearing updated successfully.' });
});

export default router;
