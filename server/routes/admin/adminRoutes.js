import express from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import supabase, { getSupabaseAdmin } from '../../supabaseAdmin.js';
import { db } from '../../database.js';

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret';

function normalizeRole(value) {
  if (!value) return null;
  if (typeof value === 'string') return value.toUpperCase();
  if (typeof value === 'object') {
    return String(value.name || value.role_name || '').toUpperCase() || null;
  }
  return String(value).toUpperCase() || null;
}

async function resolveUserRole({ authUserId, profileId, jwtRole, metadataRole }) {
  const candidates = [jwtRole, metadataRole];

  try {
    const supabaseAdmin = getSupabaseAdmin();

    if (authUserId) {
      const byAuthId = await supabaseAdmin
        .from('users')
        .select('id, role, role_id, full_name, email, status, auth_id, address, clearance_path, clearance_name, created_at')
        .eq('auth_id', authUserId)
        .maybeSingle();

      if (byAuthId.data) {
        const roleName =
          normalizeRole(byAuthId.data.role) ||
          (byAuthId.data.role_id
            ? normalizeRole(
                (await supabaseAdmin.from('roles').select('name').eq('id', byAuthId.data.role_id).maybeSingle()).data?.name
              )
            : null);

        return {
          ok: true,
          profile: { ...byAuthId.data, role: roleName },
          roleName,
        };
      }
    }

    if (profileId) {
      const byProfileId = await supabaseAdmin
        .from('users')
        .select('id, role, role_id, full_name, email, status, auth_id, address, clearance_path, clearance_name, created_at')
        .eq('id', profileId)
        .maybeSingle();

      if (byProfileId.data) {
        const roleName =
          normalizeRole(byProfileId.data.role) ||
          (byProfileId.data.role_id
            ? normalizeRole(
                (await supabaseAdmin.from('roles').select('name').eq('id', byProfileId.data.role_id).maybeSingle()).data?.name
              )
            : null);

        return {
          ok: true,
          profile: { ...byProfileId.data, role: roleName },
          roleName,
        };
      }
    }
  } catch (error) {
    console.warn('Supabase profile lookup failed:', error.message);
  }

  try {
    const sqliteUser = profileId
      ? await db.get(
          `SELECT users.*, roles.name AS role_name
           FROM users
           LEFT JOIN roles ON roles.id = users.role_id
           WHERE users.id = ?`,
          [profileId]
        )
      : null;

    if (sqliteUser) {
      return {
        ok: true,
        profile: {
          id: sqliteUser.id,
          role: sqliteUser.role_name || sqliteUser.role,
          full_name: sqliteUser.full_name,
          email: sqliteUser.email,
          status: sqliteUser.status,
          auth_id: sqliteUser.auth_id,
        },
        roleName: normalizeRole(sqliteUser.role_name || sqliteUser.role),
      };
    }
  } catch (error) {
    console.warn('SQLite profile lookup failed:', error.message);
  }

  const roleName = normalizeRole(candidates.find(Boolean));
  if (!roleName) {
    return { ok: false, roleName: null, profile: null };
  }

  return {
    ok: true,
    roleName,
    profile: profileId ? { id: profileId, role: roleName } : null,
  };
}

