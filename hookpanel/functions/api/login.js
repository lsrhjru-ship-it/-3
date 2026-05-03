import { createClient } from '@supabase/supabase-js';
import bcrypt from 'bcryptjs';
import jwt from '@tsndr/cloudflare-worker-jwt';

export async function onRequestPost({ request, env }) {
  const { id, pw } = await request.json();
  if (!id || !pw) return Response.json({ error: '아이디와 비밀번호를 입력해주세요' }, { status: 400 });

  const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY);

  const { data: user } = await supabase.from('users').select('*').eq('username', id).single();
  if (!user) return Response.json({ error: '아이디 또는 비밀번호가 틀렸습니다' }, { status: 401 });

  const valid = await bcrypt.compare(pw, user.pw_hash);
  if (!valid) return Response.json({ error: '아이디 또는 비밀번호가 틀렸습니다' }, { status: 401 });

  await supabase.from('users').update({ online: true }).eq('username', id);

  const token = await jwt.sign(
    { id: user.id, username: id, role: user.role, exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7 },
    env.JWT_SECRET
  );

  return Response.json({
    token,
    user: { id: user.id, username: id, displayName: user.display_name, email: user.email, role: user.role, picture: user.picture, provider: user.provider }
  });
}
