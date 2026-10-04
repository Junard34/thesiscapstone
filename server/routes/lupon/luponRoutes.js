import express from 'express';
import supabase from '../../supabaseAdmin.js';

const router = express.Router();

router.get('/complaints', async (req, res) => {
  const { authId, assigned } = req.query;

  let query = supabase
    .from('complaints')
    .select('*, category:complaint_categories(name), channel:channels(name), citizen:users!complaints_citizen_id_fkey(full_name), assignee:users!complaints_assigned_to_fkey(full_name)')
    .order('created_at', { ascending: false });

  if (assigned === 'true' && authId) {
    const { data: user } = await supabase.from('users').select('id').eq('auth_id', authId).single();
    if (user) {
      query = query.eq('assigned_to', user.id);
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

router.post('/complaints/:id/hearings', async (req, res) => {
  const { scheduledDate, scheduledTime, location, notes, userId, userRole } = req.body || {};

  if (!scheduledDate || !scheduledTime) {
    return res.status(400).json({ message: 'Date and time are required.' });
  }

  const { data: complaint } = await supabase
    .from('complaints')
    .select('id, title, citizen_id')
    .eq('id', req.params.id)
    .single();

  const { data: hearing, error } = await supabase
    .from('hearings')
    .insert({
      complaint_id: Number(req.params.id),
      scheduled_date: scheduledDate,
      scheduled_time: scheduledTime,
      location: location || '',
      notes: notes || '',
      status: 'SCHEDULED',
    })
    .select('id')
    .single();

  if (error) {
    return res.status(500).json({ message: error.message });
  }

  await supabase.from('complaints').update({
    status: 'FOR HEARING / MEDIATION',
    updated_at: new Date().toISOString(),
  }).eq('id', req.params.id);

  await supabase.from('system_logs').insert({
    user_id: userId,
    action: 'HEARING_CREATED',
    target_record: `complaint_${req.params.id}`,
    details: { date: scheduledDate, time: scheduledTime, location },
  });

  if (complaint?.citizen_id) {
    await supabase.from('notifications').insert({
      user_id: complaint.citizen_id,
      title: 'Hearing Scheduled',
      message: `A hearing has been scheduled for your complaint "${complaint.title || 'Complaint'}" on ${scheduledDate} at ${scheduledTime}.`,
      is_read: false,
    });
  }

  res.status(201).json({ message: 'Hearing scheduled successfully.', hearingId: hearing.id });
});

router.get('/complaints/:id/hearings', async (req, res) => {
  const { data: hearings } = await supabase
    .from('hearings')
    .select('*')
    .eq('complaint_id', req.params.id)
    .order('created_at', { ascending: false });

  res.json({ hearings: hearings || [] });
});

router.put('/complaints/:complaintId/hearings/:hearingId', async (req, res) => {
  const { status, notes, result, userId, userRole } = req.body || {};

  const { data: hearing } = await supabase
    .from('hearings')
    .select('*')
    .eq('id', req.params.hearingId)
    .eq('complaint_id', req.params.complaintId)
    .single();

  if (!hearing) {
    return res.status(404).json({ message: 'Hearing not found.' });
  }

  await supabase.from('hearings').update({
    status,
    notes: notes || hearing.notes,
    updated_at: new Date().toISOString(),
  }).eq('id', req.params.hearingId);

  const { data: complaint } = await supabase
    .from('complaints')
    .select('id, title, citizen_id')
    .eq('id', req.params.complaintId)
    .single();

  if (result) {
    await supabase.from('complaints').update({
      resolution: result,
      status: 'RESOLVED',
      updated_at: new Date().toISOString(),
    }).eq('id', req.params.complaintId);

    if (complaint?.citizen_id) {
      await supabase.from('notifications').insert({
        user_id: complaint.citizen_id,
        title: 'Complaint Resolved',
        message: `Your complaint "${complaint.title || 'Complaint'}" has been resolved. ${result}`,
        is_read: false,
      });
    }
  }

  await supabase.from('system_logs').insert({
    user_id: userId,
    action: 'HEARING_UPDATED',
    target_record: `hearing_${req.params.hearingId}`,
    details: { status, result },
  });

  res.json({ message: 'Hearing updated successfully.' });
});

router.post('/complaints/:id/remarks', async (req, res) => {
  const { userId, userRole, remarkText, actionType } = req.body || {};

  if (!userId || !remarkText) {
    return res.status(400).json({ message: 'User and remark text are required.' });
  }

  await supabase.from('remarks').insert({
    complaint_id: Number(req.params.id),
    user_id: userId,
    user_role: userRole || 'LUPON',
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
