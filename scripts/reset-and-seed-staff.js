import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config();

// Wipes all users + transactional data, then seeds:
// 1 admin + 8 officials + 12 tanods + 12 lupon (33 accounts).
const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required in .env');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const STAFF_PASSWORD = 'Saray2026!';

const SEED_USERS = [
  { fullName: 'Admin User', email: 'admin@example.com', password: 'password123', role: 'ADMIN' },
  ...Array.from({ length: 8 }, (_, i) => ({
    fullName: `Barangay Official ${i + 1}`,
    email: `official${i + 1}@example.com`,
    password: STAFF_PASSWORD,
    role: 'OFFICIAL',
  })),
  ...Array.from({ length: 12 }, (_, i) => ({
    fullName: `Barangay Tanod ${i + 1}`,
    email: `tanod${i + 1}@example.com`,
    password: STAFF_PASSWORD,
    role: 'TANOD',
  })),
  ...Array.from({ length: 12 }, (_, i) => ({
    fullName: `Lupon Member ${i + 1}`,
    email: `lupon${i + 1}@example.com`,
    password: STAFF_PASSWORD,
    role: 'LUPON',
  })),
];

async function wipeTable(table) {
  const { error, count } = await supabase.from(table).delete().neq('id', -1);
  if (error) {
    console.warn(`Wipe ${table} via neq failed (${error.message}), trying row-by-row...`);
    const { data: rows, error: selectError } = await supabase.from(table).select('id');
    if (selectError) throw new Error(`Failed to list ${table}: ${selectError.message}`);
    let deleted = 0;
    for (const row of rows || []) {
      const { error: delError } = await supabase.from(table).delete().eq('id', row.id);
      if (!delError) deleted += 1;
    }
    console.log(`Wiped ${table}: ${deleted} row(s).`);
  } else {
    console.log(`Wiped ${table}${typeof count === 'number' ? `: ${count} row(s)` : ''}.`);
  }
}

async function listAllAuthUsers() {
  const users = [];
  let page = 1;
  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 100 });
    if (error) throw new Error(`Failed to list auth users: ${error.message}`);
    users.push(...(data?.users || []));
    if (!data?.users || data.users.length < 100) break;
    page += 1;
  }
  return users;
}

async function wipeAll() {
  console.log('--- WIPE (data tables first for FK safety) ---');
  for (const table of [
    'service_ratings',
    'remarks',
    'hearings',
    'triage_results',
    'complaints',
    'notifications',
    'system_logs',
    'users',
  ]) {
    await wipeTable(table);
  }

  const authUsers = await listAllAuthUsers();
  console.log(`Found ${authUsers.length} auth user(s).`);
  let deleted = 0;
  for (const user of authUsers) {
    const { error } = await supabase.auth.admin.deleteUser(user.id);
    if (error) {
      console.warn(`Failed to delete auth ${user.email || user.id}: ${error.message}`);
    } else {
      deleted += 1;
    }
  }
  console.log(`Deleted ${deleted} auth user(s).`);
}

async function seedAll() {
  console.log('\n--- SEED (33 accounts) ---');
  const { data: roleRows, error: roleError } = await supabase.from('roles').select('id, name');
  if (roleError) throw new Error(`Failed to load roles: ${roleError.message}`);
  const roleMap = new Map((roleRows || []).map((r) => [String(r.name).toUpperCase(), r.id]));

  let ok = 0;
  for (const seed of SEED_USERS) {
    const { data: created, error: createError } = await supabase.auth.admin.createUser({
      email: seed.email,
      password: seed.password,
      email_confirm: true,
      user_metadata: { full_name: seed.fullName, name: seed.fullName, role: seed.role },
    });
    if (createError) {
      console.warn(`Auth create failed for ${seed.email}: ${createError.message}`);
      continue;
    }
    const { error: upsertError } = await supabase.from('users').upsert(
      {
        auth_id: created.user.id,
        full_name: seed.fullName,
        email: seed.email,
        role: seed.role,
        role_id: roleMap.get(seed.role) || null,
        status: 'ACTIVE',
      },
      { onConflict: 'email' },
    );
    if (upsertError) {
      console.warn(`Profile upsert failed for ${seed.email}: ${upsertError.message}`);
      continue;
    }
    ok += 1;
  }
  console.log(`Seeded ${ok}/${SEED_USERS.length} accounts.`);
}

async function verify() {
  console.log('\n--- VERIFY ---');
  const { data: profiles } = await supabase
    .from('users')
    .select('id, email, role, status, auth_id')
    .order('email');
  const missingAuth = (profiles || []).filter((p) => !p.auth_id);
  const inactive = (profiles || []).filter((p) => p.status !== 'ACTIVE');
  console.log(`Profiles: ${(profiles || []).length} (missing auth_id: ${missingAuth.length}, non-ACTIVE: ${inactive.length})`);

  // Spot-check login through the anon key for one account per role.
  const anon = createClient(supabaseUrl, process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY);
  for (const email of ['admin@example.com', 'official1@example.com', 'tanod1@example.com', 'lupon1@example.com']) {
    const seed = SEED_USERS.find((s) => s.email === email);
    const { data, error } = await anon.auth.signInWithPassword({ email, password: seed.password });
    console.log(`Login ${email}: ${error ? `FAIL ${error.message}` : `OK role=${data.user.user_metadata?.role}`}`);
    if (data?.session) await anon.auth.signOut();
  }

  console.log('\nCredential list (email | password | role):');
  for (const s of SEED_USERS) {
    console.log(`${s.email} | ${s.password} | ${s.role}`);
  }
}

try {
  await wipeAll();
  await seedAll();
  await verify();
  console.log('\nDone.');
} catch (error) {
  console.error('Reset failed:', error);
  process.exit(1);
}
