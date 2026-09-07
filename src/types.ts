/** Types shared between the chart-analysis backend and frontend. */

export type MarketBias = 'BUY' | 'SELL' | 'NEUTRAL';

export type TradingStyle = 'scalping' | 'daytrading' | 'swing';

export interface ChartAnalysisRequest {
  /** Base64 payload of the screenshot, without the data-URL prefix. */
  imageBase64: string;
  mimeType: string;
  /** Optional hints from the trader; all of them may be empty. */
  instrument?: string;
  timeframe?: string;
  style?: TradingStyle;
  notes?: string;
}

export interface PriceLevel {
  label: string;
  value: string;
  reasoning: string;
}

export interface Scenario {
  /** e.g. "Bullisches Szenario" */
  title: string;
  trigger: string;
  target: string;
  invalidation: string;
}

export interface ChartAnalysis {
  id: string;
  timestamp: string;

  /** What the model believes it is looking at. */
  instrument: string;
  timeframe: string;
  /** 0-100. Low values mean the screenshot was hard to read. */
  chartReadability: number;

  trend: string;
  marketStructure: string;
  momentum: string;
  volumeObservation: string;

  supports: PriceLevel[];
  resistances: PriceLevel[];
  patterns: string[];
  indicators: string[];

  bias: MarketBias;
  /** 0-100 confidence in the stated bias. */
  confidence: number;
  summary: string;

  bullishScenario: Scenario;
  bearishScenario: Scenario;

  riskNotes: string[];
  /** Always present, always shown. This is not financial advice. */
  disclaimer: string;

  /** True when generated without an API key (deterministic sample output). */
  demo: boolean;
}

export interface QuotaState {
  /** Analyses already used in the current calendar month. */
  used: number;
  /** Analyses included per month, or the free-trial allowance. */
  limit: number;
  remaining: number;
  freeTrial: boolean;
  freeTrialUsed: number;
  freeTrialLimit: number;
  subscribed: boolean;
  planId: string | null;
  planName: string | null;
  /** ISO date the current billing period ends, when subscribed. */
  renewsAt: string | null;
  periodStart: string;
}

export interface PricingPlanView {
  id: string;
  name: string;
  priceChf: number;
  interval: 'month' | 'year';
  analysesPerMonth: number;
  tagline: string;
  features: string[];
  highlighted: boolean;
  /** Effective monthly price, useful for the yearly plan. */
  monthlyEquivalentChf: number;
}

export interface PricingResponse {
  currency: 'CHF';
  freeTrialAnalyses: number;
  plans: PricingPlanView[];
  /** True when Stripe is not configured and checkout only simulates. */
  demoCheckout: boolean;
}
