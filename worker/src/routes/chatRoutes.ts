import { json, error } from '../middleware/cors';
import { requireAuth } from '../middleware/auth';
import { uniqueSlug } from '../services/slugify';
import type { Env } from '../types';

const MODEL = '@cf/meta/llama-3.2-3b-instruct';

/** Translate plain text using Google Translate unofficial API */
async function translateText(text: string, targetLang: string): Promise<string> {
  if (!targetLang || targetLang === 'en') return text;
  try {
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=${encodeURIComponent(targetLang)}&dt=t&q=${encodeURIComponent(text)}`;
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    if (!res.ok) return text;
    const data: any = await res.json();
    const translated = (data[0] as any[][]).map((seg: any[]) => seg[0]).join('');
    return translated || text;
  } catch {
    return text;
  }
}

/** Translate HTML content: splits into text nodes, translates, reassembles */
async function translateHtml(html: string, targetLang: string): Promise<string> {
  if (!targetLang || targetLang === 'en') return html;
  // Extract plain text (strip tags), translate, then wrap result in simple paragraphs
  const plain = html.replace(/<[^>]+>/g, ' ').replace(/\s{2,}/g, ' ').trim();
  const translated = await translateText(plain, targetLang);
  if (!translated || translated === plain) return html; // translation failed or same
  // Wrap translated text in paragraphs split by sentence boundaries
  const sentences = translated.split(/(?<=[.!?।؟])\s+/);
  const chunks: string[] = [];
  let current = '';
  for (const s of sentences) {
    current += (current ? ' ' : '') + s;
    if (current.length > 200) { chunks.push(current); current = ''; }
  }
  if (current) chunks.push(current);
  return chunks.map(c => `<p>${c}</p>`).join('\n');
}

export async function handleChat(path: string, method: string, request: Request, env: Env): Promise<Response | null> {
  const origin = request.headers.get('Origin');

  if (!path.startsWith('/chat')) return null;

  // POST /chat — ask a question, get AI answer, log as post
  if (method === 'POST' && path === '/chat') {
    const body = await request.json<{
      question: string;
      language?: string;
      history?: { question: string; answer: string }[];
    }>().catch(() => null);
    if (!body?.question?.trim()) return error('question is required', 400, origin);

    const question = body.question.trim().substring(0, 500);
    const targetLang = (body.language || 'en').substring(0, 10);
    // Accept up to 6 prior turns as context (keep token budget reasonable)
    const priorTurns = (body.history || []).slice(-6);

    // Get logged-in user if any (optional)
    const user = await requireAuth(request, env);

    // Build conversation messages with history
    const historyMessages: { role: string; content: string }[] = [];
    for (const turn of priorTurns) {
      if (turn.question) historyMessages.push({ role: 'user', content: turn.question.substring(0, 300) });
      if (turn.answer) {
        // Strip HTML tags from stored answers before passing as assistant context
        const plainAnswer = turn.answer.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().substring(0, 600);
        historyMessages.push({ role: 'assistant', content: plainAnswer });
      }
    }

    // Generate AI answer
    let answer = '';
    try {
      const response = await (env.AI as any).run(MODEL, {
        messages: [
          {
            role: 'system',
            content: `You are SageBot, a helpful AI assistant on SageBlog. Answer the user's question directly and naturally.
RULES:
- Never describe or explain your own formatting. Never demonstrate HTML with examples. Never talk about how you will answer — just answer.
- Output clean HTML: use <p> for paragraphs, <h3> for section headings, <ul><li> for lists, <strong> for emphasis. No markdown, no code fences.
- Be direct, clear, and helpful. 150–400 words depending on the question.
- For casual greetings like "how are you", respond warmly and briefly in 1–2 sentences, then invite a question.`,
          },
          ...historyMessages,
          { role: 'user', content: question },
        ],
        max_tokens: 1000,
        temperature: 0.8,
      });
      answer = typeof response === 'string' ? response : (response?.response ?? '');
      // Strip markdown code fences the model sometimes wraps HTML in
      answer = answer.replace(/^```(?:html)?\s*/i, '').replace(/\s*```\s*$/, '').trim();
    } catch (err) {
      console.error('[chat] AI call failed:', err);
      return error('AI unavailable', 503, origin);
    }

    if (!answer.trim()) return error('No response from AI', 500, origin);

    // Translate both question and answer if non-English
    const [translatedQ, translatedA] = await Promise.all([
      targetLang !== 'en' ? translateText(question, targetLang) : Promise.resolve(question),
      targetLang !== 'en' ? translateHtml(answer, targetLang) : Promise.resolve(answer),
    ]);

    // Save as a blog post (question = title, answer = content)
    let postSlug: string | null = null;
    try {
      // Get "Others" category id
      const cat = await env.DB.prepare(`SELECT id FROM categories WHERE slug = 'others' LIMIT 1`).first<{ id: number }>();
      const categoryId = cat?.id || 1;
      const title = translatedQ.substring(0, 200);
      const excerpt = translatedA.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().substring(0, 200);
      const slug = await uniqueSlug(env.DB, title);

      await env.DB.prepare(`
        INSERT INTO posts (title, slug, excerpt, content, category_id, author_id, ai_generated, meta_title, meta_desc, status, published_at)
        VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, 'published', datetime('now'))
      `).bind(
        title, slug, excerpt, translatedA, categoryId,
        user?.sub ?? null, title, excerpt,
      ).run();

      postSlug = slug;
    } catch (e) {
      console.error('[chat] failed to save post:', e);
    }

    return json({
      question: translatedQ,
      answer: translatedA,
      language: targetLang,
      post_slug: postSlug,
    }, 200, origin);
  }

  return null;
}
