import express from 'express';
import supabase from '../../supabaseAdmin.js';

const router = express.Router();

router.get('/complaints', async (req, res) => {
  const { unassigned } = req.query;

  let query = supabase
    .from('complaints')
    .select('*, category:complaint_categories(name), channel:channels(name), citizen:users!complaints_citizen_id_fkey(full_name), assignee:users!complaints_assigned_to_fkey(full_name)')
    .order('created_at', { ascending: false });

  if (unassigned === 'true') {
    query = query.is('assigned_to', null);
  }

  const { data: complaints } = await query;

  const mapped = (complaints || []).map((c) => ({
    ...c,
    category_name: c.category?.name || null,
    channel_name: c.channel?.name || null,
    citizen_name: c.citizen?.full_name || null,
    assigned_name: c.assignee?.full_name || null,
  }));

  res.json({ complaints: mapped });
});

router.get('/complaints/:id', async (req, res) => {
  const { data: complaint, error } = await supabase
    .from('complaints')
    .select('*, category:complaint_categories(name), channel:channels(name), citizen:users!complaints_citizen_id_fkey(full_name), assignee:users!complaints_assigned_to_fkey(full_name)')
    .eq('id', req.params.id)
    .single();

  if (error || !complaint) {
    return res.status(404).json({ message: 'Complaint not found.' });
  }

  const mapped = {
    ...complaint,
    category_name: complaint.category?.name || null,
    channel_name: complaint.channel?.name || null,
    citizen_name: complaint.citizen?.full_name || null,
    assigned_name: complaint.assignee?.full_name || null,
  };

  res.json({ complaint: mapped });
});

router.put('/complaints/:id', async (req, res) => {
  const { priority, status, userId, userRole } = req.body || {};

  const { data: complaint } = await supabase
    .from('complaints')
    .select('id, title, citizen_id, priority')
    .eq('id', req.params.id)
    .single();

  if (!complaint) {
    return res.status(404).json({ message: 'Complaint not found.' });
  }

  if (priority !== undefined) {
    await supabase.from('complaints').update({
      priority,
      updated_at: new Date().toISOString(),
    }).eq('id', req.params.id);

    await supabase.from('system_logs').insert({
      user_id: userId,
      action: 'PRIORITY_CHANGED',
      target_record: `complaint_${req.params.id}`,
      details: { old_priority: complaint.priority, new_priority: priority },
    });
  }

  if (status !== undefined) {
    await supabase.from('complaints').update({
      status,
      updated_at: new Date().toISOString(),
    }).eq('id', req.params.id);

    await supabase.from('system_logs').insert({
      user_id: userId,
      action: 'COMPLAINT_STATUS_CHANGED',
      target_record: `complaint_${req.params.id}`,
      details: { status },
    });
  }

  res.json({ message: 'Complaint updated successfully.' });
});

router.post('/complaints/:id/remarks', async (req, res) => {
  const { userId, userRole, remarkText, actionType } = req.body || {};

  if (!userId || !remarkText) {
    return res.status(400).json({ message: 'User and remark text are required.' });
  }

  await supabase.from('remarks').insert({
    complaint_id: Number(req.params.id),
    user_id: userId,
    user_role: userRole || 'OFFICIAL',
    remark_text: remarkText,
    action_type: actionType || 'UPDATE',
  });

  res.status(201).json({ message: 'Remark added successfully.' });
});

router.get('/complaints/:id/remarks', async (req, res) => {
  const { data: remarks } = await supabase
    .from('remarks')
    .select('*, user:users(full_name)')
    .eq('complaint_id', req.params.id)
    .order('created_at', { ascending: false });

  const mapped = (remarks || []).map((r) => ({
    ...r,
    user_name: r.user?.full_name || null,
  }));

  res.json({ remarks: mapped });
});

router.get('/hearings/:complaintId', async (req, res) => {
  const { data: hearings } = await supabase
    .from('hearings')
    .select('*')
    .eq('complaint_id', req.params.complaintId)
    .order('created_at', { ascending: false });

  res.json({ hearings: hearings || [] });
});

router.get('/channels', async (_req, res) => {
  const { data: channels } = await supabase
    .from('channels')
    .select('*')
    .order('name');

  const mapped = [];
  for (const ch of channels || []) {
    const { count } = await supabase.from('complaints').select('*', { count: 'exact', head: true }).eq('channel_id', ch.id);
    mapped.push({ ...ch, complaint_count: count || 0 });
  }

  res.json({ channels: mapped });
});

router.get('/reports', async (_req, res) => {
  const { count: totalComplaints } = await supabase.from('complaints').select('*', { count: 'exact', head: true });

  const { data: allComplaints } = await supabase.from('complaints').select('status, priority, category:complaint_categories(name), channel:channels(name)');

  const byStatus = {};
  const byPriority = {};
  const byCategory = {};
  const byChannel = {};

  for (const c of allComplaints || []) {
    byStatus[c.status] = (byStatus[c.status] || 0) + 1;
    byPriority[c.priority] = (byPriority[c.priority] || 0) + 1;
    const catName = c.category?.name || 'Uncategorized';
    byCategory[catName] = (byCategory[catName] || 0) + 1;
    const chName = c.channel?.name || 'Unknown';
    byChannel[chName] = (byChannel[chName] || 0) + 1;
  }

  res.json({
    totalComplaints: totalComplaints || 0,
    byStatus: Object.entries(byStatus).map(([status, count]) => ({ status, count })),
    byPriority: Object.entries(byPriority).map(([priority, count]) => ({ priority, count })),
    byCategory: Object.entries(byCategory).map(([category, count]) => ({ category, count })),
    byChannel: Object.entries(byChannel).map(([channel, count]) => ({ channel, count })),
  });
});

router.get('/notifications/:userId', async (req, res) => {
  const { data: notifications } = await supabase
    .from('notifications')
    .select('*')
    .eq('user_id', req.params.userId)
    .order('created_at', { ascending: false })
    .limit(50);

  res.json({ notifications: notifications || [] });
});

router.put('/notifications/:id/read', async (req, res) => {
  await supabase.from('notifications').update({ is_read: true }).eq('id', req.params.id);
  res.json({ message: 'Notification marked as read.' });
});

router.put('/notifications/read-all', async (req, res) => {
  const { userId } = req.body || {};
  if (!userId) {
    return res.status(400).json({ message: 'userId is required.' });
  }
  await supabase.from('notifications').update({ is_read: true }).eq('user_id', userId);
  res.json({ message: 'All notifications marked as read.' });
});

export default router;
