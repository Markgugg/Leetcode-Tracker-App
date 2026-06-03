// Deletes all @grind.test users and their data.
// Run with: npx tsx scripts/cleanup-test-users.ts

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';

try {
  for (const line of readFileSync('.env', 'utf-8').split('\n')) {
    const idx = line.indexOf('=');
    if (idx > 0) {
      const k = line.slice(0, idx).trim();
      const v = line.slice(idx + 1).trim();
      if (k && !process.env[k]) process.env[k] = v;
    }
  }
} catch {}

async function main() {
  const url = process.env.SUPABASE_URL ?? process.env.EXPO_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key || key === 'YOUR_SERVICE_ROLE_KEY_HERE') {
    console.error('Missing SUPABASE_SERVICE_ROLE_KEY in .env');
    process.exit(1);
  }

  const supabase = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: users, error } = await supabase.auth.admin.listUsers();
  if (error) { console.error(error.message); process.exit(1); }

  const testUsers = users.users.filter(u => u.email?.endsWith('@grind.test'));
  if (testUsers.length === 0) { console.log('No test users found.'); return; }

  console.log(`Found ${testUsers.length} test users — deleting...\n`);

  for (const u of testUsers) {
    const { error: delErr } = await supabase.auth.admin.deleteUser(u.id);
    if (delErr) {
      console.error(`✗ ${u.email}: ${delErr.message}`);
    } else {
      console.log(`✓ deleted ${u.email}`);
    }
  }

  console.log('\nDone.');
}

main().catch(e => { console.error(e); process.exit(1); });
