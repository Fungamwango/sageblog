import { error } from '../middleware/cors';
import { requireAuth } from '../middleware/auth';
import type { Env } from '../types';

const IMAGE_MIMES = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp']);
const VIDEO_MIMES = new Set(['video/mp4', 'video/webm', 'video/quicktime', 'video/x-msvideo']);

const IMAGE_MAX = 30 * 1024;        // 30kb (server-side check; client compresses to 25kb)
const VIDEO_MAX = 10 * 1024 * 1024; // 10mb

export async function handleImages(path: string, method: string, request: Request, env: Env): Promise<Response | null> {
  const origin = request.headers.get('Origin');

  // GET /images/* — serve from R2
  if (method === 'GET' && path.startsWith('/images/')) {
    const key = path.replace('/images/', '');
    if (!key) return null;
    const obj = await env.IMAGES.get(key);
    if (!obj) return new Response('Not Found', { status: 404 });
    const headers = new Headers();
    headers.set('Content-Type', obj.httpMetadata?.contentType || 'application/octet-stream');
    headers.set('Cache-Control', 'public, max-age=31536000, immutable');
    headers.set('Access-Control-Allow-Origin', '*');
    return new Response(obj.body, { headers });
  }

  // POST /images/upload — base64 body, returns { url }
  // Body: { data: "base64...", mime: "image/jpeg" }
  if (method === 'POST' && path === '/images/upload') {
    const user = await requireAuth(request, env);
    if (!user) return error('Unauthorized', 401, origin);

    let body: { data?: string; mime?: string };
    try { body = await request.json(); } catch { return error('Invalid JSON', 400, origin); }

    const { data, mime = 'image/jpeg' } = body;
    if (!data) return error('data is required', 400, origin);

    const isImage = IMAGE_MIMES.has(mime);
    const isVideo = VIDEO_MIMES.has(mime);
    if (!isImage && !isVideo) return error('Unsupported file type', 400, origin);

    // Decode base64 (strip data URL prefix if present)
    let buffer: ArrayBuffer;
    try {
      const bin = atob(data.replace(/^data:[^;]+;base64,/, ''));
      buffer = Uint8Array.from(bin, c => c.charCodeAt(0)).buffer;
    } catch { return error('Invalid file data', 400, origin); }

    // Enforce size limits
    if (isImage && buffer.byteLength > IMAGE_MAX)
      return error(`Image too large after compression (${(buffer.byteLength / 1024).toFixed(1)}kb, max 25kb)`, 400, origin);
    if (isVideo && buffer.byteLength > VIDEO_MAX)
      return error(`Video too large (${(buffer.byteLength / 1024 / 1024).toFixed(1)}mb, max 10mb)`, 400, origin);

    // Generate a unique storage key
    const ext = mime.split('/')[1].replace('quicktime', 'mov').replace('x-msvideo', 'avi');
    const key = `media/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
    await env.IMAGES.put(key, buffer, { httpMetadata: { contentType: mime } });

    return new Response(JSON.stringify({ url: `/images/${key}` }), {
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': origin || '*' },
    });
  }

  return null;
}
