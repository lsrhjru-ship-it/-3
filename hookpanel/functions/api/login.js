import { createClient } from '@supabase/supabase-js';
import jwt from '@tsndr/cloudflare-worker-jwt';

// Cloudflare Workers 네이티브 Web Crypto API로 SHA-256 해시
async function hashPassword(password, salt) {
  const encoder = new TextEncoder();
  const data = encoder.encode(salt + password);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

async function verifyPassword(password, storedHash) {
  // 기존 bcrypt 해시인지 확인 (마이그레이션 기간)
  if (storedHash.startsWith('$2a$') || storedHash.startsWith('$2b$')) {
    // bcrypt는 검증 불가 → 비밀번호 재설정 필요 안내
    return null; // null = bcrypt hash (마이그레이션 필요)
  }
  // SHA-256 해시 형식: "salt:hash"
  const [salt, hash] = storedHash.split(':');
  const computed = await hashPassword(password, salt);
  return computed === hash;
}

async function createHash(password) {
  const salt = crypto.randomUUID().replace(/-/g, '');
  const hash = await hashPassword(password, salt);
  return `${salt}:${hash}`;
}

export async function onRequestPost({ request, env }) {
  const { id, pw } = await request.json();
  if (!id || !pw) return Response.json({ error: '아이디와 비밀번호를 입력해주세요' }, { status: 400 });

  const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY);

  const { data: user } = await supabase.from('users').select('*').eq('username', id).single();
  if (!user || !user.pw_hash) return Response.json({ error: '아이디 또는 비밀번호가 틀렸습니다' }, { status: 401 });

  const result = await verifyPassword(pw, user.pw_hash);

  if (result === null) {
    // bcrypt 해시 → 이번 로그인 시 자동 마이그레이션
    // 비밀번호를 직접 비교할 수 없으므로 관리자는 env의 ADMIN_PW로 검증
    if (user.role === 'admin' && pw === env.ADMIN_PW) {
      // 새 해시로 자동 마이그레이션
      const newHash = await createHash(pw);
      await supabase.from('users').update({ pw_hash: newHash }).eq('username', id);
    } else {
      return Response.json({ error: '비밀번호 재설정이 필요합니다. 관리자에게 문의하세요.' }, { status: 401 });
    }
  } else if (!result) {
    return Response.json({ error: '아이디 또는 비밀번호가 틀렸습니다' }, { status: 401 });
  }

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
