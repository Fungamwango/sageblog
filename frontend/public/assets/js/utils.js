export function formatDate(dateStr) {
  if (!dateStr) return '';
  return new Date(dateStr).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

export function timeAgo(dateStr) {
  if (!dateStr) return '';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return formatDate(dateStr);
}

export function escHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

export function slugFromPath(prefix = '') {
  const parts = window.location.pathname.replace(prefix, '').split('/').filter(Boolean);
  return parts[0] || '';
}

export function getParam(name) {
  return new URLSearchParams(window.location.search).get(name);
}

export function setParam(name, value) {
  const url = new URL(window.location.href);
  if (value) url.searchParams.set(name, value);
  else url.searchParams.delete(name);
  window.history.pushState({}, '', url);
}

let toastContainer = null;

export function toast(message, type = 'success', duration = 3500) {
  if (!toastContainer) {
    toastContainer = document.createElement('div');
    toastContainer.className = 'toast-container';
    document.body.appendChild(toastContainer);
  }
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.innerHTML = `${type === 'success' ? '✓' : '✕'} ${escHtml(message)}`;
  toastContainer.appendChild(el);
  setTimeout(() => el.remove(), duration);
}

/** Convert markdown text to HTML. Passes through already-valid HTML untouched. */
export function mdToHtml(raw) {
  if (!raw) return '';
  // If content looks like clean HTML (starts with a block tag), return as-is
  if (/^\s*<(p|h[1-6]|ul|ol|div|section|blockquote)[\s>]/i.test(raw)) return raw;

  const lines = raw.split('\n');
  const out = [];
  let inUl = false, inOl = false;

  const closeList = () => {
    if (inUl) { out.push('</ul>'); inUl = false; }
    if (inOl) { out.push('</ol>'); inOl = false; }
  };

  const inline = s => s
    .replace(/<\d+>/g, '')                                     // strip <2> artefacts
    .replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/__(.+?)__/g, '<strong>$1</strong>')
    .replace(/\*([^*\n]+?)\*/g, '<em>$1</em>')
    .replace(/_([^_\n]+?)_/g, '<em>$1</em>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/^\*\s*/, '').trim();

  for (let line of lines) {
    line = line.replace(/<br\s*\/?>/gi, '').trim();
    if (!line) { closeList(); out.push(''); continue; }

    // Pass through existing HTML block elements
    if (/^<(h[1-6]|p|ul|ol|li|blockquote|div|pre|table)[\s>]/i.test(line)) {
      closeList(); out.push(line); continue;
    }
    // Headings
    const hm = line.match(/^(#{1,6})\s+(.+)/);
    if (hm) { closeList(); const lvl = Math.min(hm[1].length + 1, 4); out.push(`<h${lvl}>${inline(hm[2])}</h${lvl}>`); continue; }
    // Blockquote
    if (line.startsWith('> ')) { closeList(); out.push(`<blockquote><p>${inline(line.slice(2))}</p></blockquote>`); continue; }
    // Ordered list
    const olm = line.match(/^\d+\.\s+(.+)/);
    if (olm) { if (!inOl) { if (inUl) { out.push('</ul>'); inUl = false; } out.push('<ol>'); inOl = true; } out.push(`<li>${inline(olm[1])}</li>`); continue; }
    // Unordered list
    const ulm = line.match(/^[-*•]\s+(.+)/);
    if (ulm) { if (!inUl) { if (inOl) { out.push('</ol>'); inOl = false; } out.push('<ul>'); inUl = true; } out.push(`<li>${inline(ulm[1])}</li>`); continue; }
    // HR
    if (/^[-*_]{3,}$/.test(line)) { closeList(); out.push('<hr>'); continue; }
    // Paragraph
    closeList();
    const text = inline(line);
    if (text) out.push(`<p>${text}</p>`);
  }
  closeList();
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

export function compressImage(file, maxKb = 20) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const canvas = document.createElement('canvas');
      // Scale dimensions so estimated JPEG output fits within maxKb
      const maxPx = (maxKb * 1024) / 2.5;
      const ratio = Math.min(1, Math.sqrt(maxPx / (img.width * img.height)));
      canvas.width = Math.round(img.width * ratio);
      canvas.height = Math.round(img.height * ratio);
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Compression failed')), 'image/jpeg', 0.75);
    };
    img.onerror = reject;
    img.src = url;
  });
}

export function debounce(fn, delay) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), delay); };
}

export function renderSkeleton(count = 6) {
  return Array.from({ length: count }, () => `
    <div class="post-card">
      <div class="skeleton" style="height:20px;width:60%;margin-bottom:12px"></div>
      <div class="skeleton" style="height:28px;width:90%;margin-bottom:8px"></div>
      <div class="skeleton" style="height:16px;width:100%;margin-bottom:6px"></div>
      <div class="skeleton" style="height:16px;width:80%"></div>
    </div>
  `).join('');
}

export function renderPostCard(post) {
  const tags = (post.tags || []).slice(0, 3).map(t =>
    `<a href="/tag/${escHtml(t.toLowerCase().replace(/\s+/g,'-'))}" class="tag-pill">${escHtml(t)}</a>`
  ).join('');

  return `
    <article class="post-card" onclick="location.href='/post/${escHtml(post.slug)}'">
      <div class="post-card-top">
        <a class="cat-pill" href="/category/${escHtml(post.category_slug || '')}" onclick="event.stopPropagation()">
          ${escHtml(post.category_name || 'General')}
        </a>
        ${post.ai_generated ? '<span class="ai-badge">🤖 AI</span>' : ''}
      </div>
      <h3>${escHtml(post.title)}</h3>
      <p>${escHtml(post.excerpt)}</p>
      ${tags ? `<div class="post-tags">${tags}</div>` : ''}
      <div class="post-card-footer">
        <div class="post-meta">
          <span class="meta-item">📅 ${formatDate(post.published_at)}</span>
          <span class="meta-item">⏱ ${post.read_time || 5}m</span>
        </div>
        <div class="post-meta">
          <span class="meta-item">♥ ${post.like_count || 0}</span>
          <span class="meta-item">💬 ${post.comment_count || 0}</span>
        </div>
      </div>
    </article>
  `;
}
