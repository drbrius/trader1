import { Check, ImageUp } from 'lucide-react';
import { HERO_PHOTO } from '../lib/images';

interface Props {
  /** Scrolls to the section with the given id. */
  onJump: (id: string) => void;
}

const TRUST = ['3 Analysen gratis', 'Keine Kreditkarte nötig', 'Monatlich kündbar'];

export default function Hero({ onJump }: Props) {
  return (
    <header
      className="relative border-b border-line-soft bg-cover"
      style={{ backgroundImage: `url(${HERO_PHOTO.src})`, backgroundPosition: 'center 42%' }}
    >
      <div className="hero-scrim absolute inset-0" />

      <div className="relative mx-auto max-w-[1160px] px-5 pb-[74px] pt-7">
        <div className="max-w-[640px]">
          <p className="eyebrow">Automatisierte Chartanalyse</p>

          <h1 className="mt-3.5 text-[clamp(2.05rem,5.2vw,3.4rem)] font-black leading-[1.03] tracking-[-0.04em]">
            Dein Chart, in Sekunden <span className="text-accent">gelesen</span>.
          </h1>

          <p className="mt-4 max-w-[54ch] text-[clamp(0.95rem,1.5vw,1.075rem)] leading-relaxed text-[#C4CEE1]">
            Screenshot rein — ChartCheck liest Trend, Marktstruktur, Support- und Resistance-Zonen sowie
            Chartmuster heraus und nennt dir eine klare Tendenz mit Konfidenz. Dazu beide Szenarien,
            jeweils mit dem Punkt, an dem sie widerlegt sind.
          </p>

          <div className="mt-6 flex flex-wrap gap-2.5">
            <button
              type="button"
              onClick={() => onJump('analyse')}
              className="flex items-center gap-2 rounded-xl bg-accent px-5 py-3 font-display text-sm font-bold text-[#06121B] transition-opacity hover:opacity-90"
            >
              <ImageUp size={15} />
              Chart analysieren
            </button>
            <button
              type="button"
              onClick={() => onJump('preise')}
              className="rounded-xl border border-line bg-white/5 px-5 py-3 font-display text-sm font-bold transition-colors hover:bg-white/10"
            >
              Preise ansehen
            </button>
          </div>

          <ul className="mt-6 flex flex-wrap gap-x-5 gap-y-2 text-[12.5px] text-mist">
            {TRUST.map((entry) => (
              <li key={entry} className="flex items-center gap-1.5">
                <Check size={13} className="shrink-0 text-buy" />
                {entry}
              </li>
            ))}
          </ul>

          <p className="mt-5 max-w-[52ch] text-[11.5px] text-hold/80">
            Keine Finanzberatung — eine automatisierte technische Auswertung, keine Empfehlung und keine
            Garantie. Handeln erfolgt auf eigenes Risiko.
          </p>
        </div>
      </div>
    </header>
  );
}
