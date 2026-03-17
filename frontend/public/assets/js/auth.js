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
      <span style="font-size:0.8rem;color:var(--text-2)">👤 ${escHtml(user.username)}</span>
      ${user.role === 'admin' ? '<a href="/admin" class="btn btn-sm btn-outline">Admin</a>' : ''}
      ${themeToggleHTML()}
    `;
  } else {
    authEl.innerHTML = `<a href="/login" class="btn btn-sm btn-primary">Join</a>${themeToggleHTML()}`;
  }

  document.getElementById('theme-toggle-btn')?.addEventListener('click', toggleTheme);
}

function escHtml(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
