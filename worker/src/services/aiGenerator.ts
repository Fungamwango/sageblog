import type { Env, GeneratedPost } from '../types';
import { uniqueSlug, slugify } from './slugify';

const MODEL = '@cf/meta/llama-3.1-8b-instruct';

const TOPICS: Record<string, string[]> = {
  technology: [
    'artificial intelligence breakthroughs', 'quantum computing advances',
    'cybersecurity threats', 'cloud computing trends', 'open source software',
    'developer productivity tools', 'API design best practices',
    'machine learning in production', 'edge computing innovations',
  ],
  science: [
    'space exploration milestones', 'climate science research',
    'genomics and gene editing', 'particle physics discoveries',
    'ocean exploration findings', 'renewable energy science',
  ],
  business: [
    'startup funding trends', 'remote work culture shifts',
    'supply chain resilience', 'fintech disruption',
    'e-commerce growth strategies', 'leadership in tech companies',
  ],
  health: [
    'mental health in the digital age', 'nutrition science updates',
    'longevity research', 'telemedicine adoption',
    'gut microbiome discoveries', 'sleep science advances',
  ],
  culture: [
    'streaming wars and entertainment', 'social media trends',
    'independent creator economy', 'gaming culture evolution',
    'book publishing in the digital era', 'global cultural exchanges',
  ],
  environment: [
    'electric vehicle adoption', 'carbon capture technologies',
    'sustainable agriculture', 'ocean plastic solutions',
    'urban green spaces', 'wildlife conservation efforts',
  ],
};

export async function generatePost(env: Env, categorySlug: string, categoryId: number): Promise<number | null> {
  const topics = TOPICS[categorySlug] || TOPICS['technology'];
  const recentTitles = await getRecentTitles(env.DB, categoryId);

  // Pick a topic not recently covered
  const topic = topics[Math.floor(Math.random() * topics.length)];

  const systemPrompt = `You are an expert blog writer for SageBlog (sageblog.cfd), a high-quality knowledge blog.
Write detailed, informative, engaging blog posts. Always respond with ONLY valid JSON — no markdown fences, no explanation.`;

  const userPrompt = `Write a detailed, well-structured blog post about: "${topic}" in the ${categorySlug} category.

${recentTitles.length > 0 ? `Avoid these recently published titles:\n${recentTitles.map(t => `- ${t}`).join('\n')}\n` : ''}

Requirements:
- Original, insightful content (not generic)
- 900-1400 words in the content field
- Use proper HTML tags: <h2>, <h3>, <p>, <ul>, <li>, <strong>, <em>, <blockquote>
- Include at least 3 sections with <h2> headings
- Practical examples or real-world context where relevant

Respond with ONLY this JSON structure:
{
  "title": "Compelling, specific title (under 70 chars)",
  "slug": "url-friendly-slug-from-title",
  "excerpt": "Engaging 150-200 character summary that makes readers want to read more",
  "content": "Full HTML blog post content here",
  "tags": ["tag1", "tag2", "tag3", "tag4"],
  "meta_title": "SEO title under 60 chars",
  "meta_desc": "SEO meta description 150-160 chars ending with a complete sentence",
  "read_time": 6
}`;

  let raw: string | null = null;
  let parsed: GeneratedPost | null = null;

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await (env.AI as any).run(MODEL, {
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        max_tokens: 3000,
        temperature: 0.8,
      });

      raw = typeof response === 'string' ? response : response?.response ?? JSON.stringify(response);

      // Strip markdown code fences if model wraps them
      raw = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();

      parsed = JSON.parse(raw) as GeneratedPost;
      if (parsed.title && parsed.content && parsed.excerpt) break;
    } catch {
      if (attempt === 1) {
        await logGeneration(env.DB, null, categoryId, userPrompt, MODEL, null, 'failed', `Parse error: ${raw?.substring(0, 200)}`);
        return null;
      }
    }
  }

  if (!parsed) return null;

  const slug = await uniqueSlug(env.DB, parsed.slug || parsed.title);

  // Insert post
  const postResult = await env.DB.prepare(`
    INSERT INTO posts (title, slug, excerpt, content, category_id, ai_generated, meta_title, meta_desc, read_time, status, published_at)
    VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?, 'published', datetime('now'))
  `).bind(
    parsed.title.substring(0, 200),
    slug,
    parsed.excerpt.substring(0, 300),
    parsed.content,
    categoryId,
    (parsed.meta_title || parsed.title).substring(0, 100),
    (parsed.meta_desc || parsed.excerpt).substring(0, 200),
    parsed.read_time || 5
  ).run();

  const postId = postResult.meta.last_row_id as number;

  // Upsert tags and link them
  if (parsed.tags?.length) {
    for (const tagName of parsed.tags.slice(0, 6)) {
      const tagSlug = slugify(tagName);
      await env.DB.prepare(`INSERT OR IGNORE INTO tags (name, slug) VALUES (?, ?)`).bind(tagName, tagSlug).run();
      const tag = await env.DB.prepare(`SELECT id FROM tags WHERE slug = ?`).bind(tagSlug).first<{ id: number }>();
      if (tag) {
        await env.DB.prepare(`INSERT OR IGNORE INTO post_tags (post_id, tag_id) VALUES (?, ?)`).bind(postId, tag.id).run();
      }
    }
  }

  await logGeneration(env.DB, postId, categoryId, userPrompt, MODEL, null, 'success', null);
  return postId;
}

async function getRecentTitles(db: D1Database, categoryId: number): Promise<string[]> {
  const rows = await db.prepare(
    `SELECT title FROM posts WHERE category_id = ? ORDER BY created_at DESC LIMIT 8`
  ).bind(categoryId).all<{ title: string }>();
  return rows.results.map(r => r.title);
}

async function logGeneration(
  db: D1Database, postId: number | null, categoryId: number,
  prompt: string, model: string, tokens: number | null,
  status: string, error: string | null
): Promise<void> {
  await db.prepare(`
    INSERT INTO ai_generation_log (post_id, category_id, prompt_used, model_used, tokens_used, status, error_msg, triggered_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'cron')
  `).bind(postId, categoryId, prompt.substring(0, 1000), model, tokens, status, error).run();
}

export async function getNextCategory(env: Env): Promise<{ id: number; slug: string; name: string } | null> {
  const lastKey = 'last_gen_category_id';
  const lastId = await env.KV_STORE.get(lastKey);
  const lastCatId = lastId ? parseInt(lastId) : 0;

  const categories = await env.DB.prepare(
    `SELECT id, slug, name FROM categories ORDER BY id`
  ).all<{ id: number; slug: string; name: string }>();

  if (!categories.results.length) return null;

  const cats = categories.results;
  const nextIndex = (cats.findIndex(c => c.id > lastCatId));
  const cat = nextIndex >= 0 ? cats[nextIndex] : cats[0];

  await env.KV_STORE.put(lastKey, String(cat.id));
  return cat;
}