async function requireAdmin(req, res) {
  const authorization = req.headers.authorization || '';
  const accessToken = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';

  if (!accessToken) {
    return { ok: false, status: 401, message: 'Authentication required.' };
  }

  let authUserId = null;
  let profileId = null;
  let jwtRole = null;
  let metadataRole = null;
  let tokenValid = false;

  try {
    const supabaseAdmin = getSupabaseAdmin();
    const { data: requester, error: requesterError } = await supabaseAdmin.auth.getUser(accessToken);

    if (!requesterError && requester?.user) {
      authUserId = requester.user.id;
      metadataRole = requester.user.user_metadata?.role;
      tokenValid = true;
    } else if (requesterError) {
      console.warn('Supabase getUser failed:', requesterError.message);
    }
  } catch (error) {
    console.warn('Supabase token verification failed:', error.message);
  }

  if (!tokenValid) {
    try {
      const decoded = jwt.verify(accessToken, JWT_SECRET);
      jwtRole = decoded.role;
      profileId = decoded.id;
      authUserId = decoded.authId || null;
      tokenValid = true;
    } catch (error) {
      console.warn('JWT verification failed:', error.message);
      return { ok: false, status: 401, message: 'Your session has expired. Please log in again.' };
    }
  }

  const resolved = await resolveUserRole({
    authUserId,
    profileId,
    jwtRole,
    metadataRole,
  });

  console.log('requireAdmin resolve:', {
    authUserId,
    profileId,
    jwtRole,
    metadataRole,
    resolvedRole: resolved.roleName,
    resolvedOk: resolved.ok,
    profileEmail: resolved.profile?.email || null,
  });

  if (!resolved.ok || resolved.roleName !== 'ADMIN') {
    return { ok: false, status: 403, message: 'Admin access required.' };
  }

  return {
    ok: true,
    adminProfile: resolved.profile,
    roleName: resolved.roleName,
    authUserId,
  };
}

function sendAuthError(res, authResult) {
  return res.status(authResult.status).json({ message: authResult.message });
}

async function listUsersFromSupabase(statusFilter) {
  const supabaseAdmin = getSupabaseAdmin();

  // Full column set first; on schema drift (missing column on older
  // projects) retry with a minimal set instead of failing over to stale
  // SQLite rows without anyone noticing.
  const fullSelect = 'id, full_name, email, address, status, clearance_path, clearance_name, auth_id, created_at, role, role_id';
  const minimalSelect = 'id, full_name, email, status, auth_id, created_at, role, role_id';

  let users;
  try {
    let query = supabaseAdmin.from('users').select(fullSelect).order('created_at', { ascending: false });
    if (statusFilter) query = query.eq('status', statusFilter);
    const { data, error } = await query;
    if (error) throw error;
    users = data;
  } catch (fullError) {
    console.warn('Supabase user list (full columns) failed, retrying minimal:', fullError.message);
    let query = supabaseAdmin.from('users').select(minimalSelect).order('created_at', { ascending: false });
    if (statusFilter) query = query.eq('status', statusFilter);
    const { data, error } = await query;
    if (error) throw error;
    users = data;
  }

  if (!users || users.length === 0) {
    return [];
  }

  const roleIds = [...new Set((users || []).map((u) => u.role_id).filter(Boolean))];
  const roleNameMap = new Map();

  if (roleIds.length > 0) {
    const { data: roleRows } = await supabaseAdmin.from('roles').select('id, name').in('id', roleIds);
    for (const roleRow of roleRows || []) {
      roleNameMap.set(roleRow.id, roleRow.name);
    }
  }

  return (users || []).map((u) => ({
    ...u,
    role: normalizeRole(u.role) || normalizeRole(roleNameMap.get(u.role_id)) || 'CITIZEN',
  }));
}

async function listUsersFromSQLite(statusFilter) {
  const rows = await db.all(
    `SELECT users.id, users.full_name, users.email, users.status, users.auth_id, users.created_at, roles.name AS role_name
     FROM users
     LEFT JOIN roles ON roles.id = users.role_id
     ORDER BY users.created_at DESC`
  );

  const mapped = (rows || []).map((u) => ({
    ...u,
    role: normalizeRole(u.role_name) || 'CITIZEN',
    address: null,
    clearance_path: null,
    clearance_name: null,
  }));

  return statusFilter ? mapped.filter((u) => u.status === statusFilter) : mapped;
}

