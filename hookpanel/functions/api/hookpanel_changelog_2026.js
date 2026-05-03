import { createClient } from '@supabase/supabase-js';

function parseVersion(v) {
  const [major, minor] = (v || '1.0').replace('v','').split('.').map(Number);
  return { major: major || 1, minor: minor || 0 };
}

function bumpVersion(current) {
  const { major, minor } = parseVersion(current);
  const newMinor = minor + 1 >= 10 ? 0 : minor + 1;
  const newMajor = minor + 1 >= 10 ? major + 1 : major;
  return `v${newMajor}.${newMinor}`;
}

export async function onRequest({ request, env }) {
  const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY);

  // GET - 공개 조회 (인증 불필요)
  if (request.method === 'GET') {
    const { data } = await supabase
      .from('changelogs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(20);
    return Response.json({ changelogs: data || [] });
  }

  // POST - 업데이트 로그 등록 (API 키 인증)
  if (request.method === 'POST') {
    const apiKey = request.headers.get('x-api-key');
    if (!apiKey || apiKey !== env.CHANGELOG_API_KEY) {
      return Response.json({ error: '인증 실패' }, { status: 401 });
    }

    const { title, content, type } = await request.json();
    if (!title || !content)
      return Response.json({ error: '제목과 내용을 입력해주세요' }, { status: 400 });

    // 최신 버전 가져와서 자동 계산
    const { data: latest } = await supabase
      .from('changelogs')
      .select('version')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    const version = bumpVersion(latest?.version);

    const { data, error } = await supabase
      .from('changelogs')
      .insert({
        version,
        title,
        content,
        type: type || 'update',
        created_at: new Date().toISOString()
      })
      .select('*')
      .single();

    if (error) return Response.json({ error: error.message }, { status: 500 });
    return Response.json({ ok: true, version, changelog: data });
  }

  return new Response('Method Not Allowed', { status: 405 });
}
