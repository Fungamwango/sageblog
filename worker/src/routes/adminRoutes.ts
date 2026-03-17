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

  // GET /admin/stats
  if (method === 'GET' && path === '/admin/stats') {
    const [posts, users, comments, likes, views] = await Promise.all([
      env.DB.prepare('SELECT COUNT(*) as n FROM posts WHERE status = ?').bind('published').first<{ n: number }>(),
      env.DB.prepare('SELECT COUNT(*) as n FROM users').first<{ n: number }>(),
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
