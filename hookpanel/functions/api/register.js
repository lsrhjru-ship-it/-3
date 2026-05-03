import { createClient } from '@supabase/supabase-js';
import bcrypt from 'bcryptjs';
import jwt from '@tsndr/cloudflare-worker-jwt';

export async function onRequestPost({ request, env }) {
  const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY);
  const { action, id, email, pw, otp } = await request.json();

  if (action === 'send_otp') {
    if (!id || !email || !pw) return Response.json({ error: '모든 항목을 입력해주세요' }, { status: 400 });
    if (pw.length < 6) return Response.json({ error: '비밀번호는 6자 이상이어야 합니다' }, { status: 400 });

    const { data: existing } = await supabase.from('users').select('id').eq('username', id).single();
    if (existing) return Response.json({ error: '이미 사용 중인 아이디입니다' }, { status: 409 });

    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expires_at = new Date(Date.now() + 15 * 60 * 1000).toISOString();
    const pw_hash_temp = await bcrypt.hash(pw, 12);

    await supabase.from('otp_store').delete().eq('email', email);
    const { error: storeErr } = await supabase.from('otp_store').insert({ email, code, expires_at, username: id, pw_hash_temp });
    if (storeErr) return Response.json({ error: 'OTP 저장 실패: ' + storeErr.message }, { status: 500 });

    const emailRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + env.RESEND_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'HookPanel <onboarding@resend.dev>',
        to: email,
        subject: '[HookPanel] 이메일 인증코드',
        html: `<div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px;background:#0a0b0f;color:#fff;border-radius:12px"><h2 style="color:#5865f2">HookPanel 이메일 인증</h2><p style="color:#b9bbbe">아래 6자리 인증코드를 입력해주세요. 유효시간은 15분입니다.</p><div style="background:#1a1d26;border-radius:10px;padding:24px;text-align:center;font-size:36px;font-weight:700;letter-spacing:12px">${code}</div></div>`
      })
    });
    if (!emailRes.ok) return Response.json({ error: '이메일 발송 실패' }, { status: 500 });
    return Response.json({ ok: true });
  }

  if (action === 'verify_otp') {
    const { data: stored } = await supabase.from('otp_store').select('*').eq('email', email).single();
    if (!stored) return Response.json({ error: '인증 세션이 없습니다. 다시 시도해주세요' }, { status: 400 });
    if (new Date() > new Date(stored.expires_at)) {
      await supabase.from('otp_store').delete().eq('email', email);
      return Response.json({ error: '인증코드가 만료되었습니다' }, { status: 400 });
    }
    if (otp !== stored.code) return Response.json({ error: '인증코드가 올바르지 않습니다' }, { status: 401 });

    const { error } = await supabase.from('users').insert({
      username: stored.username, pw_hash: stored.pw_hash_temp, email,
      role: 'user', display_name: stored.username,
      join_date: new Date().toLocaleDateString('ko'), online: true, provider: 'local'
    });
    if (error) return Response.json({ error: '회원가입 실패: ' + error.message }, { status: 500 });

    await supabase.from('otp_store').delete().eq('email', email);

    const token = await jwt.sign(
      { username: stored.username, role: 'user', exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7 },
      env.JWT_SECRET
    );
    return Response.json({ token, user: { username: stored.username, displayName: stored.username, email, role: 'user' } });
  }

  return Response.json({ error: '잘못된 요청' }, { status: 400 });
}
