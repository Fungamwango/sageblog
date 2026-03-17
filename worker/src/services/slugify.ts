export function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_]+/g, '-')
    .replace(/--+/g, '-')
    .replace(/^-+|-+$/g, '')
    .substring(0, 80);
}

export async function uniqueSlug(db: D1Database, base: string): Promise<string> {
  let slug = slugify(base);
  let attempt = slug;
  let i = 2;
  while (true) {
    const row = await db.prepare('SELECT id FROM posts WHERE slug = ?').bind(attempt).first();
    if (!row) return attempt;
    attempt = `${slug}-${i++}`;
  }
}
