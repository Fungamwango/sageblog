export async function onRequestGet(ctx: any) {
  const db = ctx.env.DB;
  const base = 'https://sageblog.cfd';

  const [posts, categories, tags] = await Promise.all([
    db.prepare(`SELECT slug, updated_at, featured_image, title, content FROM posts WHERE status = 'published' ORDER BY published_at DESC LIMIT 1000`).all(),
    db.prepare(`SELECT slug FROM categories`).all(),
    db.prepare(`SELECT t.slug FROM tags t JOIN post_tags pt ON t.id = pt.tag_id GROUP BY t.id HAVING COUNT(pt.post_id) > 1`).all(),
  ]);

  let urls = `\n  <url><loc>${base}/</loc><changefreq>always</changefreq><priority>1.0</priority></url>`;

  for (const cat of (categories.results as any[])) {
    urls += `\n  <url><loc>${base}/category/${cat.slug}</loc><changefreq>always</changefreq><priority>0.8</priority></url>`;
  }
  for (const tag of (tags.results as any[])) {
    urls += `\n  <url><loc>${base}/tag/${tag.slug}</loc><changefreq>always</changefreq><priority>0.6</priority></url>`;
  }
  for (const post of (posts.results as any[])) {
    const lastmod = post.updated_at.substring(0, 10);
    const safeTitle = post.title.replace(/&/g, '&amp;').replace(/</g, '&lt;');
    const imgFromContent = post.content?.match(/<img[^>]+src="([^"]+)"/i)?.[1];
    const imgUrl = post.featured_image
      ? `${base}${post.featured_image}`
      : imgFromContent
        ? (imgFromContent.startsWith('/images/') ? `https://api.sageblog.cfd${imgFromContent}` : imgFromContent)
        : null;
    const imgTag = imgUrl
      ? `\n    <image:image><image:loc>${imgUrl}</image:loc><image:title>${safeTitle}</image:title></image:image>`
      : '';
    const vidUrl = post.content?.match(/<video[^>]+src="([^"]+)"/i)?.[1];
    const vidTag = vidUrl
      ? `\n    <video:video><video:content_loc>${vidUrl.startsWith('/images/') ? 'https://api.sageblog.cfd' + vidUrl : vidUrl}</video:content_loc><video:title>${safeTitle}</video:title></video:video>`
      : '';
    urls += `\n  <url><loc>${base}/post/${post.slug}</loc><lastmod>${lastmod}</lastmod><changefreq>always</changefreq><priority>0.7</priority>${imgTag}${vidTag}</url>`;
  }

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:image="http://www.google.com/schemas/sitemap-image/1.1"
        xmlns:video="http://www.google.com/schemas/sitemap-video/1.1">${urls}
</urlset>`;

  return new Response(xml, {
    headers: {
      'Content-Type': 'application/xml',
      'Cache-Control': 'no-store',
    },
  });
}