router.get('/dashboard', async (req, res) => {
  const authResult = await requireAdmin(req, res);
  if (!authResult.ok) {
    return sendAuthError(res, authResult);
  }

  let stats = {
    total_users: 0,
    pending_verifications: 0,
    total_complaints: 0,
    resolved_complaints: 0,
  };
  let byRole = [];

  try {
    const users = await listUsersFromSupabase();
    stats.total_users = users.length;
    stats.pending_verifications = users.filter((u) => u.status === 'PENDING_VERIFICATION').length;

    const byRoleMap = new Map();
    for (const u of users) {
      const roleName = normalizeRole(u.role) || 'CITIZEN';
      byRoleMap.set(roleName, (byRoleMap.get(roleName) || 0) + 1);
    }
    byRole = [...byRoleMap.entries()].map(([role, count]) => ({ role, count }));

    const { count: totalComplaints } = await supabase.from('complaints').select('*', { count: 'exact', head: true });
    const { count: resolvedComplaints } = await supabase
      .from('complaints')
      .select('*', { count: 'exact', head: true })
      .in('status', ['RESOLVED', 'CLOSED']);

    stats.total_complaints = totalComplaints || 0;
    stats.resolved_complaints = resolvedComplaints || 0;
  } catch (error) {
    console.warn('Supabase dashboard stats failed, trying SQLite:', error.message);
    const users = await listUsersFromSQLite();
    stats.total_users = users.length;
    stats.pending_verifications = users.filter((u) => u.status === 'PENDING_VERIFICATION').length;

    const byRoleMap = new Map();
    for (const u of users) {
      const roleName = normalizeRole(u.role) || 'CITIZEN';
      byRoleMap.set(roleName, (byRoleMap.get(roleName) || 0) + 1);
    }
    byRole = [...byRoleMap.entries()].map(([role, count]) => ({ role, count }));
  }

  res.json({ stats, byRole });
});

router.get('/users', async (req, res) => {
  const authResult = await requireAdmin(req, res);
  if (!authResult.ok) {
    return sendAuthError(res, authResult);
  }

  const { status } = req.query;

  if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
    try {
      const users = await listUsersFromSupabase(status);
      return res.json({ users, source: 'supabase' });
    } catch (error) {
      console.error('Supabase user list failed, falling back to SQLite:', error.message);
    }
  } else {
    console.warn('SUPABASE_SERVICE_ROLE_KEY missing, serving user list from SQLite.');
  }

  const users = await listUsersFromSQLite(status);
  return res.json({ users, source: 'sqlite' });
});

router.put('/users/:id', async (req, res) => {
  const authResult = await requireAdmin(req, res);
  if (!authResult.ok) {
    return sendAuthError(res, authResult);
  }

  const { fullName, email, role, status, modifiedBy } = req.body || {};

  const { data: user } = await supabase.from('users').select('*').eq('id', req.params.id).single();
  if (!user) {
    return res.status(404).json({ message: 'User not found.' });
  }

  let roleId = user.role_id;
  let roleValue = user.role;
  if (role) {
    const { data: roleRow } = await supabase.from('roles').select('id').eq('name', role).single();
    if (roleRow) {
      roleId = roleRow.id;
      roleValue = roleRow.name;
    } else {
      roleValue = role;
    }
  }

  const nextStatus = status || user.status || 'ACTIVE';

  const updatePayload = {
    full_name: fullName || user.full_name,
    email: email || user.email,
    status: nextStatus,
    updated_at: new Date().toISOString(),
  };

  if (roleId !== undefined && roleId !== null) {
    updatePayload.role_id = roleId;
  }
  if (roleValue) {
    updatePayload.role = roleValue;
  }

  await supabase.from('users').update(updatePayload).eq('id', req.params.id);

  await supabase.from('system_logs').insert({
    user_id: modifiedBy || authResult.adminProfile?.id || null,
    action: 'USER_UPDATED',
    target_record: `user_${req.params.id}`,
    details: { role: roleValue || role, status: nextStatus },
  });

  res.json({ message: 'User updated successfully.' });
});

