import { Check } from 'lucide-react';
import SectionHead from './SectionHead';
import { TABLET_PHOTO } from '../lib/images';

const ITEMS = [
  {
    title: 'Tendenz mit Konfidenz',
    body: 'Buy, Sell oder Neutral — und wie belastbar die Einschätzung ist. Bei unklarer Lage steht dort Neutral, nicht geraten.',
  },
  {
    title: 'Zonen mit Preisniveaus',
    body: 'Support und Resistance mit konkreten Kursen und der Begründung, warum die Zone trägt.',
  },
  {
    title: 'Struktur und Muster',
    body: 'Trend, höhere Hochs und Tiefs, Strukturbrüche, erkennbare Formationen und die Aussage sichtbarer Indikatoren.',
  },
  {
    title: 'Beide Szenarien',
    body: 'Bullisch und bärisch, je mit Trigger, Zielbereich und Invalidierung — nicht nur die eine Richtung, die gerade gefällt.',
  },
  {
    title: 'Die eigenen Grenzen',
    body: 'Was der Screenshot nicht zeigt: fehlender höherer Timeframe, unsichtbares Volumen, schlechte Bildqualität.',
  },
];

export default function Deliverables() {
  return (
    <section className="pt-[76px]">
      <SectionHead
        eyebrow="Ergebnis"
        title="Was in jeder Auswertung steht"
        lead="Kein Signal, keine Zahl ohne Begründung. Jede Aussage lässt sich im Chart nachprüfen — und jede Einschätzung nennt ihre eigenen Schwächen."
      />

      <div className="mt-9 grid items-center gap-11 md:grid-cols-[minmax(0,0.82fr)_minmax(0,1fr)]">
        <figure className="relative m-0 aspect-[4/3.4] overflow-hidden rounded-[1.125rem] border border-line">
          <img
            src={TABLET_PHOTO.src}
            alt={TABLET_PHOTO.alt}
            loading="lazy"
            className="h-full w-full object-cover"
          />
          <div className="media-scrim absolute inset-0" />
        </figure>

        <ul className="grid gap-3.5">
          {ITEMS.map((item) => (
            <li key={item.title} className="grid grid-cols-[auto_1fr] items-start gap-3">
              <Check size={15} className="mt-1 shrink-0 text-buy" />
              <div>
                <b className="block font-display text-[13.5px] font-bold">{item.title}</b>
                <span className="text-[13px] leading-relaxed text-mist">{item.body}</span>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
