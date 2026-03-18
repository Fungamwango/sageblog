import { json, error } from '../middleware/cors';
import { requireAdmin } from '../middleware/auth';
import { generatePost, getNextCategory } from '../services/aiGenerator';
import type { Env } from '../types';

export async function handleAdmin(path: string, method: string, request: Request, env: Env): Promise<Response | null> {
  const origin = request.headers.get('Origin');

  if (!path.startsWith('/admin')) return null;

  const admin = await requireAdmin(request, env);
  if (!admin) return error('Forbidden', 403, origin);

  // POST /admin/generate — trigger AI post generation
  if (method === 'POST' && path === '/admin/generate') {
    const body = await request.json<{ category_slug?: string; count?: number }>().catch(() => ({}));
    const count = Math.min(body.count || 1, 5);
    const results: any[] = [];

    for (let i = 0; i < count; i++) {
      let cat: { id: number; slug: string; name: string } | null = null;

      if (body.category_slug) {
        cat = await env.DB.prepare('SELECT id, slug, name FROM categories WHERE slug = ?')
          .bind(body.category_slug).first<{ id: number; slug: string; name: string }>() || null;
      } else {
        cat = await getNextCategory(env);
      }

      if (!cat) { results.push({ error: 'Category not found' }); continue; }

      const postId = await generatePost(env, cat.slug, cat.id);
      if (postId) {
        const post = await env.DB.prepare('SELECT id, title, slug FROM posts WHERE id = ?').bind(postId).first();
        results.push({ success: true, post });
      } else {
        results.push({ success: false, category: cat.slug });
      }
    }

    return json({ generated: results }, 200, origin);
  }

  // DELETE /admin/logs — clear all generation logs
  if (method === 'DELETE' && path === '/admin/logs') {
    await env.DB.prepare('DELETE FROM ai_generation_log').run();
    return json({ ok: true }, 200, origin);
  }

  // GET /admin/logs
  if (method === 'GET' && path === '/admin/logs') {
    const rows = await env.DB.prepare(`
      SELECT l.*, c.name as category_name, p.title as post_title
      FROM ai_generation_log l
      LEFT JOIN categories c ON l.category_id = c.id
      LEFT JOIN posts p ON l.post_id = p.id
      ORDER BY l.created_at DESC LIMIT 50
    `).all();
    return json(rows.results, 200, origin);
  }

  // GET /admin/posts
  if (method === 'GET' && path === '/admin/posts') {
    const url = new URL(request.url);
    const page = parseInt(url.searchParams.get('page') || '1');
    const limit = 20;
    const offset = (page - 1) * limit;
    const search = url.searchParams.get('search') || '';
    let q = `SELECT p.id, p.title, p.slug, p.status, p.ai_generated, p.view_count, p.like_count, p.comment_count, p.published_at, c.name as category_name, u.username as author_username
      FROM posts p LEFT JOIN categories c ON p.category_id = c.id LEFT JOIN users u ON p.author_id = u.id`;
    const params: any[] = [];
    if (search) { q += ` WHERE p.title LIKE ? OR p.slug LIKE ?`; params.push(`%${search}%`, `%${search}%`); }
    const countRow = await env.DB.prepare(`SELECT COUNT(*) as total FROM posts p${search ? ' WHERE p.title LIKE ? OR p.slug LIKE ?' : ''}`).bind(...(search ? [`%${search}%`, `%${search}%`] : [])).first<{ total: number }>();
    q += ` ORDER BY p.published_at DESC LIMIT ? OFFSET ?`;
    params.push(limit, offset);
    const rows = await env.DB.prepare(q).bind(...params).all();
    return json({ posts: rows.results, total: countRow?.total || 0, page, pages: Math.ceil((countRow?.total || 0) / limit) }, 200, origin);
  }

  // DELETE /admin/posts/:id
  const adminPostDel = path.match(/^\/admin\/posts\/(\d+)$/);
  if (method === 'DELETE' && adminPostDel) {
    const id = parseInt(adminPostDel[1]);
    await env.DB.prepare('DELETE FROM post_tags WHERE post_id = ?').bind(id).run();
    await env.DB.prepare('DELETE FROM comments WHERE post_id = ?').bind(id).run();
    await env.DB.prepare('DELETE FROM likes WHERE post_id = ?').bind(id).run();
    await env.DB.prepare('DELETE FROM ai_generation_log WHERE post_id = ?').bind(id).run();
    await env.DB.prepare('DELETE FROM posts WHERE id = ?').bind(id).run();
    return json({ ok: true }, 200, origin);
  }

  // GET /admin/users
  if (method === 'GET' && path === '/admin/users') {
    const url = new URL(request.url);
    const page = parseInt(url.searchParams.get('page') || '1');
    const limit = 20;
    const offset = (page - 1) * limit;
    const rows = await env.DB.prepare(`
      SELECT u.id, u.username, u.email, u.role, u.created_at,
        COUNT(DISTINCT p.id) as post_count, COUNT(DISTINCT c.id) as comment_count
      FROM users u
      LEFT JOIN posts p ON p.author_id = u.id
      LEFT JOIN comments c ON c.user_id = u.id
      WHERE u.role != 'admin'
      GROUP BY u.id ORDER BY u.created_at DESC LIMIT ? OFFSET ?
    `).bind(limit, offset).all();
    const total = await env.DB.prepare("SELECT COUNT(*) as n FROM users WHERE role != 'admin'").first<{ n: number }>();
    return json({ users: rows.results, total: total?.n || 0, page, pages: Math.ceil((total?.n || 0) / limit) }, 200, origin);
  }

  // DELETE /admin/users/:id
  const adminUserDel = path.match(/^\/admin\/users\/(\d+)$/);
  if (method === 'DELETE' && adminUserDel) {
    const id = parseInt(adminUserDel[1]);
    if (id === admin.sub) return error('Cannot delete yourself', 400, origin);
    await env.DB.prepare('DELETE FROM likes WHERE user_id = ?').bind(id).run();
    await env.DB.prepare('DELETE FROM comments WHERE user_id = ?').bind(id).run();
    // Set posts to anonymous rather than deleting them
    await env.DB.prepare('UPDATE posts SET author_id = NULL WHERE author_id = ?').bind(id).run();
    await env.DB.prepare('DELETE FROM users WHERE id = ?').bind(id).run();
    return json({ ok: true }, 200, origin);
  }

  // GET /admin/stats
  if (method === 'GET' && path === '/admin/stats') {
    const [posts, users, comments, likes, views] = await Promise.all([
      env.DB.prepare('SELECT COUNT(*) as n FROM posts WHERE status = ?').bind('published').first<{ n: number }>(),
      env.DB.prepare("SELECT COUNT(*) as n FROM users WHERE role != 'admin'").first<{ n: number }>(),
      env.DB.prepare('SELECT COUNT(*) as n FROM comments WHERE status = ?').bind('approved').first<{ n: number }>(),
      env.DB.prepare('SELECT SUM(like_count) as n FROM posts').first<{ n: number }>(),
      env.DB.prepare('SELECT SUM(view_count) as n FROM posts').first<{ n: number }>(),
    ]);
    return json({
      posts: posts?.n || 0,
      users: users?.n || 0,
      comments: comments?.n || 0,
      total_likes: likes?.n || 0,
      total_views: views?.n || 0,
    }, 200, origin);
  }

  return null;
}
