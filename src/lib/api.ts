/** Thin wrappers around the ChartCheck REST API. */

import { ChartAnalysis, ChartAnalysisRequest, PricingResponse, QuotaState } from '../types';
import { getClientId } from './client';

export class ApiError extends Error {
  status: number;
  paywall: boolean;
  quota: QuotaState | null;

  constructor(message: string, status: number, options: { paywall?: boolean; quota?: QuotaState } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.paywall = options.paywall ?? false;
    this.quota = options.quota ?? null;
  }
}

async function request<T>(url: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      'x-client-id': getClientId(),
      ...(init.headers ?? {}),
    },
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new ApiError(payload?.error || 'Unerwarteter Serverfehler.', response.status, {
      paywall: payload?.paywall,
      quota: payload?.quota,
    });
  }

  return payload as T;
}

export function fetchPricing(): Promise<PricingResponse> {
  return request<PricingResponse>('/api/pricing');
}

export function fetchQuota(): Promise<QuotaState> {
  return request<QuotaState>('/api/quota');
}

export function analyzeChart(
  body: ChartAnalysisRequest,
): Promise<{ analysis: ChartAnalysis; quota: QuotaState }> {
  return request('/api/analyze', { method: 'POST', body: JSON.stringify(body) });
}

export function startCheckout(
  planId: string,
): Promise<{ mode: 'stripe'; url: string } | { mode: 'demo'; message: string; quota: QuotaState }> {
  return request('/api/subscription/checkout', {
    method: 'POST',
    body: JSON.stringify({ planId }),
  });
}

export function confirmCheckout(sessionId: string): Promise<{ success: boolean; quota: QuotaState }> {
  return request('/api/subscription/confirm', {
    method: 'POST',
    body: JSON.stringify({ sessionId }),
  });
}

export function cancelSubscription(): Promise<{ success: boolean; quota: QuotaState }> {
  return request('/api/subscription/cancel', { method: 'POST' });
}
