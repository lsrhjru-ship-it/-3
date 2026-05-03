import { createClient } from '@supabase/supabase-js';

export async function onRequest({ env }) {
  const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY);

  // 5분 이내에 활동한 유저를 "온라인"으로 간주
  const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();

  const [{ count: onlineUsers }, { count: totalUsers }] = await Promise.all([
    supabase.from('users').select('*', { count: 'exact', head: true }).gte('last_seen', fiveMinutesAgo),
    supabase.from('users').select('*', { count: 'exact', head: true })
  ]);

  return Response.json({ onlineUsers: onlineUsers || 0, totalUsers: totalUsers || 0 });
}
