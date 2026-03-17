import { json, error } from '../middleware/cors';
import { requireAuth, requireAdmin } from '../middleware/auth';
import type { Env } from '../types';

export async function handlePosts(path: string, method: string, request: Request, env: Env): Promise<Response | null> {
  const origin = request.headers.get('Origin');
  const url = new URL(request.url);

  // GET /posts
  if (method === 'GET' && path === '/posts') {
    const page = parseInt(url.searchParams.get('page') || '1');
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '10'), 50);
    const offset = (page - 1) * limit;
    const category = url.searchParams.get('category');
    const tag = url.searchParams.get('tag');
    const search = url.searchParams.get('search');

    let query = `
      SELECT p.*, c.name as category_name, c.slug as category_slug
      FROM posts p
      LEFT JOIN categories c ON p.category_id = c.id
      WHERE p.status = 'published'
    `;
    const params: (string | number)[] = [];

    if (category) { query += ` AND c.slug = ?`; params.push(category); }
    if (tag) {
      query += ` AND p.id IN (SELECT pt.post_id FROM post_tags pt JOIN tags t ON pt.tag_id = t.id WHERE t.slug = ?)`;
      params.push(tag);
    }
    if (search) { query += ` AND (p.title LIKE ? OR p.excerpt LIKE ?)`; params.push(`%${search}%`, `%${search}%`); }

    const countQuery = query.replace('SELECT p.*, c.name as category_name, c.slug as category_slug', 'SELECT COUNT(*) as total');
    const totalRow = await env.DB.prepare(countQuery).bind(...params).first<{ total: number }>();

    query += ` ORDER BY p.published_at DESC LIMIT ? OFFSET ?`;
    params.push(limit, offset);

    const rows = await env.DB.prepare(query).bind(...params).all();
    const posts = await attachTags(env.DB, rows.results as any[]);

    return json({
      posts,
      pagination: {
        page, limit,
        total: totalRow?.total || 0,
        pages: Math.ceil((totalRow?.total || 0) / limit),
      }
    }, 200, origin);
  }

  // GET /posts/featured
  if (method === 'GET' && path === '/posts/featured') {
    const rows = await env.DB.prepare(`
      SELECT p.*, c.name as category_name, c.slug as category_slug
      FROM posts p LEFT JOIN categories c ON p.category_id = c.id
      WHERE p.status = 'published'
      ORDER BY p.like_count DESC, p.view_count DESC
      LIMIT 3
    `).all();
    const posts = await attachTags(env.DB, rows.results as any[]);
    return json(posts, 200, origin);
  }

  // GET /posts/:slug
  const slugMatch = path.match(/^\/posts\/([^/]+)$/);
  if (method === 'GET' && slugMatch) {
    const slug = slugMatch[1];
    const post = await env.DB.prepare(`
      SELECT p.*, c.name as category_name, c.slug as category_slug
      FROM posts p LEFT JOIN categories c ON p.category_id = c.id
      WHERE p.slug = ? AND p.status = 'published'
    `).bind(slug).first<any>();

    if (!post) return error('Post not found', 404, origin);

    // Increment view count async
    env.DB.prepare('UPDATE posts SET view_count = view_count + 1 WHERE id = ?').bind(post.id).run();

    const tags = await getPostTags(env.DB, post.id);
    const user = await requireAuth(request, env);
    let liked_by_user = false;
    if (user) {
      const like = await env.DB.prepare('SELECT 1 FROM likes WHERE user_id = ? AND post_id = ?').bind(user.sub, post.id).first();
      liked_by_user = !!like;
    }

    return json({ ...post, tags, liked_by_user }, 200, origin);
  }

  // POST /posts (admin)
  if (method === 'POST' && path === '/posts') {
    const admin = await requireAdmin(request, env);
    if (!admin) return error('Forbidden', 403, origin);
    const body = await request.json<any>();
    // Manual post creation (simplified)
    const result = await env.DB.prepare(`
      INSERT INTO posts (title, slug, excerpt, content, category_id, author_id, ai_generated, meta_title, meta_desc, status, published_at)
      VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, 'published', datetime('now'))
    `).bind(body.title, body.slug, body.excerpt, body.content, body.category_id, admin.sub,
       body.meta_title || body.title, body.meta_desc || body.excerpt).run();
    return json({ id: result.meta.last_row_id }, 201, origin);
  }

  // DELETE /posts/:id (admin)
  const idMatch = path.match(/^\/posts\/(\d+)$/);
  if (method === 'DELETE' && idMatch) {
    const admin = await requireAdmin(request, env);
    if (!admin) return error('Forbidden', 403, origin);
    await env.DB.prepare('DELETE FROM posts WHERE id = ?').bind(parseInt(idMatch[1])).run();
    return json({ ok: true }, 200, origin);
  }

  return null;
}

async function getPostTags(db: D1Database, postId: number): Promise<string[]> {
  const rows = await db.prepare(
    `SELECT t.name FROM tags t JOIN post_tags pt ON t.id = pt.tag_id WHERE pt.post_id = ?`
  ).bind(postId).all<{ name: string }>();
  return rows.results.map(r => r.name);
}

async function attachTags(db: D1Database, posts: any[]): Promise<any[]> {
  if (!posts.length) return posts;
  const ids = posts.map(p => p.id);
  const placeholders = ids.map(() => '?').join(',');
  const tagRows = await db.prepare(
    `SELECT pt.post_id, t.name FROM tags t JOIN post_tags pt ON t.id = pt.tag_id WHERE pt.post_id IN (${placeholders})`
  ).bind(...ids).all<{ post_id: number; name: string }>();

  const tagMap: Record<number, string[]> = {};
  for (const row of tagRows.results) {
    if (!tagMap[row.post_id]) tagMap[row.post_id] = [];
    tagMap[row.post_id].push(row.name);
  }
  return posts.map(p => ({ ...p, tags: tagMap[p.id] || [] }));
}
