import { useCallback, useEffect, useState } from 'react';
import type { Film, Settings } from './types';

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export async function api<T>(path: string, opts: { method?: string; body?: unknown } = {}): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method: opts.method || (opts.body ? 'POST' : 'GET'),
    headers: opts.body ? { 'Content-Type': 'application/json' } : undefined,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
    credentials: 'same-origin',
  });
  const data = await res.json().catch(() => null);
  if (res.status === 401 && path.startsWith('/admin') && path !== '/admin/login') window.dispatchEvent(new Event('lw:unauthorized'));
  if (!res.ok) throw new ApiError(res.status, data?.error || `Request failed (${res.status})`);
  return data as T;
}

/** Tiny fetch hook with an in-memory cache so pages share responses. */
const cache = new Map<string, unknown>();
const inflight = new Map<string, Promise<unknown>>();

export function useApi<T>(path: string | null, { cached = false } = {}) {
  const [data, setData] = useState<T | undefined>(() => (path && cached ? (cache.get(path) as T) : undefined));
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(!data && !!path);
  const load = useCallback(async () => {
    if (!path) return;
    setLoading(true);
    try {
      let p = cached ? (inflight.get(path) as Promise<T> | undefined) : undefined;
      if (!p) {
        p = api<T>(path);
        if (cached) inflight.set(path, p);
      }
      const d = await p;
      if (cached) cache.set(path, d);
      setData(d);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      if (cached) inflight.delete(path);
      setLoading(false);
    }
  }, [path, cached]);
  useEffect(() => {
    if (cached && path && cache.has(path)) return;
    load();
  }, [load, cached, path]);
  return { data, error, loading, reload: load, setData };
}

export const useFilms = () => useApi<Film[]>('/films', { cached: true });
export const useSettings = () => useApi<Settings>('/settings', { cached: true });

export function whatsappLink(phone: string | undefined, text = '') {
  const digits = String(phone || '').replace(/\D/g, '');
  return `https://wa.me/${digits}${text ? `?text=${encodeURIComponent(text)}` : ''}`;
}

export function fmtDate(iso: string | null | undefined, opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' }) {
  if (!iso) return '—';
  const d = iso.length === 10 ? new Date(iso + 'T12:00:00') : new Date(iso);
  return d.toLocaleDateString('en-KE', opts);
}

export function timeAgo(iso: string) {
  const s = (Date.now() - Date.parse(iso)) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 86400 * 7) return `${Math.floor(s / 86400)}d ago`;
  return fmtDate(iso);
}

/** Share links carry the whole build in the URL hash-free query (?b=...). */
export function encodeBuild(cfg: unknown) {
  return btoa(unescape(encodeURIComponent(JSON.stringify(cfg)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
export function decodeBuild(s: string) {
  try {
    return JSON.parse(decodeURIComponent(escape(atob(s.replace(/-/g, '+').replace(/_/g, '/')))));
  } catch {
    return null;
  }
}
