import { createClient } from '@supabase/supabase-js';
import jwt from '@tsndr/cloudflare-worker-jwt';

async function verifyToken(request, env) {
  const auth = request.headers.get('authorization') || '';
  const token = auth.replace('Bearer ', '');
  if (!token) return null;
  try {
    const ok = await jwt.verify(token, env.JWT_SECRET);
    if (!ok) return null;
    return jwt.decode(token).payload;
  } catch { return null; }
}

export async function onRequest({ request, env }) {
  const user = await verifyToken(request, env);
  if (!user) return Response.json({ error: '로그인이 필요합니다' }, { status: 401 });

  const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY);

  if (request.method === 'GET') {
    const query = user.role === 'admin'
      ? supabase.from('logs').select('*').order('created_at', { ascending: false }).limit(200)
      : supabase.from('logs').select('*').eq('username', user.username).order('created_at', { ascending: false }).limit(100);
    const { data } = await query;
    return Response.json({ logs: data || [] });
  }

  if (request.method === 'DELETE') {
    const query = user.role === 'admin'
      ? supabase.from('logs').delete().neq('id', 0)
      : supabase.from('logs').delete().eq('username', user.username);
    await query;
    return Response.json({ ok: true });
  }

  return new Response('Method Not Allowed', { status: 405 });
}
