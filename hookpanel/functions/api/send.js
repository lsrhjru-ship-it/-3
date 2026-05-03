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

export async function onRequestPost({ request, env }) {
  const user = await verifyToken(request, env);
  if (!user) return Response.json({ error: '로그인이 필요합니다' }, { status: 401 });

  const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY);

  // last_seen 갱신 (실시간 온라인 감지용)
  await supabase.from('users').update({ last_seen: new Date().toISOString() }).eq('username', user.username);

  const { webhookId, content, username, avatar_url, embeds } = await request.json();
  if (!webhookId) return Response.json({ error: '웹훅을 선택해주세요' }, { status: 400 });

  const { data: hook } = await supabase.from('webhooks').select('url, name').eq('id', webhookId).eq('created_by', user.username).single();
  if (!hook) return Response.json({ error: '웹훅을 찾을 수 없습니다' }, { status: 404 });

  const payload = {};
  if (content) payload.content = content;
  if (username) payload.username = username;
  if (avatar_url) payload.avatar_url = avatar_url;
  if (embeds && embeds.length) payload.embeds = embeds;

  const discordRes = await fetch(hook.url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  const success = discordRes.ok || discordRes.status === 204;
  await supabase.from('logs').insert({
    username: user.username, hook_name: hook.name,
    message: content || '[임베드]',
    time: new Date().toLocaleTimeString('ko'),
    status: success ? 'success' : 'fail'
  });

  return success
    ? Response.json({ ok: true })
    : Response.json({ error: '발송 실패 (' + discordRes.status + ')' }, { status: discordRes.status });
}
