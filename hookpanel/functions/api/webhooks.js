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
  const method = request.method;

  if (method === 'GET') {
    const { data } = await supabase.from('webhooks')
      .select('id, name, channel, date, created_by')
      .eq('created_by', user.username)
      .order('date', { ascending: false });
    return Response.json({ webhooks: data || [] });
  }

  if (method === 'POST') {
    const { name, channel, url } = await request.json();
    if (!name || !url) return Response.json({ error: '이름과 URL은 필수입니다' }, { status: 400 });
    if (!url.startsWith('https://discord.com/api/webhooks/'))
      return Response.json({ error: '올바른 Discord 웹훅 URL을 입력하세요' }, { status: 400 });

    const { data, error } = await supabase.from('webhooks').insert({
      name, channel: channel || '#채널', url,
      date: new Date().toLocaleDateString('ko'),
      created_by: user.username
    }).select('id, name, channel, date').single();

    if (error) return Response.json({ error: error.message }, { status: 500 });
    return Response.json({ webhook: data }, { status: 201 });
  }

  if (method === 'DELETE') {
    const { id } = await request.json();
    const { error } = await supabase.from('webhooks').delete().eq('id', id).eq('created_by', user.username);
    if (error) return Response.json({ error: error.message }, { status: 500 });
    return Response.json({ ok: true });
  }

  return new Response('Method Not Allowed', { status: 405 });
}
