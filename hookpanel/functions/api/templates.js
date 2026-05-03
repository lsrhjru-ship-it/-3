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
  const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY);
  const url = new URL(request.url);
  const method = request.method;

  // 공개 템플릿 조회는 인증 불필요
  if (method === 'GET') {
    const mine = url.searchParams.get('mine');
    const user = await verifyToken(request, env);

    let query = supabase.from('templates').select('id, name, description, created_by, is_public, username, avatar_url, content, embed, use_count, created_at').order('created_at', { ascending: false });

    if (mine === '1') {
      if (!user) return Response.json({ error: '로그인이 필요합니다' }, { status: 401 });
      query = query.eq('created_by', user.username);
    } else {
      query = query.eq('is_public', true);
    }

    const { data, error } = await query.limit(50);
    if (error) return Response.json({ error: error.message }, { status: 500 });
    return Response.json({ templates: data || [] });
  }

  const user = await verifyToken(request, env);
  if (!user) return Response.json({ error: '로그인이 필요합니다' }, { status: 401 });

  // 템플릿 생성
  if (method === 'POST') {
    const body = await request.json();
    const { name, description, is_public, username: botName, avatar_url, content, embed } = body;
    if (!name) return Response.json({ error: '템플릿 이름은 필수입니다' }, { status: 400 });

    const { data, error } = await supabase.from('templates').insert({
      name, description: description || '', is_public: !!is_public,
      created_by: user.username, username: botName || '', avatar_url: avatar_url || '',
      content: content || '', embed: embed || null
    }).select('*').single();

    if (error) return Response.json({ error: error.message }, { status: 500 });
    return Response.json({ template: data }, { status: 201 });
  }

  // 템플릿 수정
  if (method === 'PUT') {
    const body = await request.json();
    const { id, name, description, is_public, username: botName, avatar_url, content, embed } = body;
    if (!id) return Response.json({ error: 'ID가 필요합니다' }, { status: 400 });

    const { error } = await supabase.from('templates').update({
      name, description, is_public: !!is_public,
      username: botName || '', avatar_url: avatar_url || '',
      content: content || '', embed: embed || null
    }).eq('id', id).eq('created_by', user.username);

    if (error) return Response.json({ error: error.message }, { status: 500 });
    return Response.json({ ok: true });
  }

  // 템플릿 삭제
  if (method === 'DELETE') {
    const { id } = await request.json();
    const { error } = await supabase.from('templates').delete().eq('id', id).eq('created_by', user.username);
    if (error) return Response.json({ error: error.message }, { status: 500 });
    return Response.json({ ok: true });
  }

  // 사용 횟수 증가
  if (method === 'PATCH') {
    const { id } = await request.json();
    await supabase.rpc('increment_template_use', { template_id: id });
    return Response.json({ ok: true });
  }

  return new Response('Method Not Allowed', { status: 405 });
}
