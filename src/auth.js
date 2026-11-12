import { supabase } from './supabase.js';

const CONFIGURED_KEY = 'comms-admin-configured';

function authRedirectUrl() {
  if (typeof window === 'undefined') return undefined;
  const base = import.meta.env.BASE_URL || '/';
  return new URL(base, window.location.origin).href;
}

export function sessionIsAdmin(session) {
  return session?.user?.app_metadata?.role === 'admin';
}

export function markAdminConfigured() {
  try {
    localStorage.setItem(CONFIGURED_KEY, '1');
  } catch (_) {
    /* private mode */
  }
}

function readConfiguredFlag() {
  try {
    return localStorage.getItem(CONFIGURED_KEY) === '1';
  } catch (_) {
    return false;
  }
}

export function isAlreadyConfiguredError(error) {
  const raw = `${error?.message || ''} ${error?.details || ''} ${error?.hint || ''}`;
  return /已經設定|不能再註冊|already registered|user already registered/i.test(raw);
}

export function authErrorText(error, fallback) {
  const raw = String(error?.message || '');
  if (/已經設定|不能再註冊/.test(raw)) return '後台帳號已經設定，請登入。';
  if (/already registered|user already registered/i.test(raw)) return '後台帳號已經設定，請登入。';
  if (/email not confirmed/i.test(raw)) return '請先到電郵按確認連結，然後再登入。';
  if (/invalid login credentials/i.test(raw)) return '電郵或密碼唔啱，請再試';
  if (/password should be at least/i.test(raw)) return '密碼最少要 8 個字元';
  if (/valid email|unable to validate email/i.test(raw)) return '請輸入有效嘅電郵地址';
  if (/database error saving new user/i.test(raw)) {
    return '註冊未完成。如果後台帳號已經設定，請改用登入。';
  }
  return raw || fallback;
}

export async function currentAdminSession() {
  const { data } = await supabase.auth.getSession();
  let session = data.session || null;
  if (!session) return null;
  if (!sessionIsAdmin(session)) {
    const refreshed = await supabase.auth.refreshSession();
    if (!refreshed.error && refreshed.data.session) session = refreshed.data.session;
  }
  return sessionIsAdmin(session) ? session : null;
}

export async function fetchAuthStatus() {
  const session = await currentAdminSession();
  return {
    ok: true,
    configured: !!session || readConfiguredFlag(),
    isAdmin: !!session,
  };
}

async function finalizeAdminSession(email, password) {
  const refreshed = await supabase.auth.refreshSession();
  let session = refreshed.data?.session || null;
  if (!sessionIsAdmin(session)) {
    const { data } = await supabase.auth.getSession();
    if (sessionIsAdmin(data.session)) session = data.session;
  }
  if (sessionIsAdmin(session)) {
    markAdminConfigured();
    return session;
  }
  await supabase.auth.signOut();
  const again = await supabase.auth.signInWithPassword({ email, password });
  if (again.error) {
    const wrapped = new Error(authErrorText(again.error, '登入失敗'));
    wrapped.needsLogin = true;
    throw wrapped;
  }
  const second = await supabase.auth.refreshSession();
  session = second.data?.session || again.data.session;
  if (!sessionIsAdmin(session)) {
    const err = new Error('登入未完成，請再登入一次。');
    err.needsLogin = true;
    throw err;
  }
  markAdminConfigured();
  return session;
}

export async function setupAccount(email, password) {
  const emailRedirectTo = authRedirectUrl();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: emailRedirectTo ? { emailRedirectTo } : undefined,
  });
  if (error) {
    const already = isAlreadyConfiguredError(error);
    if (already) markAdminConfigured();
    const wrapped = new Error(authErrorText(error, '設定失敗，請稍後再試'));
    wrapped.needsLogin = already;
    throw wrapped;
  }
  if (data?.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
    markAdminConfigured();
    const err = new Error('後台帳號已經設定，請登入。');
    err.needsLogin = true;
    throw err;
  }
  markAdminConfigured();
  if (!data?.session) {
    const err = new Error('帳號已建立。請到電郵按確認連結（用呢個瀏覽器打開），然後用同一組電郵同密碼登入。');
    err.pendingConfirm = true;
    err.needsLogin = true;
    throw err;
  }
  return finalizeAdminSession(email, password);
}

export async function loginAccount(email, password) {
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    const wrapped = new Error(authErrorText(error, '登入失敗'));
    wrapped.pendingConfirm = /email not confirmed/i.test(error.message || '');
    throw wrapped;
  }
  return finalizeAdminSession(email, password);
}

export async function logout() {
  const { error } = await supabase.auth.signOut();
  if (error) throw new Error('登出失敗，請稍後再試');
}
