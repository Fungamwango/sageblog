import type { Env, GeneratedPost } from '../types';
import { uniqueSlug, slugify } from './slugify';

/**
 * Convert markdown-flavoured text to clean HTML.
 * Handles: headings, bold, italic, lists (- / * / numbered), blockquotes,
 * paragraphs, and strips model artefacts like <2>, <br />, stray asterisks.
 */
function mdToHtml(raw: string): string {
  const lines = raw.split('\n');
  const out: string[] = [];
  let inUl = false, inOl = false;

  const closeList = () => {
    if (inUl) { out.push('</ul>'); inUl = false; }
    if (inOl) { out.push('</ol>'); inOl = false; }
  };

  const inline = (s: string) => s
    // Strip model noise artefacts: <2>, <1>, stray angle-number combos
    .replace(/<\d+>/g, '')
    // Bold+italic
    .replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
    // Bold
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/__(.+?)__/g, '<strong>$1</strong>')
    // Italic
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/_(.+?)_/g, '<em>$1</em>')
    // Inline code
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    // Trim leftover lone asterisks at line start
    .replace(/^\*\s*/, '')
    .trim();

  for (let line of lines) {
    // Strip <br />, <br/> leftovers
    line = line.replace(/<br\s*\/?>/gi, '').trim();
    if (!line) { closeList(); out.push(''); continue; }

    // Already-valid HTML block elements — pass through
    if (/^<(h[1-6]|p|ul|ol|li|blockquote|div|section|article|pre|table|thead|tbody|tr|th|td)[\s>]/.test(line)) {
      closeList();
      out.push(line);
      continue;
    }

    // Headings
    const hm = line.match(/^(#{1,6})\s+(.+)/);
    if (hm) {
      closeList();
      const level = Math.min(hm[1].length + 1, 4); // h2–h4 (h1 is the post title)
      out.push(`<h${level}>${inline(hm[2])}</h${level}>`);
      continue;
    }

    // Blockquote
    if (line.startsWith('> ')) {
      closeList();
      out.push(`<blockquote><p>${inline(line.slice(2))}</p></blockquote>`);
      continue;
    }

    // Numbered list
    const olm = line.match(/^\d+\.\s+(.+)/);
    if (olm) {
      if (!inOl) { if (inUl) { out.push('</ul>'); inUl = false; } out.push('<ol>'); inOl = true; }
      out.push(`<li>${inline(olm[1])}</li>`);
      continue;
    }

    // Unordered list (-, *, •)
    const ulm = line.match(/^[-*•]\s+(.+)/);
    if (ulm) {
      if (!inUl) { if (inOl) { out.push('</ol>'); inOl = false; } out.push('<ul>'); inUl = true; }
      out.push(`<li>${inline(ulm[1])}</li>`);
      continue;
    }

    // Horizontal rule
    if (/^[-*_]{3,}$/.test(line)) { closeList(); out.push('<hr>'); continue; }

    // Regular paragraph line
    closeList();
    const text = inline(line);
    if (text) out.push(`<p>${text}</p>`);
  }

  closeList();

  // Merge consecutive <p> blocks that are probably split sentences
  return out.join('\n')
    .replace(/<\/p>\n<p>/g, '</p>\n<p>')
    // Clean up blank lines between HTML elements
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

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
Write detailed, informative, engaging blog posts.
IMPORTANT: You must respond using EXACTLY this format with these exact delimiter lines — no other text:
===TITLE===
(title here)
===SLUG===
(slug here)
===EXCERPT===
(excerpt here)
===TAGS===
(comma separated tags)
===META_TITLE===
(meta title here)
===META_DESC===
(meta description here)
===READ_TIME===
(number only)
===CONTENT===
(full HTML content here)
===END===`;

  const userPrompt = `Write a unique, detailed blog post about: "${topic}" in the ${categorySlug} category.
${recentTitles.length > 0 ? `IMPORTANT: These titles already exist — do NOT repeat or closely paraphrase them:\n${recentTitles.join('\n')}` : ''}

Title rules:
- Compelling and specific (under 70 chars)
- NEVER include years like 2024, 2025, 2026 or phrases like "in [year]", "for [year]"
- Must be meaningfully different from any existing title above
Slug: URL-friendly version of the title
Excerpt: 150-200 character engaging summary
Tags: 4-5 relevant tags, comma-separated
Meta_title: SEO optimized, under 60 chars, no year
Meta_desc: 150-160 chars, complete sentence
Read_time: estimated minutes (number only)
Content: 900-1400 words using HTML tags: <h2>, <h3>, <p>, <ul>, <li>, <strong>, <em>, <blockquote>
Include at least 3 sections with <h2> headings.`;

  let raw = '';
  let parsed: GeneratedPost | null = null;

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await (env.AI as any).run(MODEL, {
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        max_tokens: 3500,
        temperature: 0.75,
      });

      raw = typeof response === 'string' ? response : (response?.response ?? '');
      console.log(`[ai] attempt ${attempt} raw preview:`, raw.substring(0, 300));
      parsed = raw ? parseResponse(raw) : null;
      if (parsed?.title && parsed?.content && parsed?.excerpt) break;
    } catch (err) {
      console.error('[ai] model call failed:', err);
    }
  }

  if (!parsed) {
    await logGeneration(env.DB, null, categoryId, userPrompt, MODEL, null, 'failed', `No parse: ${raw.substring(0, 300)}`);
    return null;
  }

  // Strip year references from title (e.g. "Best X in 2025", "Top Y for 2024")
  parsed.title = parsed.title.replace(/\s+(in|for)\s+20\d{2}\b/gi, '').replace(/\b20\d{2}\b/g, '').trim().replace(/\s+/g, ' ');

  const slug = await uniqueSlug(env.DB, parsed.slug || parsed.title);
  // Convert markdown to HTML if the model returned markdown instead of HTML
  parsed.content = mdToHtml(parsed.content);

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
    `SELECT title FROM posts WHERE category_id = ? ORDER BY created_at DESC LIMIT 100`
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

function parseResponse(raw: string): GeneratedPost | null {
  // Try delimited format — model wraps title value in ===, uses ===KEY=== for rest
  if (raw.includes('===')) {
    const get = (key: string): string => {
      const match = raw.match(new RegExp(`===${key}===\\s*([\\s\\S]*?)(?:===[A-Z_]+===|===END===|$)`));
      return match ? match[1].trim() : '';
    };
    // Title may be wrapped as ===Title Value=== on first line
    const titleWrapped = raw.match(/^===([^=\n][^\n]*?)===\s*\n/);
    const title = titleWrapped ? titleWrapped[1].trim() : get('TITLE');
    const content = get('CONTENT').replace(/===END===/g, '').trim();
    if (title && content) {
      return {
        title,
        slug: get('SLUG').replace(/^\//, '') || title,
        excerpt: get('EXCERPT'),
        content,
        tags: get('TAGS').split(',').map(t => t.trim()).filter(Boolean),
        meta_title: get('META_TITLE') || title,
        meta_desc: get('META_DESC') || get('EXCERPT'),
        read_time: parseInt(get('READ_TIME')) || 5,
      };
    }
  }

  // Fall back: extract JSON object even if content has unescaped chars
  // Strategy: parse field by field using targeted regex instead of full JSON.parse
  try {
    // Strip markdown fences
    let clean = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();
    // Try standard JSON parse first
    const obj = JSON.parse(clean) as GeneratedPost;
    if (obj.title && obj.content) return obj;
  } catch {
    // Try to extract individual fields with regex when content breaks JSON
    const getField = (key: string): string => {
      const match = raw.match(new RegExp(`"${key}"\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)"`));
      return match ? match[1].replace(/\\n/g, '\n').replace(/\\"/g, '"') : '';
    };
    const getContent = (): string => {
      // Content may span many lines — grab everything between "content": " and the next top-level "
      const start = raw.indexOf('"content"');
      if (start === -1) return '';
      const afterKey = raw.indexOf('"', start + 9);
      if (afterKey === -1) return '';
      // Find the closing quote that ends the content value (before "tags" or "meta_title")
      const endMarker = raw.search(/"(?:tags|meta_title|meta_desc|read_time)"\s*:/);
      if (endMarker === -1) return raw.slice(afterKey + 1).replace(/"\s*}\s*$/, '');
      return raw.slice(afterKey + 1, endMarker).replace(/",?\s*$/, '').trim();
    };
    const title = getField('title');
    const content = getContent();
    if (title && content) {
      const tagsMatch = raw.match(/"tags"\s*:\s*\[([^\]]*)\]/);
      const tags = tagsMatch
        ? tagsMatch[1].match(/"([^"]+)"/g)?.map(t => t.replace(/"/g, '')) ?? []
        : [];
      return {
        title,
        slug: getField('slug') || title,
        excerpt: getField('excerpt'),
        content,
        tags,
        meta_title: getField('meta_title') || title,
        meta_desc: getField('meta_desc') || getField('excerpt'),
        read_time: parseInt(getField('read_time')) || 5,
      };
    }
  }
  return null;
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
