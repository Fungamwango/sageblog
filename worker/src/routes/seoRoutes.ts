import type { Env } from '../types';

export async function handleSEO(path: string, method: string, _req: Request, env: Env): Promise<Response | null> {
  if (method !== 'GET') return null;

  if (path === '/robots.txt') {
    const body = `User-agent: *
Allow: /

Sitemap: https://sageblog.cfd/sitemap.xml
`;
    return new Response(body, { headers: { 'Content-Type': 'text/plain', 'Cache-Control': 'public, max-age=86400' } });
  }

  if (path === '/sitemap.xml') {
    const posts = await env.DB.prepare(
      `SELECT slug, updated_at FROM posts WHERE status = 'published' ORDER BY published_at DESC LIMIT 1000`
    ).all<{ slug: string; updated_at: string }>();

    const categories = await env.DB.prepare('SELECT slug FROM categories').all<{ slug: string }>();
    const tags = await env.DB.prepare(
      `SELECT t.slug FROM tags t JOIN post_tags pt ON t.id = pt.tag_id GROUP BY t.id HAVING COUNT(pt.post_id) > 1`
    ).all<{ slug: string }>();

    const base = 'https://sageblog.cfd';
    let urls = `
  <url><loc>${base}/</loc><changefreq>daily</changefreq><priority>1.0</priority></url>`;

    for (const cat of categories.results) {
      urls += `\n  <url><loc>${base}/category/${cat.slug}</loc><changefreq>daily</changefreq><priority>0.8</priority></url>`;
    }
    for (const tag of tags.results) {
      urls += `\n  <url><loc>${base}/tag/${tag.slug}</loc><changefreq>weekly</changefreq><priority>0.6</priority></url>`;
    }
    for (const post of posts.results) {
      const lastmod = post.updated_at.substring(0, 10);
      urls += `\n  <url><loc>${base}/post/${post.slug}</loc><lastmod>${lastmod}</lastmod><changefreq>monthly</changefreq><priority>0.7</priority></url>`;
    }

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}
</urlset>`;

    return new Response(xml, {
      headers: {
        'Content-Type': 'application/xml',
        'Cache-Control': 'public, max-age=3600',
      }
    });
  }

  return null;
}
