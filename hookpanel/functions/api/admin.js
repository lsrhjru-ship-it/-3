import { createClient } from '@supabase/supabase-js';
import jwt from '@tsndr/cloudflare-worker-jwt';

async function verifyAdmin(request, env) {
  const auth = request.headers.get('authorization') || '';
  const token = auth.replace('Bearer ', '');
  if (!token) return null;
  try {
    const ok = await jwt.verify(token, env.JWT_SECRET);
    if (!ok) return null;
    const payload = jwt.decode(token).payload;
    if (payload.role !== 'admin') return null;
    return payload;
  } catch { return null; }
}

async function hashPassword(password) {
  const salt = crypto.randomUUID().replace(/-/g, '');
  const encoder = new TextEncoder();
  const data = encoder.encode(salt + password);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  return `${salt}:${hash}`;
}

export async function onRequest({ request, env }) {
  const admin = await verifyAdmin(request, env);
  if (!admin) return new Response('Not Found', { status: 404 });

  const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY);
  const url = new URL(request.url);
  const path = url.pathname.replace('/api/admin', '');
  const method = request.method;

  if (method === 'GET' && path === '/users') {
    const { data } = await supabase.from('users').select('id, username, display_name, email, role, join_date, online, provider').order('join_date', { ascending: false });
    return Response.json({ users: data || [] });
  }

  if (method === 'GET' && path === '/stats') {
    const [{ count: totalUsers }, { count: onlineUsers }, { count: totalHooks }, { count: totalLogs }] = await Promise.all([
      supabase.from('users').select('*', { count: 'exact', head: true }),
      supabase.from('users').select('*', { count: 'exact', head: true }).eq('online', true),
      supabase.from('webhooks').select('*', { count: 'exact', head: true }),
      supabase.from('logs').select('*', { count: 'exact', head: true })
    ]);
    return Response.json({ totalUsers, onlineUsers, totalHooks, totalLogs });
  }

  if (method === 'PATCH' && path === '/users/role') {
    const { targetUsername, newRole } = await request.json();
    if (!['admin', 'user'].includes(newRole)) return Response.json({ error: '올바르지 않은 역할입니다' }, { status: 400 });
    if (targetUsername === admin.username) return Response.json({ error: '자신의 역할은 변경할 수 없습니다' }, { status: 400 });
    const { error } = await supabase.from('users').update({ role: newRole }).eq('username', targetUsername);
    if (error) return Response.json({ error: error.message }, { status: 500 });
    return Response.json({ ok: true });
  }

  if (method === 'DELETE' && path === '/users') {
    const { targetUsername } = await request.json();
    if (targetUsername === admin.username) return Response.json({ error: '자신의 계정은 삭제할 수 없습니다' }, { status: 400 });
    const { error } = await supabase.from('users').delete().eq('username', targetUsername);
    if (error) return Response.json({ error: error.message }, { status: 500 });
    return Response.json({ ok: true });
  }

  if (method === 'PATCH' && path === '/users/password') {
    const { targetUsername, newPassword } = await request.json();
    if (!newPassword || newPassword.length < 6) return Response.json({ error: '비밀번호는 6자 이상이어야 합니다' }, { status: 400 });
    const pw_hash = await hashPassword(newPassword);
    const { error } = await supabase.from('users').update({ pw_hash }).eq('username', targetUsername);
    if (error) return Response.json({ error: error.message }, { status: 500 });
    return Response.json({ ok: true });
  }

  return new Response('Not Found', { status: 404 });
}
