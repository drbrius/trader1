import { useCallback, useEffect, useState } from 'react';
import { History, LineChart, Trash2 } from 'lucide-react';
import AnalysisResult from './components/AnalysisResult';
import ChartUploader, { UploaderSubmit } from './components/ChartUploader';
import Paywall from './components/Paywall';
import { DisclaimerBanner, DisclaimerFull } from './components/Disclaimer';
import { ChartAnalysis, PricingResponse, QuotaState } from './types';
import {
  ApiError,
  analyzeChart,
  cancelSubscription,
  confirmCheckout,
  fetchPricing,
  fetchQuota,
  startCheckout,
} from './lib/api';
import { clearHistory, loadHistory, saveToHistory, splitDataUrl } from './lib/client';

export default function App() {
  const [pricing, setPricing] = useState<PricingResponse | null>(null);
  const [quota, setQuota] = useState<QuotaState | null>(null);
  const [analysis, setAnalysis] = useState<ChartAnalysis | null>(null);
  const [history, setHistory] = useState<ChartAnalysis[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [paywallReason, setPaywallReason] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const refreshQuota = useCallback(async () => {
    try {
      setQuota(await fetchQuota());
    } catch {
      /* the quota badge is not critical enough to show an error for */
    }
  }, []);

  useEffect(() => {
    setHistory(loadHistory());
    void fetchPricing().then(setPricing).catch(() => setPricing(null));
    void refreshQuota();
  }, [refreshQuota]);

  // Stripe sends the browser back here after checkout.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const status = params.get('checkout');
    const sessionId = params.get('session_id');

    if (!status) return;
    window.history.replaceState({}, '', window.location.pathname);

    if (status === 'cancelled') {
      setNotice('Der Checkout wurde abgebrochen. Es wurde nichts abgebucht.');
      return;
    }
    if (status === 'success' && sessionId) {
      void confirmCheckout(sessionId)
        .then((result) => {
          setQuota(result.quota);
          setPaywallReason(null);
          setNotice('Abo aktiv. Viel Erfolg beim Traden — und denk an dein Risikomanagement.');
        })
        .catch((err: ApiError) => setError(err.message));
    }
  }, []);

  const handleAnalyze = async (input: UploaderSubmit) => {
    const parts = splitDataUrl(input.dataUrl);
    if (!parts) {
      setError('Der Screenshot konnte nicht gelesen werden.');
      return;
    }

    setBusy(true);
    setError(null);
    setPaywallReason(null);

    try {
      const result = await analyzeChart({
        imageBase64: parts.base64,
        mimeType: parts.mimeType,
        instrument: input.instrument || undefined,
        timeframe: input.timeframe || undefined,
        style: input.style,
        notes: input.notes || undefined,
      });

      setAnalysis(result.analysis);
      setQuota(result.quota);
      setHistory(saveToHistory(result.analysis));
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      const apiError = err as ApiError;
      if (apiError.paywall) {
        setPaywallReason(apiError.message);
        if (apiError.quota) setQuota(apiError.quota);
        document.getElementById('preise')?.scrollIntoView({ behavior: 'smooth' });
      } else {
        setError(apiError.message ?? 'Die Analyse ist fehlgeschlagen.');
        if (apiError.quota) setQuota(apiError.quota);
      }
    } finally {
      setBusy(false);
    }
  };

  const handleSubscribe = async (planId: string) => {
    const result = await startCheckout(planId);
    if (result.mode === 'stripe') {
      window.location.href = result.url;
      return;
    }
    setQuota(result.quota);
    setPaywallReason(null);
    setNotice(result.message);
  };

  const handleCancel = async () => {
    const result = await cancelSubscription();
    setQuota(result.quota);
    setNotice('Das Abo wurde beendet.');
  };

  const wipeHistory = () => {
    clearHistory();
    setHistory([]);
  };

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:py-12">
      {/* Header */}
      <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-accent/30 bg-accent/10 text-accent">
            <LineChart size={20} />
          </div>
          <div>
            <h1 className="text-lg font-extrabold tracking-tight">ChartCheck</h1>
            <p className="text-xs text-mist">
              Chart-Screenshot hochladen — technische Analyse und Tendenz in Sekunden.
            </p>
          </div>
        </div>

        {quota && (
          <div className="rounded-xl border border-line bg-panel px-4 py-2 text-right">
            <p className="font-mono text-sm font-bold">
              {quota.remaining}
              <span className="text-mist"> / {quota.limit}</span>
            </p>
            <p className="text-[10px] uppercase tracking-wide text-mist">
              {quota.subscribed ? `${quota.planName} · diesen Monat` : 'Gratis-Analysen'}
            </p>
          </div>
        )}
      </header>

      <div className="mb-6">
        <DisclaimerBanner />
      </div>

      {notice && (
        <p className="mb-4 rounded-xl border border-buy/40 bg-buy/10 px-4 py-3 text-xs text-buy">{notice}</p>
      )}
      {error && (
        <p className="mb-4 rounded-xl border border-sell/40 bg-sell/10 px-4 py-3 text-xs text-sell">{error}</p>
      )}

      <main className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] lg:items-start">
        <ChartUploader busy={busy} onAnalyze={handleAnalyze} />

        <div className="space-y-6">
          {analysis ? (
            <AnalysisResult analysis={analysis} />
          ) : (
            <section className="panel flex min-h-64 flex-col items-center justify-center p-8 text-center">
              <LineChart size={28} className="mb-3 text-mist/50" />
              <p className="text-sm font-medium">Noch keine Analyse</p>
              <p className="mt-1 max-w-sm text-xs leading-relaxed text-mist">
                Lade links einen Chart-Screenshot hoch. Du bekommst Trend, Marktstruktur, Support- und
                Resistance-Zonen, erkennbare Muster sowie eine Buy/Sell/Neutral-Tendenz mit Konfidenz — plus
                ein bullisches und ein bärisches Szenario mit klarer Invalidierung.
              </p>
            </section>
          )}

          {history.length > 0 && (
            <section className="panel p-5">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="flex items-center gap-2 text-sm font-semibold">
                  <History size={15} className="text-accent" />
                  Verlauf
                </h3>
                <button
                  type="button"
                  onClick={wipeHistory}
                  className="flex items-center gap-1.5 text-[11px] text-mist transition-colors hover:text-sell"
                >
                  <Trash2 size={12} />
                  Löschen
                </button>
              </div>
              <ul className="space-y-1.5">
                {history.map((entry) => (
                  <li key={entry.id}>
                    <button
                      type="button"
                      onClick={() => setAnalysis(entry)}
                      className="flex w-full items-center justify-between gap-3 rounded-lg border border-line bg-panel-2 px-3 py-2 text-left transition-colors hover:border-accent/50"
                    >
                      <span className="min-w-0 flex-1 truncate text-xs">
                        {entry.instrument} · {entry.timeframe}
                      </span>
                      <span
                        className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold ${
                          entry.bias === 'BUY'
                            ? 'bg-buy/15 text-buy'
                            : entry.bias === 'SELL'
                              ? 'bg-sell/15 text-sell'
                              : 'bg-hold/15 text-hold'
                        }`}
                      >
                        {entry.bias}
                      </span>
                      <span className="shrink-0 font-mono text-[10px] text-mist">
                        {new Date(entry.timestamp).toLocaleDateString('de-CH')}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-[10px] text-mist/60">
                Der Verlauf liegt nur in diesem Browser. Deine Screenshots werden nicht dauerhaft
                gespeichert.
              </p>
            </section>
          )}
        </div>
      </main>

      <div className="mt-12">
        <Paywall
          pricing={pricing}
          quota={quota}
          reason={paywallReason}
          onSubscribe={handleSubscribe}
          onCancel={handleCancel}
        />
      </div>

      <footer className="mt-12 space-y-4">
        <DisclaimerFull />
        <p className="text-center text-[11px] text-mist/60">
          © {new Date().getFullYear()} ChartCheck · Keine Anlageberatung · Handel birgt das Risiko des
          Totalverlusts
        </p>
      </footer>
    </div>
  );
}
