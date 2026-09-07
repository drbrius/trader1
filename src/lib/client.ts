/**
 * Browser-side identity and local history.
 *
 * There is no login: a random client id in localStorage identifies the browser
 * against the quota/subscription API. Analyses are kept locally so the user has
 * a history without us storing their charts on the server.
 */

import { ChartAnalysis } from '../types';

const CLIENT_ID_KEY = 'chartcheck.clientId';
const HISTORY_KEY = 'chartcheck.history';
const MAX_HISTORY = 20;

export function getClientId(): string {
  try {
    const existing = localStorage.getItem(CLIENT_ID_KEY);
    if (existing && /^[A-Za-z0-9_-]{8,64}$/.test(existing)) {
      return existing;
    }
    const generated =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `c${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
    localStorage.setItem(CLIENT_ID_KEY, generated);
    return generated;
  } catch {
    // Private mode with blocked storage: fall back to a per-session id.
    return `c${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
  }
}

export function loadHistory(): ChartAnalysis[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveToHistory(analysis: ChartAnalysis): ChartAnalysis[] {
  const next = [analysis, ...loadHistory()].slice(0, MAX_HISTORY);
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
  } catch {
    // Storage full or blocked — the in-memory list still works for this session.
  }
  return next;
}

export function clearHistory(): void {
  try {
    localStorage.removeItem(HISTORY_KEY);
  } catch {
    /* nothing to do */
  }
}

/** Splits a data URL into the parts the API expects. */
export function splitDataUrl(dataUrl: string): { mimeType: string; base64: string } | null {
  const match = /^data:([^;,]+);base64,(.+)$/.exec(dataUrl);
  if (!match) return null;
  return { mimeType: match[1], base64: match[2] };
}

export function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Die Datei konnte nicht gelesen werden.'));
    reader.readAsDataURL(file);
  });
}
