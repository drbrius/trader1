import { ChangeEvent, DragEvent, useCallback, useEffect, useRef, useState } from 'react';
import { ImageUp, Loader2, Sparkles, X } from 'lucide-react';
import { TradingStyle } from '../types';
import { readFileAsDataUrl } from '../lib/client';

const MAX_BYTES = 8 * 1024 * 1024;
const ACCEPTED = ['image/png', 'image/jpeg', 'image/webp'];

const TIMEFRAMES = ['', 'M1', 'M5', 'M15', 'M30', 'H1', 'H4', 'D1', 'W1'];

const STYLES: { value: TradingStyle; label: string }[] = [
  { value: 'scalping', label: 'Scalping' },
  { value: 'daytrading', label: 'Daytrading' },
  { value: 'swing', label: 'Swing' },
];

export interface UploaderSubmit {
  dataUrl: string;
  instrument: string;
  timeframe: string;
  style: TradingStyle;
  notes: string;
}

interface Props {
  busy: boolean;
  onAnalyze: (input: UploaderSubmit) => void;
}

export default function ChartUploader({ busy, onAnalyze }: Props) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string>('');
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [instrument, setInstrument] = useState('');
  const [timeframe, setTimeframe] = useState('');
  const [style, setStyle] = useState<TradingStyle>('daytrading');
  const [notes, setNotes] = useState('');

  const inputRef = useRef<HTMLInputElement>(null);

  const acceptFile = useCallback(async (file: File | null | undefined) => {
    if (!file) return;
    if (!ACCEPTED.includes(file.type)) {
      setError('Bitte lade ein PNG, JPEG oder WebP hoch.');
      return;
    }
    if (file.size > MAX_BYTES) {
      setError('Der Screenshot ist grösser als 8 MB.');
      return;
    }
    try {
      setDataUrl(await readFileAsDataUrl(file));
      setFileName(file.name || 'Screenshot aus der Zwischenablage');
      setError(null);
    } catch (err: any) {
      setError(err?.message ?? 'Die Datei konnte nicht gelesen werden.');
    }
  }, []);

  // Traders screenshot and paste — Ctrl/Cmd+V anywhere on the page works.
  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      const item = Array.from(event.clipboardData?.items ?? []).find((entry) =>
        entry.type.startsWith('image/'),
      );
      if (item) {
        void acceptFile(item.getAsFile());
      }
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [acceptFile]);

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
    void acceptFile(event.dataTransfer.files?.[0]);
  };

  const onSelect = (event: ChangeEvent<HTMLInputElement>) => {
    void acceptFile(event.target.files?.[0]);
    event.target.value = '';
  };

  const reset = () => {
    setDataUrl(null);
    setFileName('');
    setError(null);
  };

  const submit = () => {
    if (!dataUrl || busy) return;
    onAnalyze({ dataUrl, instrument: instrument.trim(), timeframe, style, notes: notes.trim() });
  };

  return (
    <section className="panel p-5">
      <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold">
        <ImageUp size={16} className="text-accent" />
        Chart hochladen
      </h2>

      {!dataUrl ? (
        <div
          onDragOver={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          onClick={() => inputRef.current?.click()}
          role="button"
          tabIndex={0}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') inputRef.current?.click();
          }}
          className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-6 py-12 text-center transition-colors ${
            dragging ? 'border-accent bg-accent/5' : 'border-line hover:border-accent/60'
          }`}
        >
          <ImageUp size={28} className="text-mist" />
          <p className="text-sm font-medium">Screenshot hierher ziehen oder klicken</p>
          <p className="text-xs text-mist">
            Oder einfach <kbd className="rounded bg-panel-2 px-1.5 py-0.5 font-mono text-[11px]">Strg</kbd>{' '}
            + <kbd className="rounded bg-panel-2 px-1.5 py-0.5 font-mono text-[11px]">V</kbd> aus der
            Zwischenablage einfügen
          </p>
          <p className="mt-1 text-[11px] text-mist/70">PNG, JPEG oder WebP · max. 8 MB</p>
        </div>
      ) : (
        <div className="relative overflow-hidden rounded-xl border border-line">
          <img src={dataUrl} alt="Hochgeladener Chart" className="max-h-80 w-full object-contain bg-panel-2" />
          <button
            type="button"
            onClick={reset}
            aria-label="Screenshot entfernen"
            className="absolute right-2 top-2 rounded-lg bg-ink/80 p-1.5 text-mist transition-colors hover:text-white"
          >
            <X size={15} />
          </button>
          <p className="truncate border-t border-line bg-panel-2 px-3 py-2 text-[11px] text-mist">
            {fileName}
          </p>
        </div>
      )}

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED.join(',')}
        onChange={onSelect}
        className="hidden"
      />

      {error && <p className="mt-3 text-xs text-sell">{error}</p>}

      {/* Optional context. Everything here may stay empty. */}
      <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-mist">
            Instrument (optional)
          </span>
          <input
            className="field"
            placeholder="z.B. BTC/USDT, EUR/USD, SMI"
            value={instrument}
            onChange={(event) => setInstrument(event.target.value)}
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-mist">
            Timeframe (optional)
          </span>
          <select
            className="field"
            value={timeframe}
            onChange={(event) => setTimeframe(event.target.value)}
          >
            {TIMEFRAMES.map((entry) => (
              <option key={entry || 'auto'} value={entry}>
                {entry || 'Automatisch erkennen'}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="mt-3">
        <span className="mb-1.5 block text-[11px] font-medium uppercase tracking-wide text-mist">
          Handelsstil
        </span>
        <div className="flex gap-2">
          {STYLES.map((entry) => (
            <button
              key={entry.value}
              type="button"
              onClick={() => setStyle(entry.value)}
              className={`flex-1 rounded-lg border px-3 py-2 text-xs font-medium transition-colors ${
                style === entry.value
                  ? 'border-accent bg-accent/10 text-accent'
                  : 'border-line bg-panel-2 text-mist hover:text-white'
              }`}
            >
              {entry.label}
            </button>
          ))}
        </div>
      </div>

      <label className="mt-3 block">
        <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-mist">
          Kontext (optional)
        </span>
        <textarea
          className="field resize-none"
          rows={2}
          placeholder="z.B. Ich bin bereits long ab 42'000 und suche einen Ausstieg"
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
        />
      </label>

      <button
        type="button"
        onClick={submit}
        disabled={!dataUrl || busy}
        className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-accent px-4 py-3 text-sm font-semibold text-ink transition-opacity disabled:cursor-not-allowed disabled:opacity-40"
      >
        {busy ? (
          <>
            <Loader2 size={16} className="animate-spin" />
            Chart wird ausgewertet …
          </>
        ) : (
          <>
            <Sparkles size={16} />
            Analyse starten
          </>
        )}
      </button>
    </section>
  );
}
