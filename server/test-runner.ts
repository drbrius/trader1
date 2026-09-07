/**
 * Lightweight test suite — `npm test`.
 *
 * The most important assertions here are the margin ones: they encode the
 * business requirement that every plan leaves at least 12 CHF profit per
 * subscriber per month, so a future price change cannot silently break it.
 */

import {
  COST_MODEL,
  MIN_MONTHLY_PROFIT_CHF,
  PLANS,
  aiCostPerAnalysisChf,
  allUnitEconomics,
  computeUnitEconomics,
  getPlan,
} from './pricing';
import { buildDemoAnalysis, normaliseAnalysis, validateRequest } from './analysis';
import { sanitiseClientId } from './subscription';

let run = 0;
let failed = 0;

function assert(condition: boolean, name: string) {
  run++;
  if (condition) {
    console.log(`✅ ${name}`);
  } else {
    failed++;
    console.error(`❌ ${name}`);
  }
}

function section(title: string) {
  console.log(`\n— ${title} —`);
}

// --- Pricing / margin guarantee ---------------------------------------------

section('Preise & Marge');

for (const plan of PLANS) {
  const economics = computeUnitEconomics(plan);
  console.log(
    `   ${plan.name}: Umsatz ${economics.revenueChf} − Stripe ${economics.stripeFeeChf} − KI ${economics.aiCostChf} − Infra ${economics.infraCostChf} = Gewinn ${economics.profitChf} CHF/Monat`,
  );
  assert(
    economics.profitChf >= MIN_MONTHLY_PROFIT_CHF,
    `${plan.name} erreicht mindestens ${MIN_MONTHLY_PROFIT_CHF} CHF Gewinn pro Abo und Monat`,
  );
}

assert(
  allUnitEconomics().every((entry) => entry.meetsTarget),
  `Alle Pläne erfüllen das Margenziel bei ${COST_MODEL.breakEvenSubscribers} Abonnenten`,
);

assert(
  computeUnitEconomics(PLANS[0], 1).profitChf < computeUnitEconomics(PLANS[0], 100).profitChf,
  'Mehr Abonnenten verteilen die Fixkosten und erhöhen den Gewinn pro Abo',
);

assert(
  aiCostPerAnalysisChf() > 0 && aiCostPerAnalysisChf() < 0.05,
  'Die KI-Kosten pro Analyse liegen im erwarteten Rappen-Bereich',
);

// The full monthly quota must stay affordable relative to the price.
for (const plan of PLANS) {
  const monthlyAiCost = plan.analysesPerMonth * aiCostPerAnalysisChf();
  const monthlyRevenue = plan.priceChf / (plan.interval === 'year' ? 12 : 1);
  assert(
    monthlyAiCost < monthlyRevenue * 0.15,
    `${plan.name}: KI-Kosten bei voller Nutzung bleiben unter 15% des Monatsumsatzes`,
  );
}

assert(getPlan('pro_monthly')?.priceChf === 19, 'Monatsabo kostet 19 CHF');
assert(getPlan('nicht_existent') === undefined, 'Unbekannte Plan-IDs werden nicht aufgelöst');

// --- Upload validation ------------------------------------------------------

section('Upload-Validierung');

assert(
  validateRequest({ imageBase64: '', mimeType: 'image/png' })?.message.includes('kein Bild') === true,
  'Leerer Upload wird abgelehnt',
);

assert(
  validateRequest({ imageBase64: 'AAAA', mimeType: 'application/pdf' }) !== null,
  'Nicht unterstützte Dateitypen werden abgelehnt',
);

assert(
  validateRequest({ imageBase64: 'A'.repeat(20 * 1024 * 1024), mimeType: 'image/png' }) !== null,
  'Zu grosse Bilder werden abgelehnt',
);

assert(
  validateRequest({ imageBase64: 'A'.repeat(1024), mimeType: 'image/jpeg' }) === null,
  'Gültiger JPEG-Upload wird akzeptiert',
);

// --- Analysis normalisation -------------------------------------------------

section('Normalisierung der Modellantwort');

const garbage = normaliseAnalysis({ bias: 'MAYBE', confidence: 9000, supports: 'nope' });
assert(garbage.bias === 'NEUTRAL', 'Unbekannter Bias fällt auf NEUTRAL zurück');
assert(garbage.confidence === 100, 'Konfidenz wird auf 0–100 begrenzt');
assert(Array.isArray(garbage.supports) && garbage.supports.length === 0, 'Kaputte Level-Listen werden geleert');
assert(garbage.disclaimer.length > 50, 'Der Haftungsausschluss hängt immer an der Analyse');

const empty = normaliseAnalysis(null);
assert(empty.instrument === 'nicht erkennbar', 'Fehlende Felder bekommen ehrliche Platzhalter');
assert(empty.confidence === 0, 'Ohne Angabe ist die Konfidenz 0');

const clean = normaliseAnalysis({
  bias: 'buy',
  confidence: 72,
  supports: [{ label: 'S1', value: '42000', reasoning: 'Alter Widerstand' }],
  patterns: ['Aufsteigendes Dreieck', ''],
});
assert(clean.bias === 'BUY', 'Bias wird case-insensitiv erkannt');
assert(clean.supports.length === 1 && clean.supports[0].value === '42000', 'Gültige Level bleiben erhalten');
assert(clean.patterns.length === 1, 'Leere Muster-Einträge werden gefiltert');

const demo = buildDemoAnalysis({ imageBase64: 'x', mimeType: 'image/png' });
assert(demo.demo === true, 'Die Demo-Analyse ist als Demo markiert');
assert(demo.bias === 'NEUTRAL' && demo.confidence === 0, 'Die Demo-Analyse gibt keine Tendenz vor');

// --- Client ids -------------------------------------------------------------

section('Client-IDs');

assert(sanitiseClientId('a1b2c3d4-e5f6-7890-abcd-ef1234567890') !== null, 'UUIDs werden akzeptiert');
assert(sanitiseClientId('short') === null, 'Zu kurze IDs werden abgelehnt');
assert(sanitiseClientId('../../etc/passwd') === null, 'Pfad-Tricks werden abgelehnt');
assert(sanitiseClientId(42) === null, 'Nicht-Strings werden abgelehnt');

// --- Summary ----------------------------------------------------------------

console.log(`\n${failed === 0 ? '✅' : '❌'} ${run - failed}/${run} Tests bestanden.`);
process.exit(failed === 0 ? 0 : 1);
