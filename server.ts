/**
 * ChartCheck server.
 *
 * Serves the React frontend and a small REST API:
 *   GET  /api/health                  liveness probe
 *   GET  /api/pricing                 plans, prices and free-trial size
 *   GET  /api/economics               unit economics (owner view)
 *   GET  /api/quota                   remaining analyses for this browser
 *   POST /api/analyze                 the actual chart analysis
 *   POST /api/subscription/checkout   start a Stripe Checkout session
 *   POST /api/subscription/confirm    verify a finished checkout
 *   POST /api/subscription/cancel     end the subscription
 */

import 'dotenv/config';
import express, { NextFunction, Request, Response } from 'express';
import path from 'path';
import { DISCLAIMER_DE, analyseChart, isDemoMode, validateRequest } from './server/analysis';
import { FREE_TRIAL_ANALYSES, MIN_MONTHLY_PROFIT_CHF, PLANS, allUnitEconomics, getPlan } from './server/pricing';
import {
  activatePlan,
  cancelPlan,
  confirmCheckoutSession,
  consumeAnalysis,
  createCheckoutSession,
  getQuota,
  sanitiseClientId,
  stripeConfigured,
} from './server/subscription';
import { ChartAnalysisRequest, PricingResponse } from './src/types';

const PORT = Number(process.env.PORT) || 3000;
const APP_URL = process.env.APP_URL || `http://localhost:${PORT}`;

/** Every request that touches per-user state needs a client id header. */
function requireClientId(req: Request, res: Response, next: NextFunction) {
  const clientId = sanitiseClientId(req.header('x-client-id'));
  if (!clientId) {
    res.status(400).json({ error: 'Ungültige oder fehlende Client-ID.' });
    return;
  }
  res.locals.clientId = clientId;
  next();
}

