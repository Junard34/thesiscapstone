import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import supabase, { getSupabaseAdmin, getSupabaseAnon } from '../supabaseAdmin.js';
import { db } from '../database.js';

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret';

async function loginWithSQLite(email, password) {
  const user = await db.get(
    `SELECT users.*, roles.name AS role_name
     FROM users
     JOIN roles ON roles.id = users.role_id
     WHERE LOWER(users.email) = LOWER(?)`,
    [email.trim()]
  );

  if (!user || !(await bcrypt.compare(password, user.password_hash))) {
    return null;
  }

  if (user.status !== 'ACTIVE') {
    const messages = {
      PENDING_VERIFICATION: 'Your account is pending Barangay Clearance verification.',
      REJECTED: 'Your registration was rejected. Please contact the Barangay Saray administrator.',
    };
    return {
      blocked: messages[user.status] || 'This account is not active.',
    };
  }

  return {
    token: jwt.sign(
      { id: user.id, email: user.email, role: user.role_name },
      JWT_SECRET,
      { expiresIn: '1d' }
    ),
    user: {
      id: user.id,
      profileId: user.id,
      authId: user.auth_id || null,
      fullName: user.full_name,
      email: user.email,
      role: String(user.role_name || user.role || 'CITIZEN').toUpperCase(),
      status: user.status,
    },
  };
}

router.post('/login', async (req, res) => {
  const { email, password } = req.body || {};

  if (typeof email !== 'string' || !email.trim() || typeof password !== 'string' || !password) {
    return res.status(400).json({ message: 'Email and password are required.' });
  }

  const cleanEmail = email.trim();

  // Password sign-in must go through the anon-key client. The admin
  // (service_role) client cannot reliably mint user sessions.
  const signInClient = (() => {
    try {
      return getSupabaseAnon();
    } catch {
      return getSupabaseAdmin();
    }
  })();

  try {
    let supabaseError = null;

    try {
      const { data, error } = await signInClient.auth.signInWithPassword({
        email: cleanEmail,
        password,
      });

      if (!error && data?.user) {
        if (!data.session?.access_token) {
          // Authenticated but no session (e.g. email confirmation pending).
          // Fall through to the SQLite fallback / 401 instead of crashing
          // on `data.session.access_token` (which used to surface as a 500).
          supabaseError = 'Login did not return a session. If you just registered, confirm your email first.';
        } else {
          const profile = await loadLoginProfile(data.user.id);

          const rawRole =
            profile?.roleName?.name ||
            profile?.role ||
            data.user.user_metadata?.role ||
            'CITIZEN';

          const roleName = String(rawRole || '').trim().toUpperCase() || 'CITIZEN';
          const profileStatus = profile?.status || 'ACTIVE';

          if (profileStatus !== 'ACTIVE') {
            const messages = {
              PENDING_VERIFICATION: 'Your account is pending Barangay Clearance verification.',
              REJECTED: 'Your registration was rejected. Please contact the Barangay Saray administrator.',
            };
            return res.status(403).json({ message: messages[profileStatus] || 'This account is not active.' });
          }

          return res.json({
            token: data.session.access_token,
            user: {
              id: data.user.id,
              profileId: profile?.id || null,
              authId: data.user.id,
              fullName: profile?.full_name || data.user.user_metadata?.full_name || '',
              email: data.user.email,
              role: roleName,
              status: profileStatus,
            },
          });
        }
      }

      supabaseError = error?.message || supabaseError || 'Supabase login failed.';
    } catch (supabaseException) {
      supabaseError = supabaseException.message;
      console.warn('Supabase login threw:', supabaseError);
    }

    // Fallback: local SQLite demo accounts (admin/citizen/tanod/official/lupon@example.com)
    try {
      const sqliteLogin = await loginWithSQLite(cleanEmail, password);
      if (sqliteLogin?.blocked) {
        return res.status(403).json({ message: sqliteLogin.blocked });
      }
      if (sqliteLogin) {
        console.log('Login via SQLite fallback for', cleanEmail);
        return res.json(sqliteLogin);
      }
    } catch (sqliteError) {
      console.warn('SQLite login fallback failed:', sqliteError.message);
    }

    console.warn('Login failed for', cleanEmail, '- Supabase:', supabaseError);
    return res.status(401).json({
      message: 'Invalid email or password.',
      detail: supabaseError || undefined,
    });
  } catch (error) {
    console.error('Login error:', error);
    return res.status(500).json({
      message: 'Login service is temporarily unavailable.',
      detail: error?.message || undefined,
    });
  }
});

