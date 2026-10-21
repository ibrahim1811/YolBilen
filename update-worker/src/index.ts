// Yolbul sunucusu (Cloudflare Worker):
//  - APK güncellemesi:  GET /version.json, GET /yolbul[-<kod>].apk          (yayinla.ps1 yükler)
//  - JS güncellemesi (expo-updates protokolü v1):
//      GET /ota/manifest, GET /ota/assets/<key>                             (ota-yayinla.ps1 yükler)
//      PUT /ota/assets/<key>, PUT /ota/manifest/<runtime>   [yetkili]
//  - Hata raporları:    POST /reports, GET /reports?limit=50 [yetkili]       (D1)
//  - Uzaktan ayar:      GET /config.json, PUT /config.json [yetkili]
interface Env {
  UPDATES: R2Bucket;
  REPORTS: D1Database;
  OTA_TOKEN: string;
}

const APK_PATTERN = /^\/(yolbul(-\d+)?\.apk)$/;
const ASSET_PATTERN = /^\/ota\/assets\/([a-f0-9]{32})$/;
const MANIFEST_PUT_PATTERN = /^\/ota\/manifest\/([A-Za-z0-9._-]{1,32})$/;
const MAX_REPORT_BYTES = 64 * 1024;
const MAX_ASSET_BYTES = 50 * 1024 * 1024;

