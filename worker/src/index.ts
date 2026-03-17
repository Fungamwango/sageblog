import { handleOptions, json, error } from './middleware/cors';
import { handleAuth } from './routes/authRoutes';
import { handlePosts } from './routes/postRoutes';
import { handleComments } from './routes/commentRoutes';
import { handleLikes } from './routes/likeRoutes';
import { handleTaxonomy } from './routes/taxonomyRoutes';
import { handleAdmin } from './routes/adminRoutes';
import { handleSEO } from './routes/seoRoutes';
import { handleScheduled } from './scheduled/cronHandler';
import type { Env } from './types';

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const preflight = handleOptions(request);
    if (preflight) return preflight;

    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;
    const origin = request.headers.get('Origin');

    try {
      // Route to handlers in order
      let response: Response | null = null;

      response = await handleSEO(path, method, request, env);
      if (response) return response;

      response = await handleAuth(path, method, request, env);
      if (response) return response;

      response = await handleAdmin(path, method, request, env);
      if (response) return response;

      response = await handlePosts(path, method, request, env);
      if (response) return response;

      response = await handleComments(path, method, request, env);
      if (response) return response;

      response = await handleLikes(path, method, request, env);
      if (response) return response;

      response = await handleTaxonomy(path, method, request, env);
      if (response) return response;

      return error('Not Found', 404, origin);
    } catch (err) {
      console.error('[worker error]', err);
      return error('Internal Server Error', 500, origin);
    }
  },

  scheduled: handleScheduled,
} satisfies ExportedHandler<Env>;
