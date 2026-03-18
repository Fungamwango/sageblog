import { generatePost, getNextCategory } from '../services/aiGenerator';
import type { Env } from '../types';

// 80% English, 20% other languages — 10-slot cycle: 8 English + 2 non-English
const LANGUAGES: ({ code: string; name: string } | undefined)[] = [
  undefined,                          // English
  undefined,                          // English
  undefined,                          // English
  undefined,                          // English
  { code: 'fr',  name: 'French' },
  undefined,                          // English
  undefined,                          // English
  undefined,                          // English
  undefined,                          // English
  { code: 'bem', name: 'Bemba' },
  undefined,                          // English
  undefined,                          // English
  undefined,                          // English
  undefined,                          // English
  { code: 'ny',  name: 'Chichewa' },
  undefined,                          // English
  undefined,                          // English
  undefined,                          // English
  undefined,                          // English
  { code: 'sw',  name: 'Swahili' },
];

export async function handleScheduled(_event: ScheduledController, env: Env, _ctx: ExecutionContext): Promise<void> {
  console.log('[cron] Starting scheduled tasks');

  // --- 1. Auto-delete posts older than 60 days with 0 views ---
  try {
    const deleted = await env.DB.prepare(`
      DELETE FROM posts
      WHERE ai_generated = 1
        AND views < 1
        AND published_at < datetime('now', '-60 days')
        AND id NOT IN (SELECT post_id FROM comments WHERE post_id IS NOT NULL)
        AND id NOT IN (SELECT post_id FROM likes WHERE post_id IS NOT NULL)
    `).run();
    if (deleted.meta.changes > 0) {
      console.log(`[cron] Cleaned up ${deleted.meta.changes} stale posts`);
    }
  } catch (e) {
    console.error('[cron] Cleanup failed:', e);
  }

  // --- 2. Pick next category (round-robin) ---
  const cat = await getNextCategory(env);
  if (!cat) {
    console.error('[cron] No categories found');
    return;
  }

  // --- 3. Every 6th run, generate in a non-English language ---
  let language: { code: string; name: string } | undefined;
  try {
    const countKey = 'cron_run_count';
    const countRaw = await env.KV_STORE.get(countKey);
    const count = countRaw ? parseInt(countRaw) : 0;
    const nextCount = count + 1;
    await env.KV_STORE.put(countKey, String(nextCount));

    if (nextCount % 6 === 0) {
      language = LANGUAGES[Math.floor((nextCount / 6) % LANGUAGES.length)];
      console.log(`[cron] Language run — generating in ${language?.name || 'English'}`);
    }
  } catch (e) {
    console.error('[cron] Counter error:', e);
  }

  // --- 4. Generate post ---
  console.log(`[cron] Generating post for category: ${cat.name}${language ? ` in ${language.name}` : ''}`);
  const postId = await generatePost(env, cat.slug, cat.id, language);

  if (postId) {
    console.log(`[cron] Successfully generated post ID: ${postId}`);
  } else {
    console.error(`[cron] Failed to generate post for category: ${cat.name}`);
  }
}
