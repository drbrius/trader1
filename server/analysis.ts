/**
 * Chart screenshot analysis.
 *
 * Sends the uploaded screenshot to Gemini with a strict JSON schema and maps
 * the answer onto the ChartAnalysis type. When no GEMINI_API_KEY is present the
 * module returns a clearly flagged deterministic sample so the site stays
 * usable (and testable) without credentials.
 */

import { GoogleGenAI, Type } from '@google/genai';
import { ChartAnalysis, ChartAnalysisRequest, MarketBias, TradingStyle } from '../src/types';

export const DISCLAIMER_DE =
  'Keine Finanz-, Anlage- oder Handelsberatung. Diese Auswertung ist eine automatisierte, ' +
  'rein technische Mustererkennung auf einem Screenshot und kann falsch sein. Handeln erfolgt ' +
  'ausschliesslich auf eigenes Risiko; du kannst dein eingesetztes Kapital vollständig verlieren.';

export const MAX_IMAGE_BYTES = 8 * 1024 * 1024; // 8 MB
export const ALLOWED_MIME_TYPES = ['image/png', 'image/jpeg', 'image/webp'];

const MODEL = 'gemini-2.5-flash';

const STYLE_LABELS: Record<TradingStyle, string> = {
  scalping: 'Scalping (Minuten bis wenige Stunden)',
  daytrading: 'Daytrading (Intraday, Position wird am selben Tag geschlossen)',
  swing: 'Swing-Trading (Tage bis Wochen)',
};

/** Response schema handed to Gemini so the answer is always parseable. */
const RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    instrument: { type: Type.STRING },
    timeframe: { type: Type.STRING },
    chartReadability: { type: Type.NUMBER },
    trend: { type: Type.STRING },
    marketStructure: { type: Type.STRING },
    momentum: { type: Type.STRING },
    volumeObservation: { type: Type.STRING },
    supports: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          label: { type: Type.STRING },
          value: { type: Type.STRING },
          reasoning: { type: Type.STRING },
        },
        required: ['label', 'value', 'reasoning'],
      },
    },
    resistances: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          label: { type: Type.STRING },
          value: { type: Type.STRING },
          reasoning: { type: Type.STRING },
        },
        required: ['label', 'value', 'reasoning'],
      },
    },
    patterns: { type: Type.ARRAY, items: { type: Type.STRING } },
    indicators: { type: Type.ARRAY, items: { type: Type.STRING } },
    bias: { type: Type.STRING, enum: ['BUY', 'SELL', 'NEUTRAL'] },
    confidence: { type: Type.NUMBER },
    summary: { type: Type.STRING },
    bullishScenario: {
      type: Type.OBJECT,
      properties: {
        title: { type: Type.STRING },
        trigger: { type: Type.STRING },
        target: { type: Type.STRING },
        invalidation: { type: Type.STRING },
      },
      required: ['title', 'trigger', 'target', 'invalidation'],
    },
    bearishScenario: {
      type: Type.OBJECT,
      properties: {
        title: { type: Type.STRING },
        trigger: { type: Type.STRING },
        target: { type: Type.STRING },
        invalidation: { type: Type.STRING },
      },
      required: ['title', 'trigger', 'target', 'invalidation'],
    },
    riskNotes: { type: Type.ARRAY, items: { type: Type.STRING } },
  },
  required: [
    'instrument',
    'timeframe',
    'chartReadability',
    'trend',
    'marketStructure',
    'momentum',
    'volumeObservation',
    'supports',
    'resistances',
    'patterns',
    'indicators',
    'bias',
    'confidence',
    'summary',
    'bullishScenario',
    'bearishScenario',
    'riskNotes',
  ],
};