router.put('/users/:id/verification', async (req, res) => {
  const authResult = await requireAdmin(req, res);
  if (!authResult.ok) {
    return sendAuthError(res, authResult);
  }

  const { status, modifiedBy } = req.body || {};

  if (!['ACTIVE', 'REJECTED'].includes(status)) {
    return res.status(400).json({ message: 'Verification status must be ACTIVE or REJECTED.' });
  }

  const supabaseAdmin = getSupabaseAdmin();

  const { data: citizen, error: citizenError } = await supabaseAdmin
    .from('users')
    .select('id, role, role_id, full_name')
    .eq('id', req.params.id)
    .single();

  if (citizenError || !citizen) {
    return res.status(404).json({ message: 'User not found.' });
  }

  let citizenRole = normalizeRole(citizen.role);
  if (!citizenRole && citizen.role_id) {
    const { data: roleRow } = await supabaseAdmin.from('roles').select('name').eq('id', citizen.role_id).single();
    citizenRole = normalizeRole(roleRow?.name);
  }

  if (citizenRole && citizenRole !== 'CITIZEN') {
    return res.status(400).json({ message: 'Only citizen registrations can be verified.' });
  }

  const { error: updateError } = await supabaseAdmin
    .from('users')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', req.params.id);

  if (updateError) {
    return res.status(500).json({ message: updateError.message });
  }

  await supabaseAdmin.from('system_logs').insert({
    user_id: modifiedBy || authResult.adminProfile?.id || null,
    action: status === 'ACTIVE' ? 'CITIZEN_APPROVED' : 'CITIZEN_REJECTED',
    target_record: `user_${req.params.id}`,
    details: { status, citizen_name: citizen.full_name },
  });

  try {
    await supabaseAdmin.from('notifications').insert({
      user_id: citizen.id,
      title: status === 'ACTIVE' ? 'Account Approved' : 'Registration Rejected',
      message:
        status === 'ACTIVE'
          ? 'Your Barangay Saray account has been verified. You may now log in.'
          : 'Your registration was rejected. Please contact the Barangay Saray administrator or re-register with a valid Barangay Clearance.',
      is_read: false,
    });
  } catch (notifyError) {
    console.warn('Failed to notify citizen:', notifyError.message);
  }

  return res.json({ message: `Citizen ${status === 'ACTIVE' ? 'approved' : 'rejected'} successfully.` });
});

router.post('/users', async (req, res) => {
  const authResult = await requireAdmin(req, res);
  if (!authResult.ok) {
    return sendAuthError(res, authResult);
  }

  const { fullName, email, password, role, createdBy } = req.body || {};

  if (!fullName || !email || !password) {
    return res.status(400).json({ message: 'Full name, email, and password are required.' });
  }

  const { data: existingUser } = await supabase.from('users').select('id').eq('email', email).single();
  if (existingUser) {
    return res.status(409).json({ message: 'User already exists.' });
  }

  const { data, error } = await supabase.auth.signUp({
    email: email.trim(),
    password,
    options: {
      data: {
        full_name: fullName.trim(),
        name: fullName.trim(),
        role: (role || 'CITIZEN').toUpperCase(),
      },
    },
  });

  if (error) {
    return res.status(400).json({ message: error.message });
  }

  await supabase.from('system_logs').insert({
    user_id: createdBy || authResult.adminProfile?.id || null,
    action: 'USER_CREATED',
    target_record: `user_${data.user.id}`,
    details: { role },
  });

  return res.status(201).json({ message: 'User created successfully.', userId: data.user.id });
});

router.post('/supabase-users', async (req, res) => {
  const authResult = await requireAdmin(req, res);
  if (!authResult.ok) {
    return sendAuthError(res, authResult);
  }

  const { fullName, email, password, role } = req.body || {};

  if (!fullName || !email || !password || !role) {
    return res.status(400).json({ message: 'Full name, email, password, and role are required.' });
  }

  if (!['TANOD', 'OFFICIAL', 'LUPON'].includes(String(role).toUpperCase())) {
    return res.status(400).json({ message: 'Invalid barangay staff role.' });
  }

  try {
    const supabaseAdmin = getSupabaseAdmin();

    const { data: created, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email: email.trim(),
      password,
      email_confirm: true,
      user_metadata: {
        full_name: fullName.trim(),
        name: fullName.trim(),
        role: String(role).toUpperCase(),
      },
    });

    if (createError) {
      return res.status(400).json({ message: createError.message });
    }

    const { data: roleRow } = await supabaseAdmin.from('roles').select('id').eq('name', String(role).toUpperCase()).maybeSingle();

    const { error: profileUpsertError } = await supabaseAdmin
      .from('users')
      .upsert({
        auth_id: created.user.id,
        full_name: fullName.trim(),
        email: email.trim(),
        role: String(role).toUpperCase(),
        role_id: roleRow?.id || null,
        status: 'ACTIVE',
      }, { onConflict: 'email' });

    if (profileUpsertError) {
      await supabaseAdmin.auth.admin.deleteUser(created.user.id);
      return res.status(500).json({
        message: `Auth user was created but the profile could not be saved: ${profileUpsertError.message}`,
      });
    }

    return res.status(201).json({ message: 'Supabase user created successfully.', userId: created.user.id });
  } catch (error) {
    console.error('Supabase user creation error:', error);
    return res.status(500).json({ message: error.message || 'Failed to create Supabase user.' });
  }
});

