import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

const email = 'admin@example.com';
const password = 'password123';

const { data, error } = await supabase.auth.signInWithPassword({ email, password });
if (error) {
  console.error('Supabase login failed:', error.message);
  process.exit(1);
}

console.log('Auth user id:', data.user.id);
console.log('Auth metadata role:', data.user.user_metadata?.role);

const { data: profileStar, error: starError } = await supabase
  .from('users')
  .select('*')
  .eq('auth_id', data.user.id)
  .maybeSingle();

console.log('\nselect(*) profile:', starError ? starError.message : profileStar);
console.log('typeof profile.role:', typeof profileStar?.role, 'value:', profileStar?.role);

const { data: profileJoin, error: joinError } = await supabase
  .from('users')
  .select('*, role:roles(name)')
  .eq('auth_id', data.user.id)
  .single();

console.log('\nselect(*, role:roles(name)) profile:', joinError ? joinError.message : profileJoin);
console.log('typeof joined role:', typeof profileJoin?.role, 'value:', profileJoin?.role);

const roleName =
  profileJoin?.role?.name ||
  profileJoin?.role ||
  data.user.user_metadata?.role ||
  'CITIZEN';

console.log('\nResolved roleName for API response:', roleName);
console.log('typeof roleName:', typeof roleName);

const rolePathMap = {
  CITIZEN: '/citizen/dashboard',
  TANOD: '/tanod/dashboard',
  OFFICIAL: '/official/dashboard',
  LUPON: '/lupon/dashboard',
  ADMIN: '/admin/dashboard',
};

console.log('LoginPage would navigate to:', rolePathMap[roleName] || '/login');
console.log('ProtectedRoute role check String(role).toUpperCase():', String(roleName || '').toUpperCase());
console.log('Would pass ADMIN guard?', ['ADMIN'].includes(String(roleName || '').toUpperCase()));
