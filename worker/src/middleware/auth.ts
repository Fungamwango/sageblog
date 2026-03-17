import { verifyJWT } from '../services/jwtService';
import type { Env, JWTPayload } from '../types';

export async function requireAuth(request: Request, env: Env): Promise<JWTPayload | null> {
  const auth = request.headers.get('Authorization');
  if (!auth?.startsWith('Bearer ')) return null;
  return verifyJWT(auth.slice(7), env.JWT_SECRET);
}

export async function requireAdmin(request: Request, env: Env): Promise<JWTPayload | null> {
  const user = await requireAuth(request, env);
  if (!user || user.role !== 'admin') return null;
  return user;
}
