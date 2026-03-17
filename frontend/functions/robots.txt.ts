export async function onRequestGet(ctx: any) {
  const resp = await ctx.env.API.fetch(new Request('https://placeholder/robots.txt', ctx.request));
  return new Response(resp.body, {
    status: resp.status,
    headers: { 'Content-Type': 'text/plain', 'Cache-Control': 'public, max-age=86400' },
  });
}