router.get('/logs', async (req, res) => {
  const authResult = await requireAdmin(req, res);
  if (!authResult.ok) {
    return sendAuthError(res, authResult);
  }

  try {
    const { data: logs } = await supabase
      .from('system_logs')
      .select('*, user:users(full_name)')
      .order('created_at', { ascending: false })
      .limit(100);

    const mapped = (logs || []).map((l) => ({
      ...l,
      user_name: l.user?.full_name || null,
    }));

    return res.json({ logs: mapped });
  } catch (error) {
    console.warn('Supabase logs failed, trying SQLite:', error.message);
    const logs = await db.all(
      `SELECT system_logs.*, users.full_name AS user_name
       FROM system_logs
       LEFT JOIN users ON users.id = system_logs.user_id
       ORDER BY system_logs.created_at DESC
       LIMIT 100`
    );
    return res.json({ logs: logs || [] });
  }
});

router.post('/sync-user', async (req, res) => {
  const { authId, email, fullName, role, status } = req.body || {};

  if (!authId || !email) {
    return res.status(400).json({ message: 'authId and email are required.' });
  }

  try {
    const { data: existing } = await supabase.from('users').select('id, status, role').eq('auth_id', authId).single();

    if (existing) {
      const updatePayload = {
        email,
        full_name: fullName || email,
        role: role || existing.role || 'CITIZEN',
        updated_at: new Date().toISOString(),
      };

      if (status && !(String(role || '').toUpperCase() === 'CITIZEN' && existing.status === 'PENDING_VERIFICATION')) {
        updatePayload.status = status;
      }

      await supabase.from('users').update(updatePayload).eq('auth_id', authId);
      res.json({ message: 'User synced.', userId: existing.id });
    } else {
      const { data: newUser, error } = await supabase
        .from('users')
        .insert({
          full_name: fullName || email,
          email,
          role: role || 'CITIZEN',
          auth_id: authId,
          status: status || 'ACTIVE',
        })
        .select('id')
        .single();

      if (error) {
        return res.status(500).json({ message: error.message });
      }

      res.status(201).json({ message: 'User created.', userId: newUser.id });
    }
  } catch (error) {
    console.error('Sync user error:', error);
    res.status(500).json({ message: 'Failed to sync user.' });
  }
});

router.get('/complaints', async (req, res) => {
  const authResult = await requireAdmin(req, res);
  if (!authResult.ok) {
    return sendAuthError(res, authResult);
  }

  try {
    const { data: complaints } = await supabase
      .from('complaints')
      .select('*, category:complaint_categories(name), channel:channels(name), citizen:users!complaints_citizen_id_fkey(full_name), assignee:users!complaints_assigned_to_fkey(full_name)')
      .order('created_at', { ascending: false });

    const mapped = (complaints || []).map((c) => ({
      ...c,
      category_name: c.category?.name || null,
      channel_name: c.channel?.name || null,
      citizen_name: c.citizen?.full_name || null,
      assigned_name: c.assignee?.full_name || null,
    }));

    return res.json({ complaints: mapped });
  } catch (error) {
    console.warn('Supabase complaints failed, trying SQLite:', error.message);
    const complaints = await db.all(`
      SELECT c.*, cat.name AS category_name, ch.name AS channel_name, u.full_name AS citizen_name
      FROM complaints c
      LEFT JOIN complaint_categories cat ON cat.id = c.category_id
      LEFT JOIN channels ch ON ch.id = c.channel_id
      LEFT JOIN users u ON u.id = c.citizen_id
      ORDER BY c.created_at DESC
    `);
    return res.json({ complaints: complaints || [] });
  }
});

