/**
 * Subscription state, monthly quota and Stripe checkout.
 *
 * State is kept in a JSON file next to the existing simulated database, keyed
 * by an anonymous client id the browser stores in localStorage. That is enough
 * for a single-operator launch; swapping the store for a real user table only
 * means replacing the read/write helpers below.
 *
 * Stripe is called over its REST API with fetch, so no extra dependency is
 * required. When STRIPE_SECRET_KEY (or the plan's price id) is missing, the
 * checkout runs in an explicit demo mode that never pretends a payment
 * happened.
 */

import fs from 'fs';
import path from 'path';
import { QuotaState } from '../src/types';
import { FREE_TRIAL_ANALYSES, Plan, getPlan } from './pricing';

const DATA_DIR = path.join(process.cwd(), 'data');
const STORE_FILE = path.join(DATA_DIR, 'subscriptions.json');

interface ClientRecord {
  clientId: string;
  planId: string | null;
  status: 'none' | 'active' | 'cancelled';
  /** Start of the current usage month, ISO date. */
  periodStart: string;
  /** End of the paid period, ISO date. Null when not subscribed. */
  renewsAt: string | null;
  /** Analyses used in the current usage month. */
  used: number;
  /** Free-trial analyses consumed, ever. */
  freeTrialUsed: number;
  stripeCustomerId: string | null;
  stripeSessionId: string | null;
  createdAt: string;
}

interface Store {
  clients: Record<string, ClientRecord>;
}

function ensureStore(): Store {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(STORE_FILE)) {
    fs.writeFileSync(STORE_FILE, JSON.stringify({ clients: {} }, null, 2));
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(STORE_FILE, 'utf-8'));
    return parsed && typeof parsed === 'object' && parsed.clients ? parsed : { clients: {} };
  } catch {
    return { clients: {} };
  }
}

function writeStore(store: Store): void {
  fs.writeFileSync(STORE_FILE, JSON.stringify(store, null, 2));
}

function currentPeriodStart(): string {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
}

function addMonths(from: Date, months: number): Date {
  const next = new Date(from.getTime());
  next.setUTCMonth(next.getUTCMonth() + months);
  return next;
}

/** Client ids come from the browser; keep them short and boring. */
export function sanitiseClientId(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!/^[A-Za-z0-9_-]{8,64}$/.test(trimmed)) return null;
  return trimmed;
}

function loadRecord(store: Store, clientId: string): ClientRecord {
  const existing = store.clients[clientId];
  const record: ClientRecord = existing ?? {
    clientId,
    planId: null,
    status: 'none',
    periodStart: currentPeriodStart(),
    renewsAt: null,
    used: 0,
    freeTrialUsed: 0,
    stripeCustomerId: null,
    stripeSessionId: null,
    createdAt: new Date().toISOString(),
  };

  // Roll the usage counter over at the start of each calendar month.
  const period = currentPeriodStart();
  if (record.periodStart !== period) {
    record.periodStart = period;
    record.used = 0;
  }

  // Expire a subscription whose paid period has run out.
  if (record.status === 'active' && record.renewsAt && new Date(record.renewsAt) < new Date()) {
    record.status = 'cancelled';
  }

  store.clients[clientId] = record;
  return record;
}

function toQuotaState(record: ClientRecord): QuotaState {
  const plan = record.planId ? getPlan(record.planId) : undefined;
  const subscribed = record.status === 'active' && !!plan;

  const limit = subscribed ? plan!.analysesPerMonth : FREE_TRIAL_ANALYSES;
  const used = subscribed ? record.used : record.freeTrialUsed;

  return {
    used,
    limit,
    remaining: Math.max(0, limit - used),
    freeTrial: !subscribed,
    freeTrialUsed: record.freeTrialUsed,
    freeTrialLimit: FREE_TRIAL_ANALYSES,
    subscribed,
    planId: subscribed ? plan!.id : null,
    planName: subscribed ? plan!.name : null,
    renewsAt: subscribed ? record.renewsAt : null,
    periodStart: record.periodStart,
  };
}

export function getQuota(clientId: string): QuotaState {
  const store = ensureStore();
  const record = loadRecord(store, clientId);
  writeStore(store);
  return toQuotaState(record);
}

/**
 * Books one analysis against the client's allowance.
 * Returns null when nothing is left, so the route can show the paywall.
 */
export function consumeAnalysis(clientId: string): QuotaState | null {
  const store = ensureStore();
  const record = loadRecord(store, clientId);
  const quota = toQuotaState(record);

  if (quota.remaining <= 0) {
    writeStore(store);
    return null;
  }

  if (quota.subscribed) {
    record.used += 1;
  } else {
    record.freeTrialUsed += 1;
  }

  store.clients[clientId] = record;
  writeStore(store);
  return toQuotaState(record);
}

