import { apiFetch } from './api.js';
import { themeToggleHTML, toggleTheme } from './theme.js';

const API = 'https://api.sageblog.cfd';

export function getUser() {
  try { return JSON.parse(localStorage.getItem('user') || 'null'); } catch { return null; }
}

export function isLoggedIn() { return !!localStorage.getItem('access_token'); }
export function isAdmin() { const u = getUser(); return u?.role === 'admin'; }

function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

export async function quickLogin(username) {
  let token = localStorage.getItem('quick_token');
  if (!token) { token = generateUUID(); localStorage.setItem('quick_token', token); }

  const res = await fetch(`${API}/auth/quick`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, token }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Login failed');

  localStorage.setItem('access_token', data.token);
  localStorage.setItem('user', JSON.stringify({ id: data.id, username: data.username, role: data.role }));
  return data;
}

export async function login(email, password) {
  const res = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Login failed');
  localStorage.setItem('access_token', data.access_token);
  const me = await apiFetch('/auth/me');
  if (me.ok) localStorage.setItem('user', JSON.stringify(await me.json()));
  return data;
}

export async function logout() {
  try {
    await fetch(`${API}/auth/logout`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${localStorage.getItem('access_token')}` },
    });
  } catch {}
  localStorage.removeItem('access_token');
  localStorage.removeItem('user');
  window.location.href = '/';
}

export function updateHeaderAuth() {
  const user = getUser();
  const authEl = document.getElementById('header-auth');
  if (!authEl) return;

  if (user) {
    authEl.innerHTML = `
      <div style="position:relative;display:inline-block">
        <button id="notif-btn" title="Notifications" style="background:none;border:none;cursor:pointer;font-size:1.15rem;padding:0.25rem;position:relative;line-height:1">🔔<span id="notif-badge" style="display:none;position:absolute;top:-4px;right:-4px;background:var(--danger,#ef4444);color:#fff;font-size:0.6rem;font-weight:700;min-width:16px;height:16px;border-radius:999px;display:none;align-items:center;justify-content:center;padding:0 3px">0</span></button>
        <div id="notif-dropdown" style="display:none;position:absolute;right:0;top:calc(100% + 8px);width:320px;background:var(--bg-2);border:1px solid var(--border);border-radius:var(--r);box-shadow:0 8px 32px rgba(0,0,0,0.4);z-index:999;max-height:400px;overflow-y:auto"></div>
      </div>
      <span style="font-size:0.8rem;color:var(--text-2)">👤 ${escHtml(user.username)}</span>
      ${user.role === 'admin' ? '<a href="/admin" class="btn btn-sm btn-outline">Admin</a>' : ''}
      ${themeToggleHTML()}
    `;
    initNotifications();
  } else {
    authEl.innerHTML = `<a href="/login" class="btn btn-sm btn-primary">Join</a>${themeToggleHTML()}`;
  }

  document.getElementById('theme-toggle-btn')?.addEventListener('click', toggleTheme);
}

const API_BASE = 'https://api.sageblog.cfd';

async function initNotifications() {
  await pollNotifications();
  setInterval(pollNotifications, 60000);

  const btn = document.getElementById('notif-btn');
  const dropdown = document.getElementById('notif-dropdown');
  btn?.addEventListener('click', async (e) => {
    e.stopPropagation();
    const isOpen = dropdown.style.display === 'block';
    dropdown.style.display = isOpen ? 'none' : 'block';
    if (!isOpen) {
      await renderNotifications();
      // Mark all read
      fetch(`${API_BASE}/notifications/read`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${localStorage.getItem('access_token')}` },
      });
      document.getElementById('notif-badge').style.display = 'none';
    }
  });
  document.addEventListener('click', () => { if (dropdown) dropdown.style.display = 'none'; });
}

async function pollNotifications() {
  try {
    const res = await fetch(`${API_BASE}/notifications`, {
      headers: { 'Authorization': `Bearer ${localStorage.getItem('access_token')}` },
    });
    if (!res.ok) return;
    const data = await res.json();
    const badge = document.getElementById('notif-badge');
    if (badge) {
      if (data.unread > 0) {
        badge.textContent = data.unread > 99 ? '99+' : data.unread;
        badge.style.display = 'flex';
      } else {
        badge.style.display = 'none';
      }
    }
    // Cache for dropdown render
    window._notifications = data.notifications;
  } catch {}
}

async function renderNotifications() {
  const dropdown = document.getElementById('notif-dropdown');
  if (!dropdown) return;
  const list = window._notifications || [];
  if (!list.length) {
    dropdown.innerHTML = '<p style="padding:1rem;text-align:center;color:var(--text-3);font-size:0.85rem">No notifications yet</p>';
    return;
  }
  dropdown.innerHTML = `
    <div style="padding:0.75rem 1rem;border-bottom:1px solid var(--border);font-size:0.8rem;font-weight:600;color:var(--text-2)">Notifications</div>
    ${list.map(n => `
      <a href="/post/${escHtml(n.post_slug)}" style="display:block;padding:0.75rem 1rem;border-bottom:1px solid var(--border);text-decoration:none;background:${n.read ? 'transparent' : 'rgba(124,58,237,0.08)'}">
        <div style="font-size:0.8rem;color:var(--text)">
          ${n.type === 'comment' ? '💬' : '♥'}
          <strong>${escHtml(n.actor_username)}</strong>
          ${n.type === 'comment' ? 'commented on' : 'liked'}
          <em style="color:var(--primary-light)">${escHtml(n.post_title)}</em>
        </div>
        <div style="font-size:0.72rem;color:var(--text-3);margin-top:0.2rem">${timeAgo(n.created_at)}</div>
      </a>
    `).join('')}
  `;
}

function timeAgo(dateStr) {
  const diff = Math.floor((Date.now() - new Date(dateStr + 'Z').getTime()) / 1000);
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff/60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff/3600)}h ago`;
  return `${Math.floor(diff/86400)}d ago`;
}

function escHtml(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
