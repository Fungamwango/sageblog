import { json, error } from '../middleware/cors';
import { requireAuth } from '../middleware/auth';
import { uniqueSlug } from '../services/slugify';
import { translateText, translateHtml } from '../services/translate';
import type { Env } from '../types';

const MODEL = '@cf/meta/llama-3.2-3b-instruct';

/** Convert markdown to HTML (mirrors client-side utils.js mdToHtml) */
function mdToHtml(raw: string): string {
  if (!raw) return '';
  if (/^\s*<(p|h[1-6]|ul|ol|div|section|blockquote)[\s>]/i.test(raw)) return raw;
  const lines = raw.split('\n');
  const out: string[] = [];
  let inUl = false, inOl = false;
  const closeList = () => {
    if (inUl) { out.push('</ul>'); inUl = false; }
    if (inOl) { out.push('</ol>'); inOl = false; }
  };
  const inline = (s: string) => s
    .replace(/<\d+>/g, '')
    .replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/__(.+?)__/g, '<strong>$1</strong>')
    .replace(/\*([^*\n]+?)\*/g, '<em>$1</em>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .trim();
  for (let line of lines) {
    line = line.replace(/<br\s*\/?>/gi, '').trim();
    if (!line) { closeList(); continue; }
    if (/^<(h[1-6]|p|ul|ol|li|blockquote|div)[\s>]/i.test(line)) { closeList(); out.push(line); continue; }
    const hm = line.match(/^(#{1,6})\s+(.+)/);
    if (hm) { closeList(); out.push(`<h${Math.min(hm[1].length + 1, 4)}>${inline(hm[2])}</h${Math.min(hm[1].length + 1, 4)}>`); continue; }
    if (line.startsWith('> ')) { closeList(); out.push(`<blockquote><p>${inline(line.slice(2))}</p></blockquote>`); continue; }
    const olm = line.match(/^\d+\.\s+(.+)/);
    if (olm) { if (!inOl) { if (inUl) { out.push('</ul>'); inUl = false; } out.push('<ol>'); inOl = true; } out.push(`<li>${inline(olm[1])}</li>`); continue; }
    const ulm = line.match(/^[-*•]\s+(.+)/);
    if (ulm) { if (!inUl) { if (inOl) { out.push('</ol>'); inOl = false; } out.push('<ul>'); inUl = true; } out.push(`<li>${inline(ulm[1])}</li>`); continue; }
    closeList();
    const text = inline(line);
    if (text) out.push(`<p>${text}</p>`);
  }
  closeList();
  return out.join('\n').trim();
}

/** Translate plain text using Google Translate unofficial API */

export async function handleChat(path: string, method: string, request: Request, env: Env): Promise<Response | null> {
  const origin = request.headers.get('Origin');

  if (!path.startsWith('/chat')) return null;

  // POST /chat — ask a question, get AI answer, log as post
  if (method === 'POST' && path === '/chat') {
    const body = await request.json<{
      question: string;
      language?: string;
      history?: { question: string; answer_en?: string; answer: string }[];
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
      if (turn.answer_en || turn.answer) {
        // Prefer original English answer for context to avoid language contamination
        const raw = turn.answer_en || turn.answer;
        const plainAnswer = raw.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().substring(0, 600);
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
      // If the model returned markdown instead of HTML, convert it
      if (!/^\s*<(p|h[1-6]|ul|ol|div|blockquote)[\s>]/i.test(answer)) {
        answer = mdToHtml(answer);
      }
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
      answer_en: answer, // original English answer for history context
      language: targetLang,
      post_slug: postSlug,
    }, 200, origin);
  }

  return null;
}
