import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';
import { createClient } from '@supabase/supabase-js';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required in .env');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

const DEMO_USERS = [
  { fullName: 'Admin User', email: 'admin@example.com', password: 'password123', role: 'ADMIN' },
  { fullName: 'Citizen User', email: 'citizen@example.com', password: 'password123', role: 'CITIZEN' },
  { fullName: 'Tanod User', email: 'tanod@example.com', password: 'password123', role: 'TANOD' },
  { fullName: 'Official User', email: 'official@example.com', password: 'password123', role: 'OFFICIAL' },
  { fullName: 'Lupon User', email: 'lupon@example.com', password: 'password123', role: 'LUPON' },
];

async function listAllAuthUsers() {
  const users = [];
  let page = 1;
  const perPage = 100;

  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({
      page,
      perPage,
    });

    if (error) {
      throw new Error(`Failed to list auth users: ${error.message}`);
    }

    users.push(...(data?.users || []));

    if (!data?.users || data.users.length < perPage) {
      break;
    }

    page += 1;
  }

  return users;
}

async function clearAllUsers() {
  console.log('Clearing Supabase users...');

  const authUsers = await listAllAuthUsers();
  console.log(`Found ${authUsers.length} auth user(s).`);

  const { error: profileError } = await supabase.from('users').delete().neq('id', -1);
  if (profileError) {
    console.warn('Could not clear public.users with neq filter, trying select+delete...');
    const { data: profiles, error: selectError } = await supabase.from('users').select('id');
    if (selectError) {
      throw new Error(`Failed to list public.users: ${selectError.message}`);
    }
    for (const profile of profiles || []) {
      const { error } = await supabase.from('users').delete().eq('id', profile.id);
      if (error) {
        console.warn(`Failed to delete profile ${profile.id}: ${error.message}`);
      }
    }
  } else {
    console.log('Cleared public.users.');
  }

  let deletedAuth = 0;
  for (const user of authUsers) {
    const { error } = await supabase.auth.admin.deleteUser(user.id);
    if (error) {
      console.warn(`Failed to delete auth user ${user.email || user.id}: ${error.message}`);
    } else {
      deletedAuth += 1;
    }
  }

  console.log(`Deleted ${deletedAuth} auth user(s).`);
}

async function seedDemoUsers() {
  console.log('Seeding 5 demo users...');

  const { data: roleRows, error: roleError } = await supabase.from('roles').select('id, name');
  if (roleError) {
    throw new Error(`Failed to load roles: ${roleError.message}`);
  }

  const roleMap = new Map((roleRows || []).map((role) => [String(role.name).toUpperCase(), role.id]));

  for (const demo of DEMO_USERS) {
    const roleId = roleMap.get(demo.role);

    const { data: created, error: createError } = await supabase.auth.admin.createUser({
      email: demo.email,
      password: demo.password,
      email_confirm: true,
      user_metadata: {
        full_name: demo.fullName,
        name: demo.fullName,
        role: demo.role,
      },
    });

    if (createError) {
      console.warn(`Auth create failed for ${demo.email}: ${createError.message}`);
      continue;
    }

    const { error: upsertError } = await supabase.from('users').upsert(
      {
        auth_id: created.user.id,
        full_name: demo.fullName,
        email: demo.email,
        role: demo.role,
        role_id: roleId || null,
        status: 'ACTIVE',
      },
      { onConflict: 'email' }
    );

    if (upsertError) {
      console.warn(`Profile upsert failed for ${demo.email}: ${upsertError.message}`);
    } else {
      console.log(`Seeded ${demo.role}: ${demo.email}`);
    }
  }
}

async function main() {
  try {
    await clearAllUsers();
    await seedDemoUsers();

    const remainingProfiles = await supabase.from('users').select('id, email, role, status');
    console.log('\nDone. public.users now contains:');
    for (const user of remainingProfiles.data || []) {
      console.log(`- ${user.email} (${user.role}, ${user.status})`);
    }
    console.log(`Total: ${(remainingProfiles.data || []).length} user(s)`);
  } catch (error) {
    console.error('Cleanup failed:', error);
    process.exit(1);
  }
}

main();
