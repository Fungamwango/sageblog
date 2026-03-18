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
    'why most AI demos fail in production and what engineers do differently',
    'the hidden costs of cloud computing that nobody talks about',
    'how open source maintainers are quietly burning out',
    'what quantum computing can actually do right now versus the hype',
    'the real reason cybersecurity keeps failing despite billion-dollar budgets',
    'how edge computing is changing the way apps feel on mobile',
    'the unspoken tradeoffs in modern API design',
    'why developer tools have become a $50B market',
    'how machine learning models fail silently in the real world',
    'the quiet revolution happening in database technology',
    'what big tech layoffs actually tell us about the software industry',
    'why most software rewrites fail and what to do instead',
  ],
  science: [
    'what the James Webb telescope has genuinely changed about cosmology',
    'the uncomfortable truth about reproducibility in science',
    'how gene editing moved from lab curiosity to clinical reality',
    'what deep ocean expeditions keep finding that surprises researchers',
    'the physics breakthrough that almost nobody outside academia noticed',
    'how climate models work and why they keep being right',
    'the strange biology of animals that barely age',
    'what nuclear fusion actually needs to become practical',
    'how microbes are quietly running the planet',
    'the neuroscience of why humans are terrible at assessing risk',
  ],
  business: [
    'why most startups die from indigestion not starvation',
    'what venture capital gets systematically wrong about founders',
    'how supply chains broke and why they are not fully fixed',
    'the real economics of the creator economy nobody advertises',
    'why remote work productivity data is deeply misleading',
    'how fintech companies are quietly replacing banks for a generation',
    'the management mistake that kills otherwise great companies',
    'what small businesses know about customer loyalty that corporations ignore',
    'why pricing strategy is the most underrated startup skill',
    'how the subscription economy changed what ownership means',
  ],
  health: [
    'what decades of sleep research actually agrees on',
    'the gut microbiome findings that forced scientists to rethink immunity',
    'why the longevity research coming out of labs is more interesting than supplements',
    'how chronic stress physically changes the brain over time',
    'the nutrition advice that keeps getting quietly reversed',
    'what telemedicine got right and where it still struggles',
    'the science behind why exercise works on mental health',
    'how the definition of a healthy diet became so contested',
    'what cancer screening data actually shows about early detection',
    'the real story behind rising rates of childhood allergies',
  ],
  culture: [
    'how algorithms quietly reshaped what music gets made',
    'the economics of why blockbuster movies keep getting bigger and worse',
    'what the decline of third places is doing to communities',
    'how video games became the dominant cultural medium nobody admits to',
    'the strange death and rebirth of independent bookstores',
    'what fan communities reveal about how stories create identity',
    'how social media changed the way humans experience collective events',
    'the cultural gap between how people say they spend time and how they actually do',
    'why nostalgia became the defining aesthetic of the past decade',
    'what podcasts replaced that radio and TV could not',
  ],
  environment: [
    'why electric vehicles alone will not solve urban air quality',
    'the carbon capture approaches that actually have hard data behind them',
    'how regenerative agriculture differs from organic farming in practice',
    'the ocean plastic problem is worse than the headline numbers suggest',
    'what rewilding projects have genuinely taught conservation biology',
    'how cities are redesigning themselves around heat rather than cold',
    'the hidden environmental cost of streaming and data centers',
    'why battery storage is the real bottleneck in renewable energy',
    'what indigenous land management practices are teaching modern conservation',
    'the surprising countries making the fastest progress on emissions',
  ],
};