router.get('/channels', async (req, res) => {
  const authResult = await requireAdmin(req, res);
  if (!authResult.ok) {
    return sendAuthError(res, authResult);
  }

  try {
    const { data: channels } = await supabase
      .from('channels')
      .select('*')
      .order('created_at', { ascending: false });

    const mapped = [];
    for (const ch of channels || []) {
      const { count } = await supabase.from('complaints').select('*', { count: 'exact', head: true }).eq('channel_id', ch.id);
      mapped.push({ ...ch, complaint_count: count || 0 });
    }

    return res.json({ channels: mapped });
  } catch (error) {
    console.warn('Supabase channels failed, trying SQLite:', error.message);
    const channels = await db.all('SELECT * FROM channels ORDER BY created_at DESC');
    const mapped = [];
    for (const ch of channels || []) {
      const countRow = await db.get('SELECT COUNT(*) AS count FROM complaints WHERE channel_id = ?', [ch.id]);
      mapped.push({ ...ch, complaint_count: countRow?.count || 0 });
    }
    return res.json({ channels: mapped });
  }
});

router.post('/channels', async (req, res) => {
  const authResult = await requireAdmin(req, res);
  if (!authResult.ok) {
    return sendAuthError(res, authResult);
  }

  const { name, description, createdBy } = req.body || {};

  if (!name || !name.trim()) {
    return res.status(400).json({ message: 'Channel name is required.' });
  }

  const { data: existing } = await supabase.from('channels').select('id').eq('name', name.trim()).single();
  if (existing) {
    return res.status(409).json({ message: 'Channel already exists.' });
  }

  const { data: newChannel, error } = await supabase
    .from('channels')
    .insert({ name: name.trim(), description: description || '' })
    .select('id')
    .single();

  if (error) {
    return res.status(500).json({ message: error.message });
  }

  await supabase.from('system_logs').insert({
    user_id: createdBy || authResult.adminProfile?.id || null,
    action: 'CHANNEL_CREATED',
    target_record: `channel_${newChannel.id}`,
    details: { name: name.trim() },
  });

  res.status(201).json({ message: 'Channel created.', channelId: newChannel.id });
});

router.put('/channels/:id', async (req, res) => {
  const authResult = await requireAdmin(req, res);
  if (!authResult.ok) {
    return sendAuthError(res, authResult);
  }

  const { name, description, modifiedBy } = req.body || {};

  const { data: channel } = await supabase.from('channels').select('id').eq('id', req.params.id).single();
  if (!channel) {
    return res.status(404).json({ message: 'Channel not found.' });
  }

  if (name && name.trim()) {
    const { data: duplicate } = await supabase.from('channels').select('id').eq('name', name.trim()).neq('id', req.params.id).single();
    if (duplicate) {
      return res.status(409).json({ message: 'Channel name already exists.' });
    }
  }

  await supabase.from('channels').update({
    name: name?.trim() || '',
    description: description || '',
    updated_at: new Date().toISOString(),
  }).eq('id', req.params.id);

  await supabase.from('system_logs').insert({
    user_id: modifiedBy || authResult.adminProfile?.id || null,
    action: 'CHANNEL_UPDATED',
    target_record: `channel_${req.params.id}`,
    details: { name, description },
  });

  res.json({ message: 'Channel updated.' });
});

