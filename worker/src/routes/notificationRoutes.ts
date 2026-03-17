import { json, error } from '../middleware/cors';
import { requireAuth } from '../middleware/auth';
import type { Env } from '../types';

export async function handleNotifications(path: string, method: string, request: Request, env: Env): Promise<Response | null> {
  const origin = request.headers.get('Origin');

  // GET /notifications — fetch latest 30 for current user
  if (method === 'GET' && path === '/notifications') {
    const user = await requireAuth(request, env);
    if (!user) return error('Unauthorized', 401, origin);
    const rows = await env.DB.prepare(
      `SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 30`
    ).bind(user.sub).all();
    const unread = (rows.results as any[]).filter(n => !n.read).length;
    return json({ notifications: rows.results, unread }, 200, origin);
  }

  // POST /notifications/read — mark all as read
  if (method === 'POST' && path === '/notifications/read') {
    const user = await requireAuth(request, env);
    if (!user) return error('Unauthorized', 401, origin);
    await env.DB.prepare(`UPDATE notifications SET read = 1 WHERE user_id = ?`).bind(user.sub).run();
    return json({ ok: true }, 200, origin);
  }

  return null;
}

export async function createNotification(
  db: D1Database,
  userId: number,
  type: 'comment' | 'like',
  postId: number,
  postSlug: string,
  postTitle: string,
  actorUsername: string
): Promise<void> {
  // Don't notify user of their own actions
  const post = await db.prepare('SELECT author_id FROM posts WHERE id = ?').bind(postId).first<{ author_id: number }>();
  if (!post || post.author_id === userId) return;
  await db.prepare(
    `INSERT INTO notifications (user_id, type, post_id, post_slug, post_title, actor_username) VALUES (?, ?, ?, ?, ?, ?)`
  ).bind(post.author_id, type, postId, postSlug, postTitle, actorUsername).run();
}