export async function generatePost(env: Env, categorySlug: string, categoryId: number): Promise<number | null> {
  const topics = TOPICS[categorySlug] || TOPICS['technology'];
  const recentTitles = await getRecentTitles(env.DB, categoryId);

  // Pick a topic not recently covered
  const topic = topics[Math.floor(Math.random() * topics.length)];

  const systemPrompt = `You are a sharp, opinionated staff writer for SageBlog — a no-nonsense knowledge blog that respects readers' intelligence.
Your writing is direct, specific, and grounded in real evidence. You avoid hype, fluff, and marketing language.
Respond ONLY using these exact delimiters — no extra text before or after:
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

  const BANNED_OPENERS = [
    'unlock', 'unlocking', 'unveil', 'unveiling', 'dive into', 'delve into',
    'in today\'s', 'in the ever-', 'in an era', 'in a world', 'welcome to',
    'have you ever', 'imagine a world', 'it\'s no secret', 'the future is',
    'revolutionize', 'revolutionizing', 'game-changer', 'game-changing',
    'transformative', 'groundbreaking', 'cutting-edge', 'explore', 'exploring',
    'navigating', 'harnessing', 'leveraging', 'empowering', 'journey',
    'landscape', 'paradigm', 'ever-evolving', 'rapidly changing',
  ].join(', ');

  // Rotate through varied opening styles so posts don't all feel the same
  const openingStyles = [
    'Start with a striking statistic or number that most people would not guess.',
    'Open with a short, concrete scene or anecdote — put the reader inside a specific moment.',
    'Begin with a direct, counterintuitive claim that challenges a common assumption.',
    'Lead with a question that the reader genuinely cannot answer yet — then answer it in the paragraph.',
    'Open with a specific failure or mistake — name the company, person, or study that got it wrong.',
    'Start with a sharp contrast: what most people believe vs. what the data actually shows.',
    'Begin with a specific number, date, or place that anchors the story in reality.',
  ];
  const openingStyle = openingStyles[Math.floor(Math.random() * openingStyles.length)];

  const titleStyles = [
    `"Why [Specific Group] [Does Something Surprising] — And What It Means for Everyone Else"`,
    `"The [Specific Thing] Nobody Talks About in [Field]"`,
    `"[Number] Years of [Research/Data] on [Topic] Points to One Uncomfortable Truth"`,
    `"What [Company/Study/Expert] Got Wrong About [Topic] — And Who Got It Right"`,
    `"Inside [Specific Process/System]: Why It Works Less Like You Think"`,
    `"[Topic] Is Broken. Here Is Exactly How and Why."`,
    `"The Quiet [Change/Problem/Revolution] Happening in [Field] That Most People Miss"`,
  ];
  const titleStyleHint = titleStyles[Math.floor(Math.random() * titleStyles.length)];

  const userPrompt = `Write a detailed, specific blog post on this angle: "${topic}"
Category: ${categorySlug}
${recentTitles.length > 0 ? `These titles already exist — write something distinctly different:\n${recentTitles.slice(0, 20).join('\n')}` : ''}

TITLE rules (critical):
- 70–120 characters long — specific, concrete, not vague or generic
- Written like a sharp magazine editor or essayist — confident, direct, specific
- Style hint (use as inspiration, not a template): ${titleStyleHint}
- Can be a bold statement, a revealing question, a surprising contrast, or an exposé framing
- BANNED title starters: ${BANNED_OPENERS}
- NEVER start with "Unlock", "Unveil", "Explore", "Dive", "Delve", "The Future of", "Revolutioniz", "Navigat", "Harness", "Leverage"
- NO years (2024, 2025, 2026 etc.) in title
- MUST be at least 70 characters — short vague titles are rejected
- Examples of GOOD titles:
  "Why Most AI Projects Die in Year Two and What the Survivors Did Differently"
  "The Science Behind Why You Cannot Stop Doomscrolling, Explained Without Jargon"
  "Inside the Quiet Collapse of the Open Source Funding Model"
  "What Doctors Wish Patients Actually Understood About Chronic Pain Management"
  "Sleep Research Has Been Saying the Same Thing for 40 Years — We Keep Ignoring It"
  "The Real Reason Cybersecurity Keeps Failing Despite Billion-Dollar Budgets"

CONTENT rules:
- 1200–1600 words — thorough, not padded
- Opening paragraph style: ${openingStyle} NEVER start with "In today's world", "In an era", "It's no secret", or any banned opener. The first sentence must hook immediately.
- Use HTML: <h2>, <h3>, <p>, <ul>, <li>, <strong>, <em>, <blockquote>
- At least 4 <h2> sections with specific, descriptive headings — NOT "Introduction", "Overview", "Conclusion", "Final Thoughts"
- Back every major claim with a specific example, named company, study, statistic, or real person
- Vary sentence rhythm — mix short punchy sentences with longer analytical ones
- End with a concrete, specific takeaway or implication the reader can act on or think about

Excerpt: 150–200 chars, punchy and specific — make someone want to read
Tags: 4–6 specific tags, comma-separated
Meta_title: under 60 chars, no year
Meta_desc: 150–160 chars, complete sentence
Read_time: estimated minutes (number only)`;

  let raw = '';
  let parsed: GeneratedPost | null = null;

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      // On retry, add explicit reminder about title length
      const retryNote = attempt > 0
        ? `\n\nCRITICAL RETRY NOTE: Your previous title was too short (under 70 characters) or used a banned word. Write a LONGER, MORE SPECIFIC title — at least 70 characters, ideally 80-110. Think of a headline a senior editor at The Atlantic or Wired would write.`
        : '';

      const response = await (env.AI as any).run(MODEL, {
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt + retryNote },
        ],
        max_tokens: 3500,
        temperature: 1.0,
      });

      raw = typeof response === 'string' ? response : (response?.response ?? '');
      console.log(`[ai] attempt ${attempt} raw preview:`, raw.substring(0, 300));
      parsed = raw ? parseResponse(raw) : null;
      // Require title ≥ 40 chars to accept (we validate ≥ 20 later, but reject short ones for retry)
      if (parsed?.title && parsed?.content && parsed?.excerpt && parsed.title.trim().length >= 40) break;
      if (parsed?.title && parsed.title.trim().length < 40) {
        console.log(`[ai] title too short (${parsed.title.length} chars): "${parsed.title}" — retrying`);
        parsed = null;
      }
    } catch (err) {
      console.error('[ai] model call failed:', err);
    }
  }

  if (!parsed) {
    await logGeneration(env.DB, null, categoryId, userPrompt, MODEL, null, 'failed', `No parse: ${raw.substring(0, 300)}`);
    return null;
  }

  // Reject placeholder/garbage titles
  const BAD_TITLES = /^(title|slug|excerpt|content|post|blog|untitled|heading|n\/a|none|example|sample|here|placeholder)\.?$/i;
  const title = parsed.title.trim();
  // Detect garbage: non-ASCII chars, too many ALL_CAPS words, random brand noise
  const nonAsciiRatio = (title.match(/[^\x00-\x7F]/g) || []).length / title.length;
  const capsWords = (title.match(/\b[A-Z]{2,}\b/g) || []).length;
  const wordCount = title.split(/\s+/).length;
  const isGarbage = nonAsciiRatio > 0.05 || (capsWords > 3 && wordCount < 12) || title.length < 20;
  if (BAD_TITLES.test(title) || isGarbage) {
    await logGeneration(env.DB, null, categoryId, userPrompt, MODEL, null, 'failed', `Bad title: "${title}"`);
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