router.delete('/channels/:id', async (req, res) => {
  const authResult = await requireAdmin(req, res);
  if (!authResult.ok) {
    return sendAuthError(res, authResult);
  }

  const { data: channel } = await supabase.from('channels').select('id').eq('id', req.params.id).single();
  if (!channel) {
    return res.status(404).json({ message: 'Channel not found.' });
  }

  const { count: complaintsUsing } = await supabase.from('complaints').select('*', { count: 'exact', head: true }).eq('channel_id', req.params.id);

  if ((complaintsUsing || 0) > 0) {
    return res.status(400).json({ message: `Cannot delete: ${complaintsUsing} complaint(s) use this channel.` });
  }

  await supabase.from('channels').delete().eq('id', req.params.id);

  await supabase.from('system_logs').insert({
    user_id: authResult.adminProfile?.id || null,
    action: 'CHANNEL_DELETED',
    target_record: `channel_${req.params.id}`,
    details: {},
  });

  res.json({ message: 'Channel deleted.' });
});

router.get('/assignable-users', async (req, res) => {
  const authResult = await requireAdmin(req, res);
  if (!authResult.ok) {
    return sendAuthError(res, authResult);
  }

  try {
    const { data: users } = await supabase
      .from('users')
      .select('id, full_name, email, auth_id, role, role_id')
      .order('full_name');

    const roleIds = [...new Set((users || []).map((u) => u.role_id).filter(Boolean))];
    const roleNameMap = new Map();
    if (roleIds.length > 0) {
      const { data: roleRows } = await supabase.from('roles').select('id, name').in('id', roleIds);
      for (const roleRow of roleRows || []) {
        roleNameMap.set(roleRow.id, roleRow.name);
      }
    }

    const mapped = (users || [])
      .map((u) => ({
        ...u,
        role: normalizeRole(u.role) || normalizeRole(roleNameMap.get(u.role_id)),
      }))
      .filter((u) => ['TANOD', 'LUPON'].includes(u.role));

    return res.json({ users: mapped });
  } catch (error) {
    console.warn('Supabase assignable users failed, trying SQLite:', error.message);
    const users = await db.all(
      `SELECT users.id, users.full_name, users.email, users.auth_id, roles.name AS role
       FROM users
       JOIN roles ON roles.id = users.role_id
       WHERE roles.name IN ('TANOD', 'LUPON')
       ORDER BY users.full_name`
    );
    return res.json({ users: users || [] });
  }
});

router.put('/complaints/:id/assign', async (req, res) => {
  const authResult = await requireAdmin(req, res);
  if (!authResult.ok) {
    return sendAuthError(res, authResult);
  }

  const { assignedTo, assignedBy } = req.body || {};

  const { data: complaint } = await supabase.from('complaints').select('id, title, citizen_id').eq('id', req.params.id).single();
  if (!complaint) {
    return res.status(404).json({ message: 'Complaint not found.' });
  }

  const { data: assignee } = await supabase.from('users').select('id, full_name').eq('id', assignedTo).single();
  if (!assignee) {
    return res.status(404).json({ message: 'Assignee not found.' });
  }

  await supabase.from('complaints').update({
    assigned_to: assignedTo,
    status: 'ASSIGNED',
    updated_at: new Date().toISOString(),
  }).eq('id', req.params.id);

  await supabase.from('system_logs').insert({
    user_id: assignedBy || authResult.adminProfile?.id || null,
    action: 'COMPLAINT_ASSIGNED',
    target_record: `complaint_${req.params.id}`,
    details: { assigned_to: assignedTo, assigned_name: assignee.full_name },
  });

  try {
    await supabase.from('notifications').insert({
      user_id: assignedTo,
      title: 'New Complaint Assigned',
      message: `You have been assigned a complaint: "${complaint?.title || 'Untitled'}".`,
      is_read: false,
    });

    if (complaint.citizen_id) {
      await supabase.from('notifications').insert({
        user_id: complaint.citizen_id,
        title: 'Complaint Assigned',
        message: `Your complaint "${complaint?.title || 'Untitled'}" has been assigned to ${assignee.full_name}.`,
        is_read: false,
      });
    }
  } catch (notifyError) {
    console.warn('Failed to send assignment notifications:', notifyError.message);
  }

  res.json({ message: `Complaint assigned to ${assignee.full_name}.` });
});

export default router;