// Load the public.users profile for a Supabase auth user. Tolerant of
// schema drift (e.g. missing `role`/`address` columns on older projects):
// falls back to a minimal column set, then resolves the role through
// roles.role_id when needed. Never throws — returns null when unavailable.
async function loadLoginProfile(authId) {
  const supabaseAdmin = getSupabaseAdmin();

  const fullSelect = 'id, full_name, email, role, role_id, status, address, auth_id, roleName:roles(name)';
  const minimalSelect = 'id, full_name, email, role_id, status, auth_id';

  let { data: profile, error } = await supabaseAdmin
    .from('users')
    .select(fullSelect)
    .eq('auth_id', authId)
    .maybeSingle();

  if (error) {
    console.warn('Login profile lookup (full) failed, retrying minimal:', error.message);
    const retry = await supabaseAdmin
      .from('users')
      .select(minimalSelect)
      .eq('auth_id', authId)
      .maybeSingle();
    profile = retry.data;
    if (retry.error) {
      console.warn('Login profile lookup (minimal) failed:', retry.error.message);
      return null;
    }
  }

  if (profile && !profile.role && profile.role_id) {
    const { data: roleRow } = await supabaseAdmin
      .from('roles')
      .select('name')
      .eq('id', profile.role_id)
      .maybeSingle();
    if (roleRow?.name) {
      profile.role = roleRow.name;
    }
  }

  return profile || null;
}

router.post('/register', async (req, res) => {
  const { fullName, email, password, address, clearance } = req.body || {};

  if (!fullName || !email || !password || !address || !clearance?.name || !clearance?.type || !clearance?.content) {
    return res.status(400).json({ message: 'Full name, email, password, address, and Barangay Clearance are required.' });
  }

  if (typeof clearance.name !== 'string' || typeof clearance.type !== 'string' || typeof clearance.content !== 'string') {
    return res.status(400).json({ message: 'Invalid Barangay Clearance file.' });
  }

  const allowedTypes = ['application/pdf', 'image/jpeg', 'image/png'];
  if (!allowedTypes.includes(clearance.type)) {
    return res.status(400).json({ message: 'Barangay Clearance must be a PDF, JPG, or PNG file.' });
  }

  let fileBuffer;
  try {
    fileBuffer = Buffer.from(clearance.content, 'base64');
  } catch {
    return res.status(400).json({ message: 'Invalid Barangay Clearance file.' });
  }

  if (!fileBuffer.length || fileBuffer.length > 5 * 1024 * 1024) {
    return res.status(400).json({ message: 'Barangay Clearance must be 5 MB or smaller.' });
  }

  const supabaseAdmin = getSupabaseAdmin();
  try {
    const { data, error } = await supabaseAdmin.auth.admin.createUser({
    email: email.trim(),
    password,
    email_confirm: true,
    user_metadata: {
      full_name: fullName.trim(),
      name: fullName.trim(),
      role: 'CITIZEN',
      address: address.trim(),
    },
  });

  if (error) {
    return res.status(400).json({ message: error.message });
  }

  if (!data?.user) {
    return res.status(500).json({ message: 'Registration failed.' });
  }

  const safeFileName = clearance.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const filePath = `${data.user.id}/${Date.now()}-${safeFileName}`;
  const { error: uploadError } = await supabaseAdmin.storage
    .from('citizen-documents')
    .upload(filePath, fileBuffer, { contentType: clearance.type, upsert: false });

  if (uploadError) {
    await supabaseAdmin.auth.admin.deleteUser(data.user.id);
    return res.status(500).json({ message: `Could not store Barangay Clearance: ${uploadError.message}` });
  }

  const { error: profileError } = await supabaseAdmin.from('users').update({
    address: address.trim(),
    role: 'CITIZEN',
    status: 'PENDING_VERIFICATION',
    clearance_path: filePath,
    clearance_name: clearance.name,
    updated_at: new Date().toISOString(),
  }).eq('auth_id', data.user.id);

  if (profileError) {
    await supabaseAdmin.storage.from('citizen-documents').remove([filePath]);
    await supabaseAdmin.auth.admin.deleteUser(data.user.id);
    return res.status(500).json({ message: `Could not save verification details: ${profileError.message}` });
  }

  // Notify all active admins about the new pending registration.
  try {
    const { data: adminProfiles } = await supabaseAdmin
      .from('users')
      .select('id, role, status')
      .eq('status', 'ACTIVE');

    const adminIds = (adminProfiles || [])
      .filter((profile) => String(profile.role || '').toUpperCase() === 'ADMIN')
      .map((profile) => profile.id);

    if (adminIds.length > 0) {
      await supabaseAdmin.from('notifications').insert(
        adminIds.map((adminId) => ({
          user_id: adminId,
          title: 'New Registration Pending Approval',
          message: `${fullName.trim()} registered as a citizen and is awaiting Barangay Clearance verification.`,
          is_read: false,
        }))
      );
    }
  } catch (notifyError) {
    console.warn('Failed to notify admins about new registration:', notifyError.message);
  }

    return res.status(201).json({
      message: 'Registration submitted. Your account is pending verification.',
      userId: data.user.id,
      status: 'PENDING_VERIFICATION',
    });
  } catch (error) {
    console.error('Registration error:', error);
    return res.status(500).json({
      message: 'Registration service is temporarily unavailable.',
      detail: error?.message || undefined,
    });
  }
});

