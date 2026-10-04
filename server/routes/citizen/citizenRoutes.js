import express from 'express';
import supabase from '../../supabaseAdmin.js';
import { triageComplaint } from '../../../src/lib/triageService.js';

const router = express.Router();

router.get('/channels', async (_req, res) => {
  const { data: channels } = await supabase.from('channels').select('id, name, description').order('name');
  res.json({ channels: channels || [] });
});

router.get('/categories', async (_req, res) => {
  const { data: categories } = await supabase.from('complaint_categories').select('id, name, description').order('name');
  res.json({ categories: categories || [] });
});

router.get('/complaints', async (req, res) => {
  const { authId } = req.query;

  let query = supabase
    .from('complaints')
    .select('*, category:complaint_categories(name), channel:channels(name), citizen:users!complaints_citizen_id_fkey(full_name), assignee:users!complaints_assigned_to_fkey(full_name)')
    .order('created_at', { ascending: false });

  if (authId) {
    const { data: user } = await supabase.from('users').select('id').eq('auth_id', authId).single();
    if (user) {
      query = query.eq('citizen_id', user.id);
    }
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

router.get('/complaints/:id/ratings', async (req, res) => {
  const { data: ratings } = await supabase
    .from('service_ratings')
    .select('*, user:users(full_name)')
    .eq('complaint_id', req.params.id)
    .order('created_at', { ascending: false });

  const mapped = (ratings || []).map((r) => ({
    ...r,
    user_name: r.user?.full_name || null,
  }));

  res.json({ ratings: mapped });
});

router.post('/complaints/:id/rate', async (req, res) => {
  const { userId, rating, feedback } = req.body || {};

  if (!userId || !rating) {
    return res.status(400).json({ message: 'userId and rating are required.' });
  }

  if (rating < 1 || rating > 5) {
    return res.status(400).json({ message: 'Rating must be between 1 and 5.' });
  }

  const { data: complaint } = await supabase.from('complaints').select('id').eq('id', req.params.id).single();
  if (!complaint) {
    return res.status(404).json({ message: 'Complaint not found.' });
  }

  const { data: existing } = await supabase
    .from('service_ratings')
    .select('id')
    .eq('complaint_id', req.params.id)
    .eq('user_id', userId)
    .single();

  if (existing) {
    await supabase.from('service_ratings').update({ rating, feedback: feedback || '', created_at: new Date().toISOString() }).eq('id', existing.id);
    res.json({ message: 'Rating updated successfully.' });
  } else {
    await supabase.from('service_ratings').insert({ complaint_id: Number(req.params.id), user_id: userId, rating, feedback: feedback || '' });
    res.status(201).json({ message: 'Rating submitted successfully.' });
  }
});

router.post('/complaints', async (req, res) => {
  const { citizenId, authId, title, description, channel, categoryName, priority } = req.body || {};

  if (!description) {
    return res.status(400).json({ message: 'Description is required.' });
  }

  let resolvedCitizenId = citizenId;

  if (authId && !citizenId) {
    const { data: user } = await supabase.from('users').select('id').eq('auth_id', authId).single();
    if (user) {
      resolvedCitizenId = user.id;
    }
  }

  if (!resolvedCitizenId) {
    return res.status(400).json({ message: 'Citizen is required.' });
  }

  const { data: channelRow } = await supabase.from('channels').select('id').eq('name', channel || 'Online form').single();
  const { data: categoryRow } = await supabase.from('complaint_categories').select('id').eq('name', categoryName || 'Public Safety').single();

  const triage = triageComplaint(description);
  const complaintId = `CMP-${Date.now()}`;

  const { data: complaint, error } = await supabase
    .from('complaints')
    .insert({
      citizen_id: resolvedCitizenId,
      complaint_id: complaintId,
      title: title || 'Complaint',
      description,
      category_id: categoryRow?.id || null,
      priority: priority || triage.priority,
      status: 'SUBMITTED',
      channel_id: channelRow?.id || null,
    })
    .select()
    .single();

  if (error) {
    return res.status(500).json({ message: 'Failed to create complaint.', error: error.message });
  }

  await supabase.from('triage_results').insert({
    complaint_id: complaint.id,
    category_id: categoryRow?.id || null,
    suggested_priority: triage.priority,
    confidence: triage.confidence,
    model_type: 'Naive Bayes',
  });

  const { data: admins } = await supabase
    .from('users')
    .select('id, role, role_id')
    .eq('status', 'ACTIVE');

  const adminUsers = (admins || []).filter((u) => String(u.role || '').toUpperCase() === 'ADMIN');
  if ((admins || []).length > 0 && adminUsers.length === 0) {
    // Role stored only via role_id on some projects: resolve names for the candidates.
    const { data: roleRows } = await supabase.from('roles').select('id, name');
    const adminRoleIds = new Set(
      (roleRows || []).filter((r) => String(r.name).toUpperCase() === 'ADMIN').map((r) => r.id)
    );
    for (const u of admins) {
      if (u.role_id && adminRoleIds.has(u.role_id)) adminUsers.push(u);
    }
  }
  for (const admin of adminUsers) {
    await supabase.from('notifications').insert({
      user_id: admin.id,
      title: `New Complaint: ${title || 'Complaint'}`,
      message: 'A new complaint has been submitted for review.',
      is_read: false,
    });
  }

  res.status(201).json({ message: 'Complaint submitted successfully.', complaint, triage });
});

router.delete('/complaints/:id', async (req, res) => {
  const { data: complaint } = await supabase.from('complaints').select('id').eq('id', req.params.id).single();
  if (!complaint) {
    return res.status(404).json({ message: 'Complaint not found.' });
  }

  await supabase.from('triage_results').delete().eq('complaint_id', req.params.id);
  await supabase.from('service_ratings').delete().eq('complaint_id', req.params.id);
  await supabase.from('remarks').delete().eq('complaint_id', req.params.id);
  await supabase.from('hearings').delete().eq('complaint_id', req.params.id);
  await supabase.from('system_logs').delete().eq('target_record', `complaint_${req.params.id}`);
  await supabase.from('complaints').delete().eq('id', req.params.id);

  return res.json({ message: 'Complaint deleted successfully.' });
});

router.get('/hearings/:complaintId', async (req, res) => {
  const { data: hearings } = await supabase
    .from('hearings')
    .select('*')
    .eq('complaint_id', req.params.complaintId)
    .order('created_at', { ascending: false });

  res.json({ hearings: hearings || [] });
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