/** Activates a plan for a client. Used after a confirmed Stripe payment. */
export function activatePlan(
  clientId: string,
  plan: Plan,
  options: { stripeSessionId?: string; stripeCustomerId?: string } = {},
): QuotaState {
  const store = ensureStore();
  const record = loadRecord(store, clientId);

  record.planId = plan.id;
  record.status = 'active';
  record.renewsAt = addMonths(new Date(), plan.interval === 'year' ? 12 : 1).toISOString();
  record.used = 0;
  record.stripeSessionId = options.stripeSessionId ?? record.stripeSessionId;
  record.stripeCustomerId = options.stripeCustomerId ?? record.stripeCustomerId;

  store.clients[clientId] = record;
  writeStore(store);
  return toQuotaState(record);
}

/** Ends a subscription immediately (the operator's "cancel" button). */
export function cancelPlan(clientId: string): QuotaState {
  const store = ensureStore();
  const record = loadRecord(store, clientId);
  record.status = 'cancelled';
  record.renewsAt = null;
  store.clients[clientId] = record;
  writeStore(store);
  return toQuotaState(record);
}

// --- Stripe -----------------------------------------------------------------

export function stripeConfigured(plan?: Plan): boolean {
  if (!process.env.STRIPE_SECRET_KEY) return false;
  if (!plan) return true;
  return !!process.env[plan.stripePriceIdEnv];
}

function stripeForm(payload: Record<string, string>): string {
  return Object.entries(payload)
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join('&');
}

async function stripeRequest(method: 'GET' | 'POST', endpoint: string, body?: Record<string, string>) {
  const response = await fetch(`https://api.stripe.com/v1/${endpoint}`, {
    method,
    headers: {
      Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`,
      ...(body ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
    },
    ...(body ? { body: stripeForm(body) } : {}),
  });

  const json: any = await response.json();
  if (!response.ok) {
    throw new Error(json?.error?.message || `Stripe request failed (${response.status})`);
  }
  return json;
}

/**
 * Creates a Stripe Checkout session and returns the URL the browser must go to.
 * The client id travels in client_reference_id so the success callback can
 * match the payment back to the right browser.
 */
export async function createCheckoutSession(
  clientId: string,
  plan: Plan,
  appUrl: string,
): Promise<string> {
  const priceId = process.env[plan.stripePriceIdEnv];
  if (!priceId) {
    throw new Error(`Missing Stripe price id in ${plan.stripePriceIdEnv}`);
  }

  const session = await stripeRequest('POST', 'checkout/sessions', {
    mode: 'subscription',
    'line_items[0][price]': priceId,
    'line_items[0][quantity]': '1',
    client_reference_id: clientId,
    success_url: `${appUrl}/?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${appUrl}/?checkout=cancelled`,
    allow_promotion_codes: 'true',
  });

  if (!session?.url) {
    throw new Error('Stripe returned no checkout URL.');
  }
  return session.url as string;
}

/**
 * Confirms a checkout session server-side before unlocking anything.
 * For production, add a webhook on checkout.session.completed as well so a
 * closed browser tab cannot lose the activation.
 */
export async function confirmCheckoutSession(
  sessionId: string,
): Promise<{ clientId: string; plan: Plan; customerId: string | null }> {
  const session = await stripeRequest('GET', `checkout/sessions/${encodeURIComponent(sessionId)}`);

  if (session.payment_status !== 'paid' && session.status !== 'complete') {
    throw new Error('Die Zahlung wurde von Stripe noch nicht bestätigt.');
  }

  const clientId = sanitiseClientId(session.client_reference_id);
  if (!clientId) {
    throw new Error('Die Checkout-Session enthält keine gültige Client-Referenz.');
  }

  // Match the paid price back to one of our plans.
  const lineItems = await stripeRequest(
    'GET',
    `checkout/sessions/${encodeURIComponent(sessionId)}/line_items`,
  );
  const paidPriceId: string | undefined = lineItems?.data?.[0]?.price?.id;

  const plan = [getPlan('pro_monthly'), getPlan('pro_yearly')]
    .filter((entry): entry is Plan => !!entry)
    .find((entry) => process.env[entry.stripePriceIdEnv] === paidPriceId);

  if (!plan) {
    throw new Error('Der bezahlte Preis konnte keinem Abo-Plan zugeordnet werden.');
  }

  return {
    clientId,
    plan,
    customerId: typeof session.customer === 'string' ? session.customer : null,
  };
}
