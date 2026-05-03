import { createClient } from '@supabase/supabase-js';

export async function onRequest({ env }) {
  const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY);
  const [{ count: onlineUsers }, { count: totalUsers }] = await Promise.all([
    supabase.from('users').select('*', { count: 'exact', head: true }).eq('online', true),
    supabase.from('users').select('*', { count: 'exact', head: true })
  ]);
  return Response.json({ onlineUsers: onlineUsers || 0, totalUsers: totalUsers || 0 });
}