function buildPrompt(input: ChartAnalysisRequest): string {
  const hints: string[] = [];
  if (input.instrument) hints.push(`Instrument laut Nutzer: ${input.instrument}`);
  if (input.timeframe) hints.push(`Timeframe laut Nutzer: ${input.timeframe}`);
  if (input.style) hints.push(`Handelsstil: ${STYLE_LABELS[input.style]}`);
  if (input.notes) hints.push(`Zusatzkontext vom Nutzer: ${input.notes}`);

  return `Du bist ein erfahrener technischer Analyst. Analysiere den beigefügten Screenshot eines Trading-Charts.

${hints.length ? `Kontext:\n${hints.map((h) => `- ${h}`).join('\n')}\n` : ''}
Aufgaben:
1. Lies Instrument und Timeframe aus dem Chart ab. Wenn sie nicht erkennbar sind, schreibe "nicht erkennbar" und setze chartReadability entsprechend tief.
2. Beschreibe Trend, Marktstruktur (höhere Hochs/Tiefs, Ranges, Break of Structure), Momentum und - falls sichtbar - das Volumen.
3. Nenne die wichtigsten Support- und Resistance-Zonen mit konkreten Preisniveaus, die du im Chart ablesen kannst. Erfinde keine Preise: wenn die Achse unlesbar ist, beschreibe die Zone relativ (z.B. "Hoch vom linken Bildrand").
4. Nenne erkennbare Chartmuster (Dreieck, Doppeltop, Flagge, Head and Shoulders, Kerzenformationen ...) und sichtbare Indikatoren mit ihrer aktuellen Aussage.
5. Leite eine technische Tendenz ab: bias = "BUY", "SELL" oder "NEUTRAL", mit confidence von 0 bis 100. Sei ehrlich: bei unklarer Lage gehört NEUTRAL und eine tiefe confidence hin.
6. Formuliere je ein bullisches und ein bärisches Szenario mit Trigger, Zielbereich und Invalidierung.
7. Nenne unter riskNotes konkrete Risiken dieser Einschätzung (z.B. fehlender höherer Timeframe, News-Termine, dünnes Volumen, schlechte Screenshot-Qualität).

Regeln:
- Antworte ausschliesslich auf Deutsch.
- Beziehe dich nur auf das, was im Screenshot tatsächlich sichtbar ist.
- Keine Erfolgsversprechen, keine Renditeversprechen, keine Aufforderung zu handeln.
- Formuliere als technische Beobachtung ("die Struktur spricht für ..."), nicht als Empfehlung an eine Person.
- Wenn das Bild kein Trading-Chart ist, setze chartReadability auf 0, bias auf "NEUTRAL" und erkläre das in summary.`;
}

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  const num = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.min(max, Math.max(min, Math.round(num)));
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === 'string' && entry.trim() !== '');
}

function asLevels(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((entry) => entry && typeof entry === 'object')
    .map((entry: any) => ({
      label: String(entry.label ?? ''),
      value: String(entry.value ?? ''),
      reasoning: String(entry.reasoning ?? ''),
    }))
    .filter((entry) => entry.label || entry.value);
}

function asScenario(value: unknown, fallbackTitle: string) {
  const raw = (value && typeof value === 'object' ? value : {}) as any;
  return {
    title: String(raw.title ?? fallbackTitle),
    trigger: String(raw.trigger ?? 'Nicht bestimmbar'),
    target: String(raw.target ?? 'Nicht bestimmbar'),
    invalidation: String(raw.invalidation ?? 'Nicht bestimmbar'),
  };
}

function asBias(value: unknown): MarketBias {
  const normalised = String(value ?? '').toUpperCase();
  return normalised === 'BUY' || normalised === 'SELL' ? normalised : 'NEUTRAL';
}

/**
 * Normalises whatever the model returned into a complete ChartAnalysis.
 * Exported so the test suite can exercise it without hitting the API.
 */
export function normaliseAnalysis(raw: any, demo = false): ChartAnalysis {
  const data = raw && typeof raw === 'object' ? raw : {};
  return {
    id: `an_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`,
    timestamp: new Date().toISOString(),
    instrument: String(data.instrument || 'nicht erkennbar'),
    timeframe: String(data.timeframe || 'nicht erkennbar'),
    chartReadability: clampNumber(data.chartReadability, 0, 100, 50),
    trend: String(data.trend || 'Kein eindeutiger Trend erkennbar.'),
    marketStructure: String(data.marketStructure || 'Marktstruktur nicht eindeutig.'),
    momentum: String(data.momentum || 'Momentum nicht eindeutig.'),
    volumeObservation: String(data.volumeObservation || 'Kein Volumen im Screenshot sichtbar.'),
    supports: asLevels(data.supports),
    resistances: asLevels(data.resistances),
    patterns: asStringArray(data.patterns),
    indicators: asStringArray(data.indicators),
    bias: asBias(data.bias),
    confidence: clampNumber(data.confidence, 0, 100, 0),
    summary: String(data.summary || 'Es konnte keine belastbare Aussage abgeleitet werden.'),
    bullishScenario: asScenario(data.bullishScenario, 'Bullisches Szenario'),
    bearishScenario: asScenario(data.bearishScenario, 'Bärisches Szenario'),
    riskNotes: asStringArray(data.riskNotes),
    disclaimer: DISCLAIMER_DE,
    demo,
  };
}

