import { post, apiFetch } from './api.js';
import { toast } from './utils.js';

export function getUser() {
  try { return JSON.parse(localStorage.getItem('user') || 'null'); } catch { return null; }
}

export function isLoggedIn() { return !!localStorage.getItem('access_token'); }
export function isAdmin() { const u = getUser(); return u?.role === 'admin'; }

export async function login(email, password) {
  const data = await post('/auth/login', { email, password });
  localStorage.setItem('access_token', data.access_token);
  localStorage.setItem('refresh_token', data.refresh_token);
  // Fetch profile
  const res = await apiFetch('/auth/me');
  if (res.ok) {
    const user = await res.json();
    localStorage.setItem('user', JSON.stringify(user));
  }
  return data;
}

export async function register(username, email, password, adminSecret = '') {
  const body = { username, email, password };
  if (adminSecret) body.admin_secret = adminSecret;
  const data = await post('/auth/register', body);
  localStorage.setItem('access_token', data.access_token);
  localStorage.setItem('refresh_token', data.refresh_token);
  const res = await apiFetch('/auth/me');
  if (res.ok) {
    const user = await res.json();
    localStorage.setItem('user', JSON.stringify(user));
  }
  return data;
}

export async function logout() {
  try { await post('/auth/logout', {}); } catch {}
  localStorage.removeItem('access_token');
  localStorage.removeItem('refresh_token');
  localStorage.removeItem('user');
  window.location.href = '/';
}

export function updateHeaderAuth() {
  const user = getUser();
  const authEl = document.getElementById('header-auth');
  if (!authEl) return;

  if (user) {
    authEl.innerHTML = `
      <span class="text-muted text-sm">Hi, ${escHtml(user.username)}</span>
      ${user.role === 'admin' ? '<a href="/admin" class="btn btn-sm btn-outline">Admin</a>' : ''}
      <button class="btn btn-sm btn-outline" id="logout-btn">Logout</button>
    `;
    document.getElementById('logout-btn')?.addEventListener('click', logout);
  } else {
    authEl.innerHTML = `<a href="/login" class="btn btn-sm btn-primary">Sign In</a>`;
  }
}

function escHtml(str) {
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