router.post('/logout', (_req, res) => {
  res.json({ message: 'Logged out successfully.' });
});

async function requireSupabaseAdmin(req, res) {
  const authorization = req.headers.authorization || '';
  const accessToken = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';

  if (!accessToken) {
    return { ok: false, status: 401, message: 'Authentication required.' };
  }

  let authUserId = null;
  let profileId = null;
  let jwtRole = null;
  let metadataRole = null;

  try {
    const supabaseAdmin = getSupabaseAdmin();
    const { data: requester, error: requesterError } = await supabaseAdmin.auth.getUser(accessToken);

    if (!requesterError && requester?.user) {
      authUserId = requester.user.id;
      metadataRole = requester.user.user_metadata?.role;
    }
  } catch (error) {
    console.warn('Supabase token verification failed:', error.message);
  }

  if (!authUserId) {
    try {
      const decoded = jwt.verify(accessToken, JWT_SECRET);
      jwtRole = decoded.role;
      profileId = decoded.id;
    } catch (error) {
      return { ok: false, status: 401, message: 'Invalid authentication.' };
    }
  }

  const normalize = (value) => (value ? String(value).toUpperCase() : null);

  let roleName = normalize(jwtRole) || normalize(metadataRole);
  let adminProfile = profileId ? { id: profileId, role: roleName } : null;

  try {
    const supabaseAdmin = getSupabaseAdmin();

    if (authUserId) {
      const { data: profile } = await supabaseAdmin
        .from('users')
        .select('id, role, role_id, full_name, email, status, auth_id')
        .eq('auth_id', authUserId)
        .maybeSingle();

      if (profile) {
        let profileRole = normalize(profile.role);
        if (!profileRole && profile.role_id) {
          const { data: roleRow } = await supabaseAdmin.from('roles').select('name').eq('id', profile.role_id).maybeSingle();
          profileRole = normalize(roleRow?.name);
        }
        roleName = profileRole || roleName;
        adminProfile = { ...profile, role: profileRole || roleName };
      }
    }

    if (!adminProfile && profileId) {
      const { data: profile } = await supabaseAdmin
        .from('users')
        .select('id, role, role_id, full_name, email, status, auth_id')
        .eq('id', profileId)
        .maybeSingle();

      if (profile) {
        let profileRole = normalize(profile.role);
        if (!profileRole && profile.role_id) {
          const { data: roleRow } = await supabaseAdmin.from('roles').select('name').eq('id', profile.role_id).maybeSingle();
          profileRole = normalize(roleRow?.name);
        }
        roleName = profileRole || roleName;
        adminProfile = { ...profile, role: profileRole || roleName };
      }
    }
  } catch (error) {
    console.warn('Supabase profile lookup failed:', error.message);
  }

  if (!adminProfile && profileId) {
    try {
      const sqliteUser = await db.get(
        `SELECT users.*, roles.name AS role_name
         FROM users
         LEFT JOIN roles ON roles.id = users.role_id
         WHERE users.id = ?`,
        [profileId]
      );
      if (sqliteUser) {
        roleName = normalize(sqliteUser.role_name || sqliteUser.role) || roleName;
        adminProfile = {
          id: sqliteUser.id,
          role: roleName,
          full_name: sqliteUser.full_name,
          email: sqliteUser.email,
          status: sqliteUser.status,
          auth_id: sqliteUser.auth_id,
        };
      }
    } catch (error) {
      console.warn('SQLite profile lookup failed:', error.message);
    }
  }

  if (roleName !== 'ADMIN') {
    return { ok: false, status: 403, message: 'Admin access required.' };
  }

  return { ok: true, adminProfile };
}

