import { supabase } from '../lib/supabase';

export async function getAdminAccessToken() {
  // Prefer the API token stored at login — it matches the server JWT/Supabase
  // session issued by /api/auth/login. Fall back to the browser session.
  const storedToken = window.localStorage.getItem('authToken');
  if (storedToken) {
    return storedToken;
  }

  try {
    const { data, error } = await supabase.auth.getSession();
    if (!error && data?.session?.access_token) {
      return data.session.access_token;
    }
  } catch (error) {
    console.warn('Supabase session lookup failed:', error);
  }

  return '';
}

export function authHeaders(token) {
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export function normalizeRole(value) {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  if (typeof value === 'string') {
    const normalized = value.trim().toUpperCase();
    return normalized || null;
  }

  if (typeof value === 'object') {
    const candidate =
      value.name ||
      value.role_name ||
      value.role ||
      value.title ||
      '';
    const normalized = String(candidate).trim().toUpperCase();
    return normalized || null;
  }

  const normalized = String(value).trim().toUpperCase();
  return normalized || null;
}

export function getDashboardPath(role) {
  const roleMap = {
    CITIZEN: '/citizen/dashboard',
    TANOD: '/tanod/dashboard',
    OFFICIAL: '/official/dashboard',
    LUPON: '/lupon/dashboard',
    ADMIN: '/admin/dashboard',
  };

  return roleMap[normalizeRole(role)] || '/login';
}
