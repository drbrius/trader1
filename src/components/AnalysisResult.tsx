import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  Minus,
  ShieldAlert,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import { ChartAnalysis, MarketBias, PriceLevel, Scenario } from '../types';

const BIAS_STYLE: Record<MarketBias, { label: string; className: string; icon: typeof ArrowUpRight }> = {
  BUY: {
    label: 'Tendenz: Long / Buy',
    className: 'border-buy/40 bg-buy/10 text-buy',
    icon: ArrowUpRight,
  },
  SELL: {
    label: 'Tendenz: Short / Sell',
    className: 'border-sell/40 bg-sell/10 text-sell',
    icon: ArrowDownRight,
  },
  NEUTRAL: {
    label: 'Tendenz: Neutral / Abwarten',
    className: 'border-hold/40 bg-hold/10 text-hold',
    icon: Minus,
  },
};

function Levels({ title, levels, tone }: { title: string; levels: PriceLevel[]; tone: 'buy' | 'sell' }) {
  if (levels.length === 0) {
    return (
      <div>
        <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-mist">{title}</h4>
        <p className="text-xs text-mist/70">Keine eindeutigen Zonen erkennbar.</p>
      </div>
    );
  }

  return (
    <div>
      <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-mist">{title}</h4>
      <ul className="space-y-2">
        {levels.map((level, index) => (
          <li key={`${level.label}-${index}`} className="rounded-lg border border-line bg-panel-2 p-3">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-xs font-medium">{level.label}</span>
              <span className={`font-mono text-sm font-semibold ${tone === 'buy' ? 'text-buy' : 'text-sell'}`}>
                {level.value}
              </span>
            </div>
            {level.reasoning && <p className="mt-1 text-[11px] leading-relaxed text-mist">{level.reasoning}</p>}
          </li>
        ))}
      </ul>
    </div>
  );
}

function ScenarioCard({ scenario, tone }: { scenario: Scenario; tone: 'buy' | 'sell' }) {
  const Icon = tone === 'buy' ? TrendingUp : TrendingDown;
  const color = tone === 'buy' ? 'text-buy' : 'text-sell';

  return (
    <div className="rounded-xl border border-line bg-panel-2 p-4">
      <h4 className={`mb-3 flex items-center gap-2 text-xs font-semibold ${color}`}>
        <Icon size={14} />
        {scenario.title}
      </h4>
      <dl className="space-y-2 text-[11px]">
        <div>
          <dt className="font-medium text-mist">Trigger</dt>
          <dd className="leading-relaxed">{scenario.trigger}</dd>
        </div>
        <div>
          <dt className="font-medium text-mist">Zielbereich</dt>
          <dd className="leading-relaxed">{scenario.target}</dd>
        </div>
        <div>
          <dt className="font-medium text-mist">Invalidierung</dt>
          <dd className="leading-relaxed">{scenario.invalidation}</dd>
        </div>
      </dl>
    </div>
  );
}

export default function AnalysisResult({ analysis }: { analysis: ChartAnalysis }) {
  const bias = BIAS_STYLE[analysis.bias];
  const BiasIcon = bias.icon;

  return (
    <section className="fade-up space-y-4">
      {analysis.demo && (
        <div className="rounded-xl border border-hold/40 bg-hold/10 px-4 py-3 text-xs text-hold">
          <span className="font-semibold">Demo-Modus:</span> Es ist kein GEMINI_API_KEY hinterlegt, daher wurde
          der Chart nicht wirklich ausgewertet. Die Ausgabe unten ist ein Platzhalter.
        </div>
      )}

      {/* Verdict */}
      <div className="panel p-5">
        <div className={`flex items-center gap-3 rounded-xl border px-4 py-3 ${bias.className}`}>
          <BiasIcon size={22} />
          <div className="flex-1">
            <p className="text-sm font-bold">{bias.label}</p>
            <p className="text-[11px] opacity-80">
              {analysis.instrument} · {analysis.timeframe}
            </p>
          </div>
        </div>

        <div className="mt-4">
          <div className="mb-1.5 flex items-center justify-between text-[11px] text-mist">
            <span>Konfidenz der Einschätzung</span>
            <span className="font-mono font-semibold">{analysis.confidence}%</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-panel-2">
            <div
              className={`h-full rounded-full ${
                analysis.bias === 'BUY' ? 'bg-buy' : analysis.bias === 'SELL' ? 'bg-sell' : 'bg-hold'
              }`}
              style={{ width: `${analysis.confidence}%` }}
            />
          </div>
          <div className="mt-2 flex items-center justify-between text-[11px] text-mist">
            <span>Lesbarkeit des Screenshots</span>
            <span className="font-mono">{analysis.chartReadability}%</span>
          </div>
        </div>

        <p className="mt-4 text-sm leading-relaxed">{analysis.summary}</p>

        <p className="mt-4 border-t border-line pt-3 text-[11px] leading-relaxed text-hold/80">
          {analysis.disclaimer}
        </p>
      </div>

      {/* Market read */}
      <div className="panel p-5">
        <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold">
          <Activity size={15} className="text-accent" />
          Marktbild
        </h3>
        <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {[
            ['Trend', analysis.trend],
            ['Marktstruktur', analysis.marketStructure],
            ['Momentum', analysis.momentum],
            ['Volumen', analysis.volumeObservation],
          ].map(([label, value]) => (
            <div key={label} className="rounded-lg border border-line bg-panel-2 p-3">
              <dt className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-mist">{label}</dt>
              <dd className="text-xs leading-relaxed">{value}</dd>
            </div>
          ))}
        </dl>
      </div>

      {/* Levels */}
      <div className="panel grid grid-cols-1 gap-5 p-5 sm:grid-cols-2">
        <Levels title="Support-Zonen" levels={analysis.supports} tone="buy" />
        <Levels title="Resistance-Zonen" levels={analysis.resistances} tone="sell" />
      </div>

      {/* Patterns and indicators */}
      {(analysis.patterns.length > 0 || analysis.indicators.length > 0) && (
        <div className="panel p-5">
          <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold">
            <BarChart3 size={15} className="text-accent" />
            Muster & Indikatoren
          </h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-mist">
                Chartmuster
              </h4>
              <ul className="space-y-1.5">
                {analysis.patterns.length ? (
                  analysis.patterns.map((entry, index) => (
                    <li key={index} className="text-xs leading-relaxed text-mist/90">
                      • {entry}
                    </li>
                  ))
                ) : (
                  <li className="text-xs text-mist/70">Keine eindeutigen Muster erkannt.</li>
                )}
              </ul>
            </div>
            <div>
              <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-mist">Indikatoren</h4>
              <ul className="space-y-1.5">
                {analysis.indicators.length ? (
                  analysis.indicators.map((entry, index) => (
                    <li key={index} className="text-xs leading-relaxed text-mist/90">
                      • {entry}
                    </li>
                  ))
                ) : (
                  <li className="text-xs text-mist/70">Keine Indikatoren im Screenshot sichtbar.</li>
                )}
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* Scenarios */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <ScenarioCard scenario={analysis.bullishScenario} tone="buy" />
        <ScenarioCard scenario={analysis.bearishScenario} tone="sell" />
      </div>

      {/* Risks */}
      {analysis.riskNotes.length > 0 && (
        <div className="panel p-5">
          <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold">
            <ShieldAlert size={15} className="text-hold" />
            Risiken dieser Einschätzung
          </h3>
          <ul className="space-y-1.5">
            {analysis.riskNotes.map((entry, index) => (
              <li key={index} className="text-xs leading-relaxed text-mist/90">
                • {entry}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
