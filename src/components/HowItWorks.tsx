import SectionHead from './SectionHead';
import { ANNOTATE_PHOTO } from '../lib/images';

/** A genuine sequence, so the steps are numbered. */
const STEPS = [
  {
    title: 'Chart abfotografieren',
    body: 'Screenshot aus TradingView, MetaTrader, der Broker-App oder dem Terminal — was immer du nutzt. Ein Ausschnitt reicht, solange Kerzen und Preisachse lesbar sind.',
  },
  {
    title: 'Hochladen oder einfügen',
    body: 'Ziehen, klicken oder mit Strg+V direkt aus der Zwischenablage einfügen — der Weg, den du nach einem Screenshot ohnehin schon in den Fingern hast.',
  },
  {
    title: 'Auswertung lesen',
    body: 'Tendenz mit Konfidenz, die tragenden Zonen mit Preisniveaus und beide Szenarien inklusive Invalidierung — der Punkt, an dem die These widerlegt ist.',
  },
];

export default function HowItWorks() {
  return (
    <section className="pt-[76px]">
      <SectionHead
        eyebrow="Ablauf"
        title="Drei Schritte, keine Einrichtung"
        lead="Kein Broker-Zugang, keine API-Verknüpfung, kein Datenimport. ChartCheck arbeitet mit dem Bild, das du ohnehin schon vor dir hast."
      />

      <div className="mt-9 grid items-center gap-11 md:grid-cols-[minmax(0,1fr)_minmax(0,0.82fr)]">
        <ol className="grid gap-6">
          {STEPS.map((step, index) => (
            <li key={step.title} className="grid grid-cols-[auto_1fr] items-start gap-4">
              <span className="grid h-[34px] w-[34px] place-items-center rounded-[9px] border border-line bg-panel font-data text-[13px] font-bold text-accent">
                {index + 1}
              </span>
              <div>
                <h3 className="text-[14.5px] font-bold">{step.title}</h3>
                <p className="mt-1 text-[13.5px] leading-relaxed text-mist">{step.body}</p>
              </div>
            </li>
          ))}
        </ol>

        <figure className="relative m-0 aspect-[4/3.4] overflow-hidden rounded-[1.125rem] border border-line">
          <img
            src={ANNOTATE_PHOTO.src}
            alt={ANNOTATE_PHOTO.alt}
            loading="lazy"
            className="h-full w-full object-cover"
          />
          <div className="media-scrim absolute inset-0" />
        </figure>
      </div>
    </section>
  );
}
