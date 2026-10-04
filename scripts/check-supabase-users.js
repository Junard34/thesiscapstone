import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

const { data: profiles } = await supabase.from('users').select('id, email, role, status, auth_id').order('email');
console.log('public.users:');
for (const p of profiles || []) {
  console.log(`- ${p.email} | role=${p.role} | status=${p.status} | auth_id=${p.auth_id || 'MISSING'} | id=${p.id}`);
}

let page = 1;
console.log('\nauth.users:');
while (true) {
  const { data } = await supabase.auth.admin.listUsers({ page, perPage: 100 });
  for (const u of data?.users || []) {
    console.log(`- ${u.email} | id=${u.id}`);
  }
  if (!data?.users || data.users.length < 100) break;
  page += 1;
}

const admin = (profiles || []).find((p) => p.email === 'admin@example.com');
if (admin?.auth_id) {
  const { data: authUser, error } = await supabase.auth.admin.getUserById(admin.auth_id);
  console.log('\nAdmin auth lookup by auth_id:', error ? error.message : `OK ${authUser?.user?.email}`);
}