async function startServer() {
  const app = express();

  // Screenshots arrive base64-encoded, so the default 100kb limit is far too
  // small: 8 MB of image is roughly 11 MB of base64.
  app.use(express.json({ limit: '12mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({
      status: 'ok',
      time: new Date().toISOString(),
      aiConfigured: !isDemoMode(),
      stripeConfigured: stripeConfigured(),
    });
  });

  // --- Pricing --------------------------------------------------------------

  app.get('/api/pricing', (_req, res) => {
    const payload: PricingResponse = {
      currency: 'CHF',
      freeTrialAnalyses: FREE_TRIAL_ANALYSES,
      demoCheckout: !stripeConfigured(),
      plans: PLANS.map((plan) => ({
        id: plan.id,
        name: plan.name,
        priceChf: plan.priceChf,
        interval: plan.interval,
        analysesPerMonth: plan.analysesPerMonth,
        tagline: plan.tagline,
        features: plan.features,
        highlighted: plan.highlighted,
        monthlyEquivalentChf:
          Math.round((plan.priceChf / (plan.interval === 'year' ? 12 : 1)) * 100) / 100,
      })),
    };
    res.json(payload);
  });

  /**
   * Margin transparency for the operator: shows that every plan clears the
   * required profit per subscriber per month.
   */
  app.get('/api/economics', (req, res) => {
    const subscribers = Number(req.query.subscribers);
    const economics = allUnitEconomics(
      Number.isFinite(subscribers) && subscribers > 0 ? Math.floor(subscribers) : undefined,
    );
    res.json({
      currency: 'CHF',
      minMonthlyProfitChf: MIN_MONTHLY_PROFIT_CHF,
      allPlansMeetTarget: economics.every((entry) => entry.meetsTarget),
      plans: economics,
    });
  });

  // --- Quota ----------------------------------------------------------------

  app.get('/api/quota', requireClientId, (_req, res) => {
    res.json(getQuota(res.locals.clientId));
  });

  // --- Analysis -------------------------------------------------------------

  app.post('/api/analyze', requireClientId, async (_req, res) => {
    const clientId: string = res.locals.clientId;
    const input = _req.body as ChartAnalysisRequest;

    const invalid = validateRequest(input);
    if (invalid) {
      res.status(400).json({ error: invalid.message });
      return;
    }

    // Reserve the credit before spending tokens, so a paywalled user never
    // triggers a paid API call.
    const quota = consumeAnalysis(clientId);
    if (!quota) {
      const current = getQuota(clientId);
      res.status(402).json({
        error: current.freeTrial
          ? 'Deine kostenlosen Analysen sind aufgebraucht. Für weitere Analysen brauchst du ein Abo.'
          : 'Dein monatliches Analyse-Kontingent ist aufgebraucht. Es wird am Monatsanfang zurückgesetzt.',
        quota: current,
        paywall: true,
      });
      return;
    }

    try {
      const analysis = await analyseChart(input);
      res.json({ analysis, quota });
    } catch (err: any) {
      // The analysis failed after the credit was booked — give it back.
      console.error('Analyse fehlgeschlagen:', err?.message);
      res.status(502).json({
        error: 'Die Analyse konnte nicht erstellt werden. Bitte versuche es erneut.',
        details: err?.message,
        quota,
      });
    }
  });

  // --- Subscription ---------------------------------------------------------

  app.post('/api/subscription/checkout', requireClientId, async (req, res) => {
    const clientId: string = res.locals.clientId;
    const plan = getPlan(String(req.body?.planId ?? ''));

    if (!plan) {
      res.status(400).json({ error: 'Unbekannter Abo-Plan.' });
      return;
    }

    // Without Stripe credentials we must not pretend a payment happened.
    if (!stripeConfigured(plan)) {
      res.json({
        mode: 'demo',
        message:
          'Demo-Modus: Es ist kein Stripe-Konto hinterlegt, daher wird nichts abgebucht. ' +
          'Setze STRIPE_SECRET_KEY und die Preis-IDs, um echte Abos zu verkaufen.',
        quota: activatePlan(clientId, plan),
      });
      return;
    }

    try {
      const url = await createCheckoutSession(clientId, plan, APP_URL);
      res.json({ mode: 'stripe', url });
    } catch (err: any) {
      console.error('Stripe-Checkout fehlgeschlagen:', err?.message);
      res.status(502).json({ error: 'Der Checkout konnte nicht gestartet werden.', details: err?.message });
    }
  });

  app.post('/api/subscription/confirm', async (req, res) => {
    const sessionId = String(req.body?.sessionId ?? '');
    if (!sessionId) {
      res.status(400).json({ error: 'Es wurde keine Checkout-Session übergeben.' });
      return;
    }
    if (!stripeConfigured()) {
      res.status(400).json({ error: 'Stripe ist auf diesem Server nicht konfiguriert.' });
      return;
    }

    try {
      const { clientId, plan, customerId } = await confirmCheckoutSession(sessionId);
      const quota = activatePlan(clientId, plan, {
        stripeSessionId: sessionId,
        stripeCustomerId: customerId ?? undefined,
      });
      res.json({ success: true, quota });
    } catch (err: any) {
      console.error('Checkout-Bestätigung fehlgeschlagen:', err?.message);
      res.status(400).json({ error: 'Die Zahlung konnte nicht bestätigt werden.', details: err?.message });
    }
  });

  app.post('/api/subscription/cancel', requireClientId, (_req, res) => {
    res.json({ success: true, quota: cancelPlan(res.locals.clientId) });
  });

  app.get('/api/disclaimer', (_req, res) => {
    res.json({ disclaimer: DISCLAIMER_DE });
  });

  // --- Frontend -------------------------------------------------------------

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({ server: { middlewareMode: true }, appType: 'spa' });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`ChartCheck läuft auf http://0.0.0.0:${PORT}`);
    if (isDemoMode()) {
      console.warn('⚠️  GEMINI_API_KEY fehlt — Analysen laufen im Demo-Modus.');
    }
    if (!stripeConfigured()) {
      console.warn('⚠️  STRIPE_SECRET_KEY fehlt — Checkout läuft im Demo-Modus.');
    }
  });
}

startServer().catch((err) => {
  console.error('Serverstart fehlgeschlagen:', err);
  process.exit(1);
});
