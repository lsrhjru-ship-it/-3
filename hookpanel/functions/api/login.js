import { createClient } from '@supabase/supabase-js';
import jwt from '@tsndr/cloudflare-worker-jwt';

async function hashPassword(password, salt) {
  const encoder = new TextEncoder();
  const data = encoder.encode(salt + password);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

async function verifyPassword(password, storedHash) {
  if (!storedHash) return false;
  if (storedHash.startsWith('$2a$') || storedHash.startsWith('$2b$')) return false;
  const colonIdx = storedHash.indexOf(':');
  if (colonIdx === -1) return false;
  const salt = storedHash.substring(0, colonIdx);
  const hash = storedHash.substring(colonIdx + 1);
  const computed = await hashPassword(password, salt);
  return computed === hash;
}

export async function onRequestPost({ request, env }) {
  const { id, pw } = await request.json();
  if (!id || !pw) return Response.json({ error: '아이디와 비밀번호를 입력해주세요' }, { status: 400 });

  const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY);
  const { data: user } = await supabase.from('users').select('*').eq('username', id).single();

  if (!user || !user.pw_hash) return Response.json({ error: '아이디 또는 비밀번호가 틀렸습니다' }, { status: 401 });

  const valid = await verifyPassword(pw, user.pw_hash);
  if (!valid) return Response.json({ error: '아이디 또는 비밀번호가 틀렸습니다' }, { status: 401 });

  // 로그인 시 last_seen 갱신 (온라인 감지용)
  await supabase.from('users').update({ online: true, last_seen: new Date().toISOString() }).eq('username', id);

  const token = await jwt.sign(
    { id: user.id, username: id, role: user.role, exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7 },
    env.JWT_SECRET
  );

  return Response.json({
    token,
    user: {
      id: user.id, username: id, displayName: user.display_name,
      email: user.email, role: user.role, picture: user.picture, provider: user.provider
    }
  });
}
