export async function translateText(text: string, targetLang: string): Promise<string> {
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

export async function translateHtml(html: string, targetLang: string): Promise<string> {
  if (!targetLang || targetLang === 'en') return html;
  const plain = html.replace(/<[^>]+>/g, ' ').replace(/\s{2,}/g, ' ').trim();
  const translated = await translateText(plain, targetLang);
  if (!translated || translated === plain) return html;
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
