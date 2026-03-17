import { json, error } from '../middleware/cors';
import { requireAuth } from '../middleware/auth';
import type { Env } from '../types';

export async function handleLikes(path: string, method: string, request: Request, env: Env): Promise<Response | null> {
  const origin = request.headers.get('Origin');
  const match = path.match(/^\/posts\/([^/]+)\/like$/);
  if (!match) return null;

  const slug = match[1];
  const post = await env.DB.prepare('SELECT id FROM posts WHERE slug = ?').bind(slug).first<{ id: number }>();
  if (!post) return error('Post not found', 404, origin);

  const user = await requireAuth(request, env);
  if (!user) return error('Login required', 401, origin);

  if (method === 'GET') {
    const like = await env.DB.prepare('SELECT 1 FROM likes WHERE user_id = ? AND post_id = ?')
      .bind(user.sub, post.id).first();
    return json({ liked: !!like }, 200, origin);
  }

  if (method === 'POST') {
    const existing = await env.DB.prepare('SELECT 1 FROM likes WHERE user_id = ? AND post_id = ?')
      .bind(user.sub, post.id).first();

    if (existing) {
      await env.DB.prepare('DELETE FROM likes WHERE user_id = ? AND post_id = ?').bind(user.sub, post.id).run();
      await env.DB.prepare('UPDATE posts SET like_count = MAX(0, like_count - 1) WHERE id = ?').bind(post.id).run();
      const updated = await env.DB.prepare('SELECT like_count FROM posts WHERE id = ?').bind(post.id).first<{ like_count: number }>();
      return json({ liked: false, like_count: updated?.like_count || 0 }, 200, origin);
    } else {
      await env.DB.prepare('INSERT OR IGNORE INTO likes (user_id, post_id) VALUES (?, ?)').bind(user.sub, post.id).run();
      await env.DB.prepare('UPDATE posts SET like_count = like_count + 1 WHERE id = ?').bind(post.id).run();
      const updated = await env.DB.prepare('SELECT like_count FROM posts WHERE id = ?').bind(post.id).first<{ like_count: number }>();
      return json({ liked: true, like_count: updated?.like_count || 0 }, 200, origin);
    }
  }

  return null;
}
