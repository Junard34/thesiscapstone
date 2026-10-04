import dotenv from 'dotenv';
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

const KEEP_EMAILS = new Set([
  'admin@example.com',
  'citizen@example.com',
  'tanod@example.com',
  'official@example.com',
  'lupon@example.com',
]);

async function clearComplaintDependencies(userIds) {
  if (!userIds.length) return;

  const idList = userIds.join(',');
  const queries = [
    `complaints!complaints_citizen_id_fkey`,
  ];

  // Null out assignment references so profiles can be deleted.
  const { error: assignError } = await supabase
    .from('complaints')
    .update({ assigned_to: null })
    .in('assigned_to', userIds);

  if (assignError) {
    console.warn('Could not null assigned_to:', assignError.message);
  }

  // Delete complaint-related rows owned by these users via citizen_id if possible.
  const { data: complaints } = await supabase
    .from('complaints')
    .select('id')
    .in('citizen_id', userIds);

  const complaintIds = (complaints || []).map((c) => c.id);
  if (complaintIds.length) {
    await supabase.from('triage_results').delete().in('complaint_id', complaintIds);
    await supabase.from('remarks').delete().in('complaint_id', complaintIds);
    await supabase.from('hearings').delete().in('complaint_id', complaintIds);
    await supabase.from('service_ratings').delete().in('complaint_id', complaintIds);
    await supabase.from('notifications').delete().in('user_id', userIds);
    await supabase.from('system_logs').delete().in('user_id', userIds);

    const { error: complaintDeleteError } = await supabase
      .from('complaints')
      .delete()
      .in('id', complaintIds);

    if (complaintDeleteError) {
      console.warn('Could not delete some complaints:', complaintDeleteError.message);
    }
  } else {
    await supabase.from('notifications').delete().in('user_id', userIds);
    await supabase.from('system_logs').delete().in('user_id', userIds);
  }

  console.log(`Cleared dependencies for user ids: ${idList}`);
}

async function main() {
  console.log('Removing non-demo profiles from public.users...');

  const { data: profiles, error } = await supabase
    .from('users')
    .select('id, email, auth_id, role');

  if (error) {
    throw new Error(`Failed to list users: ${error.message}`);
  }

  const toDelete = (profiles || []).filter((user) => !KEEP_EMAILS.has(String(user.email || '').toLowerCase()));
  const keep = (profiles || []).filter((user) => KEEP_EMAILS.has(String(user.email || '').toLowerCase()));

  console.log(`Keeping ${keep.length} demo user(s).`);
  console.log(`Deleting ${toDelete.length} extra profile(s):`);
  for (const user of toDelete) {
    console.log(`- ${user.email} (${user.role})`);
  }

  await clearComplaintDependencies(toDelete.map((user) => user.id));

  for (const user of toDelete) {
    const { error: deleteError } = await supabase.from('users').delete().eq('id', user.id);
    if (deleteError) {
      console.warn(`Failed to delete profile ${user.email}: ${deleteError.message}`);
    } else {
      console.log(`Deleted profile ${user.email}`);
    }

    if (user.auth_id) {
      const { error: authError } = await supabase.auth.admin.deleteUser(user.auth_id);
      if (authError) {
        console.warn(`Failed to delete auth ${user.email}: ${authError.message}`);
      }
    }
  }

  // Also delete any auth users whose emails are not in KEEP_EMAILS.
  let page = 1;
  const perPage = 100;
  while (true) {
    const { data, error: listError } = await supabase.auth.admin.listUsers({ page, perPage });
    if (listError) break;

    for (const authUser of data?.users || []) {
      const email = String(authUser.email || '').toLowerCase();
      if (!KEEP_EMAILS.has(email)) {
        const { error: authDeleteError } = await supabase.auth.admin.deleteUser(authUser.id);
        if (authDeleteError) {
          console.warn(`Failed to delete extra auth ${email}: ${authDeleteError.message}`);
        } else {
          console.log(`Deleted extra auth ${email}`);
        }
      }
    }

    if (!data?.users || data.users.length < perPage) break;
    page += 1;
  }

  const { data: remaining } = await supabase.from('users').select('id, email, role, status').order('email');
  console.log('\npublic.users now contains:');
  for (const user of remaining || []) {
    console.log(`- ${user.email} (${user.role}, ${user.status})`);
  }
  console.log(`Total: ${(remaining || []).length} user(s)`);
}

main().catch((error) => {
  console.error('Cleanup failed:', error);
  process.exit(1);
});