router.get('/users', async (req, res) => {
  const authResult = await requireSupabaseAdmin(req, res);
  if (!authResult.ok) {
    return res.status(authResult.status).json({ message: authResult.message });
  }

  const { data: users } = await supabase
    .from('users')
    .select('id, full_name, email, status, created_at, role:roles(name)')
    .order('created_at', { ascending: false });

  const mapped = (users || []).map((u) => ({
    ...u,
    role: u.role?.name || null,
  }));

  res.json({ users: mapped });
});

router.put('/users/:id', async (req, res) => {
  const authResult = await requireSupabaseAdmin(req, res);
  if (!authResult.ok) {
    return res.status(authResult.status).json({ message: authResult.message });
  }

  const { fullName, email, role, status, modifiedBy } = req.body || {};

  const { data: user } = await supabase.from('users').select('*').eq('id', req.params.id).single();
  if (!user) {
    return res.status(404).json({ message: 'User not found.' });
  }

  let roleId = user.role_id;
  if (role) {
    const { data: roleRow } = await supabase.from('roles').select('id').eq('name', role).single();
    if (roleRow) roleId = roleRow.id;
  }

  const nextStatus = status || user.status || 'ACTIVE';

  await supabase.from('users').update({
    full_name: fullName || user.full_name,
    email: email || user.email,
    status: nextStatus,
    role: role || user.role,
    updated_at: new Date().toISOString(),
  }).eq('id', req.params.id);

  await supabase.from('system_logs').insert({
    user_id: modifiedBy || authResult.adminProfile?.id || null,
    action: 'USER_UPDATED',
    target_record: `user_${req.params.id}`,
    details: { role, status: nextStatus },
  });

  res.json({ message: 'User updated successfully.' });
});

router.post('/users', async (req, res) => {
  const authResult = await requireSupabaseAdmin(req, res);
  if (!authResult.ok) {
    return res.status(authResult.status).json({ message: authResult.message });
  }

  const { fullName, email, password, role, createdBy } = req.body || {};

  if (!fullName || !email || !password) {
    return res.status(400).json({ message: 'Full name, email, and password are required.' });
  }

  const { data, error } = await supabase.auth.signUp({
    email: email.trim(),
    password,
    options: {
      data: {
        full_name: fullName.trim(),
        name: fullName.trim(),
        role: role || 'CITIZEN',
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
  const authResult = await requireSupabaseAdmin(req, res);
  if (!authResult.ok) {
    return res.status(authResult.status).json({ message: authResult.message });
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

    return res.status(201).json({ message: 'Supabase user created successfully.', userId: created.user.id });
  } catch (error) {
    console.error('Supabase user creation error:', error);
    return res.status(500).json({ message: error.message || 'Failed to create Supabase user.' });
  }
});

export default router;
