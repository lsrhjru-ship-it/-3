import { createClient } from '@supabase/supabase-js';
import jwt from '@tsndr/cloudflare-worker-jwt';

export async function onRequestPost({ request, env }) {
  const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY);
  const { provider, email, name, picture, discordId } = await request.json();
  if (!provider || !email) return Response.json({ error: '잘못된 요청입니다' }, { status: 400 });

  try {
    let user = null;
    if (provider === 'google') {
      const { data } = await supabase.from('users').select('*').eq('google_email', email).single();
      user = data;
    } else if (provider === 'discord') {
      const { data } = await supabase.from('users').select('*').eq('discord_id', discordId).single();
      user = data;
    }

    if (!user) {
      const base = email.split('@')[0].replace(/[^a-zA-Z0-9]/g, '').substring(0, 10);
      const username = base + '_' + Math.floor(1000 + Math.random() * 9000);
      const insertData = {
        username, email, role: 'user', display_name: name || username,
        join_date: new Date().toLocaleDateString('ko'), online: true,
        picture: picture || null, provider, pw_hash: null,
      };
      if (provider === 'google') insertData.google_email = email;
      if (provider === 'discord') insertData.discord_id = discordId;

      const { data: newUser, error } = await supabase.from('users').insert(insertData).select('*').single();
      if (error) return Response.json({ error: '가입 실패: ' + error.message }, { status: 500 });
      user = newUser;
    } else {
      await supabase.from('users').update({ online: true, picture: picture || user.picture }).eq('id', user.id);
    }

    const token = await jwt.sign(
      { id: user.id, username: user.username, role: user.role, exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7 },
      env.JWT_SECRET
    );

    return Response.json({
      token,
      user: { id: user.id, username: user.username, displayName: user.display_name, email: user.email, role: user.role, picture: user.picture, provider: user.provider }
    });
  } catch (e) {
    return Response.json({ error: '서버 오류: ' + e.message }, { status: 500 });
  }
}
