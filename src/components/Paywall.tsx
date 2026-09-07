import { useState } from 'react';
import { Check, Loader2, Lock } from 'lucide-react';
import { PricingResponse, QuotaState } from '../types';

interface Props {
  pricing: PricingResponse | null;
  quota: QuotaState | null;
  /** Set when the user just ran out of analyses. */
  reason?: string | null;
  onSubscribe: (planId: string) => Promise<void>;
  onCancel: () => Promise<void>;
}

export default function Paywall({ pricing, quota, reason, onSubscribe, onCancel }: Props) {
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!pricing) {
    return (
      <section className="panel flex items-center justify-center p-8 text-sm text-mist">
        <Loader2 size={16} className="mr-2 animate-spin" />
        Preise werden geladen …
      </section>
    );
  }

  const subscribe = async (planId: string) => {
    setPending(planId);
    setError(null);
    try {
      await onSubscribe(planId);
    } catch (err: any) {
      setError(err?.message ?? 'Der Checkout konnte nicht gestartet werden.');
    } finally {
      setPending(null);
    }
  };

  const cancel = async () => {
    setPending('cancel');
    setError(null);
    try {
      await onCancel();
    } catch (err: any) {
      setError(err?.message ?? 'Das Abo konnte nicht gekündigt werden.');
    } finally {
      setPending(null);
    }
  };

  return (
    <section id="preise" className="space-y-4">
      {reason && (
        <div className="flex items-start gap-3 rounded-xl border border-sell/40 bg-sell/10 px-4 py-3">
          <Lock size={16} className="mt-0.5 shrink-0 text-sell" />
          <p className="text-xs leading-relaxed text-sell">{reason}</p>
        </div>
      )}

      <div className="text-center">
        <h2 className="text-lg font-bold">Abo</h2>
        <p className="mt-1 text-xs text-mist">
          {pricing.freeTrialAnalyses} Analysen gratis testen — danach eines der Abos. Preise inkl. MwSt.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {pricing.plans.map((plan) => {
          const isCurrent = quota?.subscribed && quota.planId === plan.id;
          return (
            <div
              key={plan.id}
              className={`panel flex flex-col p-5 ${plan.highlighted ? 'border-accent/50' : ''}`}
            >
              <div className="mb-3 flex items-start justify-between gap-2">
                <div>
                  <h3 className="text-sm font-bold">{plan.name}</h3>
                  <p className="text-[11px] text-mist">{plan.tagline}</p>
                </div>
                {plan.highlighted && (
                  <span className="rounded-full bg-accent/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-accent">
                    Beliebt
                  </span>
                )}
              </div>

              <div className="mb-4 flex items-baseline gap-1.5">
                <span className="text-3xl font-extrabold">{plan.priceChf}</span>
                <span className="text-sm font-semibold text-mist">CHF</span>
                <span className="text-xs text-mist">
                  / {plan.interval === 'year' ? 'Jahr' : 'Monat'}
                </span>
              </div>

              {plan.interval === 'year' && (
                <p className="-mt-3 mb-4 text-[11px] text-mist">
                  entspricht {plan.monthlyEquivalentChf.toFixed(2)} CHF pro Monat
                </p>
              )}

              <ul className="mb-5 flex-1 space-y-2">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-2 text-xs leading-relaxed">
                    <Check size={13} className="mt-0.5 shrink-0 text-buy" />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>

              {isCurrent ? (
                <button
                  type="button"
                  onClick={cancel}
                  disabled={pending !== null}
                  className="flex items-center justify-center gap-2 rounded-xl border border-line px-4 py-2.5 text-xs font-semibold text-mist transition-colors hover:text-white disabled:opacity-50"
                >
                  {pending === 'cancel' && <Loader2 size={14} className="animate-spin" />}
                  Aktives Abo — kündigen
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => subscribe(plan.id)}
                  disabled={pending !== null}
                  className={`flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-xs font-semibold transition-opacity disabled:opacity-50 ${
                    plan.highlighted ? 'bg-accent text-ink' : 'border border-line text-white hover:bg-panel-2'
                  }`}
                >
                  {pending === plan.id && <Loader2 size={14} className="animate-spin" />}
                  Abo starten
                </button>
              )}
            </div>
          );
        })}
      </div>

      {error && <p className="text-center text-xs text-sell">{error}</p>}

      {pricing.demoCheckout && (
        <p className="rounded-xl border border-hold/30 bg-hold/10 px-4 py-3 text-center text-[11px] leading-relaxed text-hold">
          <span className="font-semibold">Demo-Modus:</span> Es ist kein Stripe-Konto hinterlegt. Ein Klick
          auf „Abo starten" schaltet die Analysen nur lokal frei — es wird nichts abgebucht und es entsteht
          kein Vertrag. Trage STRIPE_SECRET_KEY und die Preis-IDs ein, um echte Abos zu verkaufen.
        </p>
      )}

      <p className="text-center text-[11px] text-mist/70">
        Zahlung über Stripe. Monatlich kündbar. ChartCheck verkauft ein Software-Werkzeug, keine
        Finanzberatung und keine Handelssignale.
      </p>
    </section>
  );
}
