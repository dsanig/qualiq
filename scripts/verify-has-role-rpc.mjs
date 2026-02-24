#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const testUserId = process.env.TEST_USER_ID;
const testRole = process.env.TEST_ROLE ?? 'Administrador';

if (!url || !serviceRoleKey || !testUserId) {
  console.error('Missing required env vars: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, TEST_USER_ID');
  process.exit(1);
}

const supabase = createClient(url, serviceRoleKey, { auth: { persistSession: false } });

const { data, error } = await supabase.rpc('has_role', {
  _role: testRole,
  _user_id: testUserId,
});

if (error) {
  console.error('RPC failed', error);
  process.exit(2);
}

if (typeof data !== 'boolean') {
  console.error('Expected boolean response, got:', data);
  process.exit(3);
}

console.log('has_role RPC OK:', { testUserId, testRole, result: data });
