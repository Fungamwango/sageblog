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
      <div class="post-card-category">
        <a href="/category/${escHtml(post.category_slug || '')}" onclick="event.stopPropagation()">
          ${escHtml(post.category_name || 'General')}
        </a>
      </div>
      <h3>${escHtml(post.title)}</h3>
      <p>${escHtml(post.excerpt)}</p>
      ${tags ? `<div class="post-tags">${tags}</div>` : ''}
      <div class="post-card-footer">
        <div class="post-meta">
          <span class="post-meta-item">📅 ${formatDate(post.published_at)}</span>
          <span class="post-meta-item">⏱ ${post.read_time || 5}m</span>
        </div>
        <div class="post-meta">
          <span class="post-meta-item">♥ ${post.like_count || 0}</span>
          <span class="post-meta-item">💬 ${post.comment_count || 0}</span>
        </div>
      </div>
    </article>
  `;
}
