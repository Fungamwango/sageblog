import { json, error } from '../middleware/cors';
import { hashPassword, verifyPassword, signJWT, verifyJWT } from '../services/jwtService';
import { requireAuth } from '../middleware/auth';
import type { Env } from '../types';

export async function handleAuth(path: string, method: string, request: Request, env: Env): Promise<Response | null> {
  const origin = request.headers.get('Origin');

  if (method === 'POST' && path === '/auth/register') {
    const body = await request.json<{ username: string; email: string; password: string; admin_secret?: string }>();
    if (!body.username || !body.email || !body.password)
      return error('username, email, and password are required', 400, origin);
    if (body.password.length < 8)
      return error('Password must be at least 8 characters', 400, origin);

    const exists = await env.DB.prepare('SELECT id FROM users WHERE email = ? OR username = ?')
      .bind(body.email, body.username).first();
    if (exists) return error('Email or username already taken', 409, origin);

    const hash = await hashPassword(body.password);
    const role = body.admin_secret === env.ADMIN_SECRET ? 'admin' : 'user';
    const result = await env.DB.prepare(
      'INSERT INTO users (username, email, password_hash, role) VALUES (?, ?, ?, ?)'
    ).bind(body.username, body.email, hash, role).run();

    const userId = result.meta.last_row_id as number;
    const { access, refresh } = await makeTokens(userId, body.username, role, env.JWT_SECRET);
    await env.KV_STORE.put(`refresh:${userId}`, refresh, { expirationTtl: 604800 });

    return json({ access_token: access, refresh_token: refresh, role }, 201, origin);
  }

  if (method === 'POST' && path === '/auth/login') {
    const body = await request.json<{ email: string; password: string }>();
    if (!body.email || !body.password) return error('email and password required', 400, origin);

    const user = await env.DB.prepare('SELECT id, username, password_hash, role FROM users WHERE email = ?')
      .bind(body.email).first<{ id: number; username: string; password_hash: string; role: string }>();
    if (!user) return error('Invalid credentials', 401, origin);

    const valid = await verifyPassword(body.password, user.password_hash);
    if (!valid) return error('Invalid credentials', 401, origin);

    const { access, refresh } = await makeTokens(user.id, user.username, user.role, env.JWT_SECRET);
    await env.KV_STORE.put(`refresh:${user.id}`, refresh, { expirationTtl: 604800 });

    return json({ access_token: access, refresh_token: refresh, role: user.role }, 200, origin);
  }

  if (method === 'POST' && path === '/auth/refresh') {
    const body = await request.json<{ refresh_token: string }>();
    if (!body.refresh_token) return error('refresh_token required', 400, origin);

    const payload = await verifyJWT(body.refresh_token, env.JWT_SECRET);
    if (!payload) return error('Invalid or expired refresh token', 401, origin);

    const stored = await env.KV_STORE.get(`refresh:${payload.sub}`);
    if (stored !== body.refresh_token) return error('Refresh token revoked', 401, origin);

    const { access, refresh } = await makeTokens(payload.sub, payload.username, payload.role, env.JWT_SECRET);
    await env.KV_STORE.put(`refresh:${payload.sub}`, refresh, { expirationTtl: 604800 });

    return json({ access_token: access, refresh_token: refresh }, 200, origin);
  }

  if (method === 'POST' && path === '/auth/logout') {
    const user = await requireAuth(request, env);
    if (user) await env.KV_STORE.delete(`refresh:${user.sub}`);
    return json({ ok: true }, 200, origin);
  }

  if (method === 'GET' && path === '/auth/me') {
    const user = await requireAuth(request, env);
    if (!user) return error('Unauthorized', 401, origin);
    const row = await env.DB.prepare('SELECT id, username, email, role, created_at FROM users WHERE id = ?')
      .bind(user.sub).first();
    return json(row, 200, origin);
  }

  return null;
}

async function makeTokens(id: number, username: string, role: string, secret: string) {
  const now = Math.floor(Date.now() / 1000);
  const access = await signJWT({ sub: id, username, role, exp: now + 900 }, secret);
  const refresh = await signJWT({ sub: id, username, role, exp: now + 604800 }, secret);
  return { access, refresh };
}
