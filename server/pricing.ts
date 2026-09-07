/**
 * Pricing and unit economics for the Chart Analysis service.
 *
 * Hard business requirement: every plan must leave at least
 * MIN_MONTHLY_PROFIT_CHF of profit per subscriber per month, even when a
 * subscriber burns through their full included analysis quota.
 *
 * This module is the single source of truth for prices, quotas and margins.
 * The frontend reads it through GET /api/pricing, and the test suite asserts
 * the margin requirement so a price change can never silently break it.
 */

/** The owner's minimum acceptable profit per subscriber per month, in CHF. */
export const MIN_MONTHLY_PROFIT_CHF = 12;

/** Number of analyses a visitor gets before the paywall kicks in. */
export const FREE_TRIAL_ANALYSES = 3;

/**
 * Cost inputs. Deliberately pessimistic (rounded up) so the calculated margin
 * is a floor, not an optimistic estimate.
 */
export const COST_MODEL = {
  /** USD -> CHF conversion used for API costs billed in USD. */
  usdToChf: 0.82,

  /**
   * Gemini 2.5 Flash list price per 1M tokens (USD).
   * A chart screenshot costs ~1'300 input tokens, the system prompt ~900,
   * and a full analysis answer ~900 output tokens.
   */
  aiInputUsdPerMillionTokens: 0.30,
  aiOutputUsdPerMillionTokens: 2.50,
  aiInputTokensPerAnalysis: 2_200,
  aiOutputTokensPerAnalysis: 900,

  /**
   * Safety multiplier on the raw AI cost: covers retries, longer answers,
   * high-resolution screenshots and future price moves.
   */
  aiSafetyFactor: 1.8,

  /** Stripe Switzerland: 2.9% + 0.30 CHF per successful charge. */
  stripePercent: 0.029,
  stripeFixedChf: 0.30,

  /**
   * Fixed monthly infrastructure cost in CHF (Cloud Run + image storage +
   * domain, amortised). Split across the subscriber base.
   */
  infraMonthlyChf: 12,

  /**
   * Subscriber base the margin guarantee is calculated against. The service
   * must already clear MIN_MONTHLY_PROFIT_CHF with this few subscribers.
   */
  breakEvenSubscribers: 10,
} as const;

export type BillingInterval = 'month' | 'year';

export interface Plan {
  id: string;
  name: string;
  /** Amount charged per billing interval, in CHF. */
  priceChf: number;
  interval: BillingInterval;
  /** Analyses included per calendar month. */
  analysesPerMonth: number;
  tagline: string;
  features: string[];
  highlighted: boolean;
  /** Optional Stripe Price ID; when absent the checkout runs in demo mode. */
  stripePriceIdEnv: string;
}

export const PLANS: Plan[] = [
  {
    id: 'pro_monthly',
    name: 'Trader Pro',
    priceChf: 19,
    interval: 'month',
    analysesPerMonth: 150,
    tagline: 'Monatlich kündbar',
    features: [
      '150 Chart-Analysen pro Monat',
      'Trend, Marktstruktur, Support & Resistance',
      'Chartmuster- und Indikator-Erkennung',
      'Bias-Einschätzung (Buy / Sell / Neutral) mit Konfidenz',
      'Bullisches und bärisches Szenario inkl. Invalidierung',
      'Analyse-Historie',
    ],
    highlighted: true,
    stripePriceIdEnv: 'STRIPE_PRICE_PRO_MONTHLY',
  },
  {
    id: 'pro_yearly',
    name: 'Trader Pro — Jahr',
    priceChf: 190,
    interval: 'year',
    analysesPerMonth: 150,
    tagline: '2 Monate geschenkt',
    features: [
      'Alles aus Trader Pro',
      '150 Chart-Analysen pro Monat',
      'Entspricht 15.83 CHF pro Monat',
      'Preisgarantie für 12 Monate',
    ],
    highlighted: false,
    stripePriceIdEnv: 'STRIPE_PRICE_PRO_YEARLY',
  },
];

export interface UnitEconomics {
  planId: string;
  planName: string;
  subscribers: number;
  /** Everything below is normalised to CHF per subscriber per month. */
  revenueChf: number;
  stripeFeeChf: number;
  aiCostChf: number;
  infraCostChf: number;
  totalCostChf: number;
  profitChf: number;
  marginPercent: number;
  meetsTarget: boolean;
}

/** Worst-case AI cost in CHF for a single chart analysis. */
export function aiCostPerAnalysisChf(): number {
  const inputUsd =
    (COST_MODEL.aiInputTokensPerAnalysis / 1_000_000) * COST_MODEL.aiInputUsdPerMillionTokens;
  const outputUsd =
    (COST_MODEL.aiOutputTokensPerAnalysis / 1_000_000) * COST_MODEL.aiOutputUsdPerMillionTokens;
  return (inputUsd + outputUsd) * COST_MODEL.aiSafetyFactor * COST_MODEL.usdToChf;
}

function round(value: number, decimals = 2): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

/**
 * Calculates profit per subscriber per month, assuming the subscriber uses
 * 100% of their included analyses (worst case for us, best case for them).
 */
export function computeUnitEconomics(
  plan: Plan,
  subscribers: number = COST_MODEL.breakEvenSubscribers,
): UnitEconomics {
  const monthsPerPeriod = plan.interval === 'year' ? 12 : 1;

  // Stripe charges once per billing period, so a yearly plan amortises the fee.
  const stripeFeePerPeriod = plan.priceChf * COST_MODEL.stripePercent + COST_MODEL.stripeFixedChf;

  const revenueChf = plan.priceChf / monthsPerPeriod;
  const stripeFeeChf = stripeFeePerPeriod / monthsPerPeriod;
  const aiCostChf = plan.analysesPerMonth * aiCostPerAnalysisChf();
  const infraCostChf = COST_MODEL.infraMonthlyChf / Math.max(1, subscribers);

  const totalCostChf = stripeFeeChf + aiCostChf + infraCostChf;
  const profitChf = revenueChf - totalCostChf;

  return {
    planId: plan.id,
    planName: plan.name,
    subscribers,
    revenueChf: round(revenueChf),
    stripeFeeChf: round(stripeFeeChf),
    aiCostChf: round(aiCostChf),
    infraCostChf: round(infraCostChf),
    totalCostChf: round(totalCostChf),
    profitChf: round(profitChf),
    marginPercent: round((profitChf / revenueChf) * 100, 1),
    meetsTarget: profitChf >= MIN_MONTHLY_PROFIT_CHF,
  };
}

/** Economics for every plan, at the documented break-even subscriber base. */
export function allUnitEconomics(
  subscribers: number = COST_MODEL.breakEvenSubscribers,
): UnitEconomics[] {
  return PLANS.map((plan) => computeUnitEconomics(plan, subscribers));
}

export function getPlan(planId: string): Plan | undefined {
  return PLANS.find((plan) => plan.id === planId);
}
