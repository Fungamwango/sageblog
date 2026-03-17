import { json, error } from '../middleware/cors';
import { requireAuth, requireAdmin } from '../middleware/auth';
import { createNotification } from './notificationRoutes';
import type { Env } from '../types';

export async function handleComments(path: string, method: string, request: Request, env: Env): Promise<Response | null> {
  const origin = request.headers.get('Origin');
  const url = new URL(request.url);

  // GET /posts/:slug/comments
  const slugComments = path.match(/^\/posts\/([^/]+)\/comments$/);
  if (method === 'GET' && slugComments) {
    const post = await env.DB.prepare('SELECT id FROM posts WHERE slug = ?').bind(slugComments[1]).first<{ id: number }>();
    if (!post) return error('Post not found', 404, origin);

    const page = parseInt(url.searchParams.get('page') || '1');
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '20'), 50);
    const offset = (page - 1) * limit;

    const rows = await env.DB.prepare(`
      SELECT c.*, u.username FROM comments c
      JOIN users u ON c.user_id = u.id
      WHERE c.post_id = ? AND c.parent_id IS NULL AND c.status = 'approved'
      ORDER BY c.created_at DESC LIMIT ? OFFSET ?
    `).bind(post.id, limit, offset).all<any>();

    const totalRow = await env.DB.prepare(
      `SELECT COUNT(*) as total FROM comments WHERE post_id = ? AND parent_id IS NULL AND status = 'approved'`
    ).bind(post.id).first<{ total: number }>();

    // Fetch replies for top-level comments
    const commentIds = rows.results.map((c: any) => c.id);
    let replies: any[] = [];
    if (commentIds.length) {
      const placeholders = commentIds.map(() => '?').join(',');
      const replyRows = await env.DB.prepare(`
        SELECT c.*, u.username FROM comments c
        JOIN users u ON c.user_id = u.id
        WHERE c.parent_id IN (${placeholders}) AND c.status = 'approved'
        ORDER BY c.created_at ASC
      `).bind(...commentIds).all<any>();
      replies = replyRows.results;
    }

    const replyMap: Record<number, any[]> = {};
    for (const r of replies) {
      if (!replyMap[r.parent_id]) replyMap[r.parent_id] = [];
      replyMap[r.parent_id].push(r);
    }

    const comments = rows.results.map((c: any) => ({ ...c, replies: replyMap[c.id] || [] }));
    return json({ comments, total: totalRow?.total || 0 }, 200, origin);
  }

  // POST /posts/:slug/comments
  if (method === 'POST' && slugComments) {
    const user = await requireAuth(request, env);
    if (!user) return error('Login required to comment', 401, origin);

    const post = await env.DB.prepare('SELECT id FROM posts WHERE slug = ?').bind(slugComments[1]).first<{ id: number }>();
    if (!post) return error('Post not found', 404, origin);

    const body = await request.json<{ content: string; parent_id?: number }>();
    if (!body.content?.trim()) return error('Comment content is required', 400, origin);
    if (body.content.length > 2000) return error('Comment too long (max 2000 chars)', 400, origin);

    const result = await env.DB.prepare(
      `INSERT INTO comments (post_id, user_id, parent_id, content) VALUES (?, ?, ?, ?)`
    ).bind(post.id, user.sub, body.parent_id || null, body.content.trim()).run();

    await env.DB.prepare('UPDATE posts SET comment_count = comment_count + 1 WHERE id = ?').bind(post.id).run();

    // Notify post author
    const postInfo = await env.DB.prepare('SELECT title, slug FROM posts WHERE id = ?').bind(post.id).first<{ title: string; slug: string }>();
    if (postInfo) createNotification(env.DB, user.sub, 'comment', post.id, postInfo.slug, postInfo.title, user.username || 'Someone');

    const newComment = await env.DB.prepare(
      `SELECT c.*, u.username FROM comments c JOIN users u ON c.user_id = u.id WHERE c.id = ?`
    ).bind(result.meta.last_row_id).first();

    return json(newComment, 201, origin);
  }

  // PATCH /comments/:id — edit
  const commentId = path.match(/^\/comments\/(\d+)$/);
  if (method === 'PATCH' && commentId) {
    const user = await requireAuth(request, env);
    if (!user) return error('Unauthorized', 401, origin);
    const comment = await env.DB.prepare('SELECT * FROM comments WHERE id = ?')
      .bind(parseInt(commentId[1])).first<any>();
    if (!comment) return error('Comment not found', 404, origin);
    if (comment.user_id !== user.sub && user.role !== 'admin') return error('Forbidden', 403, origin);
    const body = await request.json<{ content: string }>();
    if (!body.content?.trim()) return error('Content is required', 400, origin);
    await env.DB.prepare('UPDATE comments SET content = ?, updated_at = datetime(\'now\') WHERE id = ?')
      .bind(body.content.trim(), comment.id).run();
    return json({ ok: true }, 200, origin);
  }

  // DELETE /comments/:id
  if (method === 'DELETE' && commentId) {
    const user = await requireAuth(request, env);
    if (!user) return error('Unauthorized', 401, origin);

    const comment = await env.DB.prepare('SELECT * FROM comments WHERE id = ?')
      .bind(parseInt(commentId[1])).first<any>();
    if (!comment) return error('Comment not found', 404, origin);

    if (comment.user_id !== user.sub && user.role !== 'admin') return error('Forbidden', 403, origin);

    await env.DB.prepare('DELETE FROM comments WHERE id = ?').bind(comment.id).run();
    await env.DB.prepare('UPDATE posts SET comment_count = MAX(0, comment_count - 1) WHERE id = ?').bind(comment.post_id).run();

    return json({ ok: true }, 200, origin);
  }

  return null;
}
