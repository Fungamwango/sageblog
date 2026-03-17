import { json, error } from '../middleware/cors';
import type { Env } from '../types';

export async function handleTaxonomy(path: string, method: string, _request: Request, env: Env): Promise<Response | null> {
  const origin = _request.headers.get('Origin');

  if (method !== 'GET') return null;

  if (path === '/categories') {
    const rows = await env.DB.prepare(`
      SELECT c.*, COUNT(p.id) as post_count
      FROM categories c
      LEFT JOIN posts p ON p.category_id = c.id AND p.status = 'published'
      GROUP BY c.id ORDER BY c.name
    `).all();
    return json(rows.results, 200, origin);
  }

  const catSlug = path.match(/^\/categories\/([^/]+)$/);
  if (catSlug) {
    const cat = await env.DB.prepare('SELECT * FROM categories WHERE slug = ?').bind(catSlug[1]).first();
    if (!cat) return error('Category not found', 404, origin);
    return json(cat, 200, origin);
  }

  if (path === '/tags') {
    const rows = await env.DB.prepare(`
      SELECT t.*, COUNT(pt.post_id) as post_count
      FROM tags t
      LEFT JOIN post_tags pt ON pt.tag_id = t.id
      GROUP BY t.id ORDER BY post_count DESC LIMIT 50
    `).all();
    return json(rows.results, 200, origin);
  }

  const tagSlug = path.match(/^\/tags\/([^/]+)$/);
  if (tagSlug) {
    const tag = await env.DB.prepare('SELECT * FROM tags WHERE slug = ?').bind(tagSlug[1]).first();
    if (!tag) return error('Tag not found', 404, origin);
    return json(tag, 200, origin);
  }

  return null;
}