function authorized(request: Request, env: Env): boolean {
  const header = request.headers.get('Authorization') ?? '';
  return !!env.OTA_TOKEN && header === `Bearer ${env.OTA_TOKEN}`;
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

async function serveManifest(request: Request, env: Env): Promise<Response> {
  const runtime = request.headers.get('expo-runtime-version') ?? new URL(request.url).searchParams.get('runtime-version');
  const platform = request.headers.get('expo-platform') ?? new URL(request.url).searchParams.get('platform');
  if (!runtime || platform !== 'android') return new Response('runtime/platform eksik', { status: 400 });

  const obj = await env.UPDATES.get(`ota/manifests/${runtime}.json`);
  const protocolHeaders = { 'expo-protocol-version': '1', 'expo-sfv-version': '0', 'Cache-Control': 'private, max-age=0' };
  // Bu runtime için yayınlanmış JS güncellemesi yok: uygulama gömülü paketle devam eder
  if (!obj) return new Response(null, { status: 204, headers: protocolHeaders });

  const manifest = await obj.text();
  const boundary = `yolbul-${crypto.randomUUID()}`;
  const body =
    `--${boundary}\r\n` +
    'Content-Disposition: form-data; name="manifest"\r\n' +
    'Content-Type: application/json; charset=utf-8\r\n\r\n' +
    `${manifest}\r\n` +
    `--${boundary}--\r\n`;
  return new Response(body, {
    headers: { ...protocolHeaders, 'Content-Type': `multipart/mixed; boundary=${boundary}` },
  });
}

async function handleReport(request: Request, env: Env): Promise<Response> {
  const len = Number(request.headers.get('Content-Length') ?? 0);
  if (len > MAX_REPORT_BYTES) return json({ error: 'çok büyük' }, 413);
  const text = await request.text();
  if (text.length > MAX_REPORT_BYTES) return json({ error: 'çok büyük' }, 413);
  let r: Record<string, unknown>;
  try {
    r = JSON.parse(text);
  } catch {
    return json({ error: 'geçersiz JSON' }, 400);
  }
  const str = (v: unknown, max: number) => (typeof v === 'string' ? v.slice(0, max) : v == null ? null : JSON.stringify(v).slice(0, max));
  const kind = ['crash', 'error', 'user'].includes(String(r.kind)) ? String(r.kind) : 'error';
  const res = await env.REPORTS.prepare(
    `INSERT INTO reports (created_at, kind, message, stack, user_note, app_version, update_id, device, uid, logs, context)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)`
  )
    .bind(
      new Date().toISOString(),
      kind,
      str(r.message, 2000),
      str(r.stack, 8000),
      str(r.userNote, 2000),
      str(r.appVersion, 64),
      str(r.updateId, 64),
      str(r.device, 200),
      str(r.uid, 128),
      str(r.logs, 40000),
      str(r.context, 4000)
    )
    .run();
  return json({ ok: true, id: res.meta.last_row_id });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const { pathname } = url;
    const method = request.method;

    if (pathname === '/reports') {
      if (method === 'POST') return handleReport(request, env);
      if (method === 'GET') {
        if (!authorized(request, env)) return new Response('Unauthorized', { status: 401 });
        const limit = Math.min(200, Math.max(1, Number(url.searchParams.get('limit') ?? 50)));
        const { results } = await env.REPORTS.prepare('SELECT * FROM reports ORDER BY id DESC LIMIT ?1').bind(limit).all();
        return json(results);
      }
      return new Response('Method Not Allowed', { status: 405 });
    }

    if (pathname === '/config.json') {
      if (method === 'PUT') {
        if (!authorized(request, env)) return new Response('Unauthorized', { status: 401 });
        const body = await request.text();
        try { JSON.parse(body); } catch { return json({ error: 'geçersiz JSON' }, 400); }
        await env.UPDATES.put('config.json', body, { httpMetadata: { contentType: 'application/json' } });
        return json({ ok: true });
      }
      const obj = await env.UPDATES.get('config.json');
      return new Response(obj ? obj.body : '{}', {
        headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
      });
    }

    if (pathname === '/ota/manifest' && method === 'GET') return serveManifest(request, env);

    const assetMatch = ASSET_PATTERN.exec(pathname);
    if (assetMatch) {
      const key = `ota/assets/${assetMatch[1]}`;
      if (method === 'PUT') {
        if (!authorized(request, env)) return new Response('Unauthorized', { status: 401 });
        if (Number(request.headers.get('Content-Length') ?? 0) > MAX_ASSET_BYTES) return json({ error: 'çok büyük' }, 413);
        await env.UPDATES.put(key, request.body, {
          httpMetadata: { contentType: request.headers.get('Content-Type') ?? 'application/octet-stream' },
        });
        return json({ ok: true });
      }
      if (method === 'GET' || method === 'HEAD') {
        const obj = await env.UPDATES.get(key);
        if (!obj) return new Response('Not Found', { status: 404 });
        // Varlıklar içerik özetiyle adlandırıldığı için asla değişmez
        return new Response(method === 'HEAD' ? null : obj.body, {
          headers: {
            'Content-Type': obj.httpMetadata?.contentType ?? 'application/octet-stream',
            'Content-Length': String(obj.size),
            'Cache-Control': 'public, max-age=31536000, immutable',
          },
        });
      }
    }

    const manifestPut = MANIFEST_PUT_PATTERN.exec(pathname);
    if (manifestPut && method === 'PUT') {
      if (!authorized(request, env)) return new Response('Unauthorized', { status: 401 });
      const body = await request.text();
      try { JSON.parse(body); } catch { return json({ error: 'geçersiz JSON' }, 400); }
      await env.UPDATES.put(`ota/manifests/${manifestPut[1]}.json`, body, { httpMetadata: { contentType: 'application/json' } });
      return json({ ok: true });
    }

    if (method !== 'GET' && method !== 'HEAD') {
      return new Response('Method Not Allowed', { status: 405 });
    }

    if (pathname === '/version.json') {
      const obj = await env.UPDATES.get('version.json');
      if (!obj) return new Response('Henüz yayınlanmış sürüm yok', { status: 404 });
      return new Response(obj.body, {
        headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
      });
    }

    const m = APK_PATTERN.exec(pathname);
    if (m) {
      const obj = await env.UPDATES.get(m[1]);
      if (!obj) return new Response('Not Found', { status: 404 });
      const headers = new Headers({
        'Content-Type': 'application/vnd.android.package-archive',
        'Content-Length': String(obj.size),
        'Content-Disposition': `attachment; filename="${m[1]}"`,
        // Sürüm numaralı APK değişmez; "yolbul.apk" her yayında değişir
        'Cache-Control': m[2] ? 'public, max-age=31536000, immutable' : 'no-store',
        ETag: obj.httpEtag,
      });
      return new Response(method === 'HEAD' ? null : obj.body, { headers });
    }

    if (pathname === '/') {
      return Response.redirect(new URL('/yolbul.apk', request.url).toString(), 302);
    }
    return new Response('Not Found', { status: 404 });
  },
} satisfies ExportedHandler<Env>;