/** Deterministic sample used when no API key is configured. */
export function buildDemoAnalysis(input: ChartAnalysisRequest): ChartAnalysis {
  return normaliseAnalysis(
    {
      instrument: input.instrument || 'Beispiel-Instrument (Demo)',
      timeframe: input.timeframe || 'H1 (Demo)',
      chartReadability: 60,
      trend: 'Demo-Ausgabe: kein GEMINI_API_KEY gesetzt, daher wurde der Chart nicht ausgewertet.',
      marketStructure: 'Beispielhafte Struktur — dient nur zur Vorschau der Oberfläche.',
      momentum: 'Nicht bewertet (Demo-Modus).',
      volumeObservation: 'Nicht bewertet (Demo-Modus).',
      supports: [
        {
          label: 'Beispiel-Support',
          value: '—',
          reasoning: 'Platzhalter. Mit gesetztem API-Key stehen hier echte Zonen aus dem Chart.',
        },
      ],
      resistances: [
        {
          label: 'Beispiel-Resistance',
          value: '—',
          reasoning: 'Platzhalter. Mit gesetztem API-Key stehen hier echte Zonen aus dem Chart.',
        },
      ],
      patterns: ['Demo-Modus: keine Mustererkennung ausgeführt'],
      indicators: ['Demo-Modus: keine Indikatoranalyse ausgeführt'],
      bias: 'NEUTRAL',
      confidence: 0,
      summary:
        'Demo-Modus: Es wurde keine echte Analyse durchgeführt. Setze GEMINI_API_KEY, um Screenshots ' +
        'tatsächlich auswerten zu lassen.',
      bullishScenario: {
        title: 'Bullisches Szenario (Demo)',
        trigger: '—',
        target: '—',
        invalidation: '—',
      },
      bearishScenario: {
        title: 'Bärisches Szenario (Demo)',
        trigger: '—',
        target: '—',
        invalidation: '—',
      },
      riskNotes: ['Demo-Ausgabe ohne Chartbezug — nicht für Handelsentscheidungen verwendbar.'],
    },
    true,
  );
}

export function isDemoMode(): boolean {
  return !process.env.GEMINI_API_KEY;
}

export interface ValidationError {
  message: string;
}

/** Validates the upload before any money or tokens are spent on it. */
export function validateRequest(input: ChartAnalysisRequest): ValidationError | null {
  if (!input || typeof input.imageBase64 !== 'string' || input.imageBase64.length === 0) {
    return { message: 'Es wurde kein Bild übermittelt.' };
  }
  if (!ALLOWED_MIME_TYPES.includes(input.mimeType)) {
    return {
      message: `Nicht unterstütztes Format "${input.mimeType}". Erlaubt sind PNG, JPEG und WebP.`,
    };
  }
  // base64 encodes 3 bytes in every 4 characters.
  const approxBytes = Math.floor((input.imageBase64.length * 3) / 4);
  if (approxBytes > MAX_IMAGE_BYTES) {
    return { message: 'Das Bild ist zu gross. Maximal 8 MB pro Screenshot.' };
  }
  return null;
}

/** Runs the actual analysis. Throws on API failure so the route can report it. */
export async function analyseChart(input: ChartAnalysisRequest): Promise<ChartAnalysis> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return buildDemoAnalysis(input);
  }

  const ai = new GoogleGenAI({ apiKey });
  const response = await ai.models.generateContent({
    model: MODEL,
    contents: [
      {
        role: 'user',
        parts: [
          { inlineData: { mimeType: input.mimeType, data: input.imageBase64 } },
          { text: buildPrompt(input) },
        ],
      },
    ],
    config: {
      temperature: 0.3,
      responseMimeType: 'application/json',
      responseSchema: RESPONSE_SCHEMA,
    },
  });

  const text = response.text;
  if (!text) {
    throw new Error('Das Modell hat keine Auswertung zurückgegeben.');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('Die Antwort des Modells war kein gültiges JSON.');
  }

  return normaliseAnalysis(parsed, false);
}
