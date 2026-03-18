// Set copyright year dynamically on all pages
document.querySelectorAll('.copy-year').forEach(el => el.textContent = new Date().getFullYear());

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

export function linkify(text) {
  return escHtml(text).replace(
    /https?:\/\/[^\s<>"']+/g,
    url => `<a href="${url}" target="_blank" rel="noopener noreferrer" style="color:var(--primary-light);word-break:break-all">${url}</a>`
  );
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
  // If content looks like clean HTML (starts with a block tag), just linkify bare URLs and return
  if (/^\s*<(p|h[1-6]|ul|ol|div|section|blockquote)[\s>]/i.test(raw)) {
    return raw.replace(/(?<![="'>])(https?:\/\/[^\s<>"']+)/g,
      url => `<a href="${url}" target="_blank" rel="noopener noreferrer" style="color:var(--primary-light);word-break:break-all">${url}</a>`);
  }

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
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>')
    .replace(/(?<![="'>])(https?:\/\/[^\s<>"']+)/g, '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>')
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

export function compressImage(file, maxKb = 60) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const canvas = document.createElement('canvas');
      // Cap longest side at 1200px, then iterate quality until under maxKb
      const maxSide = 1200;
      const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      const tryQuality = (q) => {
        canvas.toBlob(blob => {
          if (!blob) return reject(new Error('Compression failed'));
          if (blob.size <= maxKb * 1024 || q <= 0.3) return resolve(blob);
          tryQuality(Math.round((q - 0.05) * 100) / 100);
        }, 'image/jpeg', q);
      };
      tryQuality(0.92);
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

  const imgSrc = post.content?.match(/<img[^>]+src="([^"]+)"/i)?.[1] || null;
  const vidSrc = post.content?.match(/<video[^>]+src="([^"]+)"/i)?.[1] || null;

  let mediaHtml = '';
  if (vidSrc) {
    mediaHtml = `<div class="post-card-media">
      <video src="${escHtml(vidSrc)}" muted playsinline preload="metadata" class="post-card-media-el"></video>
      <span class="post-card-media-badge">▶ Video</span>
    </div>`;
  } else if (imgSrc) {
    mediaHtml = `<div class="post-card-media">
      <img src="${escHtml(imgSrc)}" alt="${escHtml(post.title)}" loading="lazy" class="post-card-media-el">
    </div>`;
  }

  return `
    <article class="post-card${mediaHtml ? ' post-card--media' : ''}" onclick="location.href='/post/${escHtml(post.slug)}'">
      ${mediaHtml}
      <div class="post-card-body">
        <div class="post-card-top">
          <a class="cat-pill" href="/category/${escHtml(post.category_slug || '')}" onclick="event.stopPropagation()">
            ${escHtml(post.category_name || 'General')}
          </a>
          ${post.ai_generated
            ? '<span class="ai-badge">🤖 AI</span>'
            : post.author_username
              ? `<span class="ai-badge" style="background:rgba(99,102,241,0.15);color:var(--primary-light);border:1px solid rgba(99,102,241,0.3)">👤 ${escHtml(post.author_username)}</span>`
              : ''}
        </div>
        <h3>${escHtml(post.title)}</h3>
        <p>${escHtml(post.excerpt ? (post.excerpt.length >= 150 ? post.excerpt.substring(0, 150) + '…' : post.excerpt) : '')}</p>
        ${tags ? `<div class="post-tags">${tags}</div>` : ''}
        <div class="post-card-footer">
          <div class="post-meta">
            <span class="meta-item">📅 ${formatDate(post.published_at)}</span>
          </div>
          <div class="post-meta">
            <span class="meta-item">♥ ${post.like_count || 0}</span>
            <span class="meta-item">💬 ${post.comment_count || 0}</span>
          </div>
        </div>
      </div>
    </article>
  `;
}
