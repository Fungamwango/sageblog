import { verifyJWT } from '../services/jwtService';
import type { Env, JWTPayload } from '../types';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function requireAuth(request: Request, env: Env): Promise<JWTPayload | null> {
  const auth = request.headers.get('Authorization');
  if (!auth?.startsWith('Bearer ')) return null;
  const token = auth.slice(7);

  // Try JWT first
  const jwt = await verifyJWT(token, env.JWT_SECRET);
  if (jwt) return jwt;

  // Fall back to UUID quick-token lookup in DB
  if (UUID_RE.test(token)) {
    const user = await env.DB.prepare('SELECT id, username, role FROM users WHERE token = ?')
      .bind(token).first<{ id: number; username: string; role: string }>();
    if (user) {
      const now = Math.floor(Date.now() / 1000);
      return { sub: user.id, username: user.username, role: user.role, exp: now + 86400, iat: now };
    }
  }

  return null;
}

export async function requireAdmin(request: Request, env: Env): Promise<JWTPayload | null> {
  const user = await requireAuth(request, env);
  if (!user || user.role !== 'admin') return null;
  return user;
}
