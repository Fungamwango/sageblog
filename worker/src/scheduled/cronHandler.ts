import { generatePost, getNextCategory } from '../services/aiGenerator';
import type { Env } from '../types';

export async function handleScheduled(_event: ScheduledController, env: Env, _ctx: ExecutionContext): Promise<void> {
  console.log('[cron] Starting scheduled AI post generation');

  const cat = await getNextCategory(env);
  if (!cat) {
    console.error('[cron] No categories found');
    return;
  }

  console.log(`[cron] Generating post for category: ${cat.name}`);
  const postId = await generatePost(env, cat.slug, cat.id);

  if (postId) {
    console.log(`[cron] Successfully generated post ID: ${postId}`);
  } else {
    console.error(`[cron] Failed to generate post for category: ${cat.name}`);
  }
}
