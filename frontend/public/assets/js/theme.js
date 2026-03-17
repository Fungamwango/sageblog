export function initTheme() {
  const saved = localStorage.getItem('theme') || 'dark';
  document.documentElement.dataset.theme = saved;
}

export function toggleTheme() {
  const current = document.documentElement.dataset.theme || 'dark';
  const next = current === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = next;
  localStorage.setItem('theme', next);
  updateToggleIcons();
}

export function updateToggleIcons() {
  const isDark = (document.documentElement.dataset.theme || 'dark') === 'dark';
  document.querySelectorAll('.theme-toggle').forEach(btn => {
    btn.title = isDark ? 'Switch to light mode' : 'Switch to dark mode';
    btn.textContent = isDark ? '☀️' : '🌙';
  });
}

export function themeToggleHTML() {
  const isDark = (document.documentElement.dataset.theme || 'dark') === 'dark';
  return `<button class="theme-toggle" id="theme-toggle-btn" title="${isDark ? 'Switch to light mode' : 'Switch to dark mode'}">${isDark ? '☀️' : '🌙'}</button>`;
}

// Auto-init on import
initTheme();
