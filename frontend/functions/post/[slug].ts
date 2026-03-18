export async function onRequestGet(ctx: any) {
  const { slug } = ctx.params;
  const db = ctx.env.DB;

  // Fetch post from D1
  const post = await db.prepare(
    `SELECT title, content, slug, featured_image, published_at FROM posts WHERE slug = ? AND status = 'published' LIMIT 1`
  ).bind(slug).first() as any;

  // Fetch the static post.html asset
  const assetRes = await ctx.env.ASSETS.fetch(new Request('https://sageblog.cfd/post.html'));
  const html = await assetRes.text();

  if (!post) {
    return new Response(html, { headers: { 'Content-Type': 'text/html;charset=UTF-8' } });
  }

  const base = 'https://sageblog.cfd';
  const url = `${base}/post/${post.slug}`;
  const title = post.title.replace(/"/g, '&quot;').replace(/</g, '&lt;');

  // Plain text description from content
  const plain = (post.content || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim()
    .substring(0, 160);
  const description = plain.replace(/"/g, '&quot;');

  // Image: from content img tag
  const imgMatch = (post.content || '').match(/<img[^>]+src="([^"]+)"/i);
  let imgUrl = imgMatch ? imgMatch[1] : null;
  if (imgUrl && imgUrl.startsWith('/images/')) imgUrl = `https://api.sageblog.cfd${imgUrl}`;

  const ogImage = imgUrl && !imgUrl.includes('example.com')
    ? `<meta property="og:image" content="${imgUrl}">
  <meta name="twitter:image" content="${imgUrl}">`
    : `<meta property="og:image" content="${base}/assets/img/og-default.png">
  <meta name="twitter:image" content="${base}/assets/img/og-default.png">`;

  const ogTags = `
  <meta property="og:type" content="article">
  <meta property="og:site_name" content="SageBlog">
  <meta property="og:title" content="${title}">
  <meta property="og:description" content="${description}">
  <meta property="og:url" content="${url}">
  ${ogImage}
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${title}">
  <meta name="twitter:description" content="${description}">
  <meta name="description" content="${description}">
  <link rel="canonical" href="${url}">`;

  // Inject after <head> and update <title>
  const modified = html
    .replace('<title>Loading… — SageBlog</title>', `<title>${title} — SageBlog</title>${ogTags}`)

  return new Response(modified, {
    headers: {
      'Content-Type': 'text/html;charset=UTF-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
