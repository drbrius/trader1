import { AlertTriangle } from 'lucide-react';

export const DISCLAIMER_SHORT =
  'Keine Finanzberatung. Automatisierte technische Auswertung, kann falsch sein. Handeln auf eigenes Risiko.';

export const DISCLAIMER_LONG =
  'ChartCheck ist ein automatisiertes Werkzeug zur technischen Chartauswertung und stellt ausdrücklich ' +
  'keine Finanz-, Anlage-, Steuer- oder Rechtsberatung dar. Es werden keine Empfehlungen zum Kauf oder ' +
  'Verkauf von Finanzinstrumenten abgegeben. Die Auswertungen entstehen durch Mustererkennung auf einem ' +
  'hochgeladenen Bild, können fehlerhaft oder unvollständig sein und berücksichtigen weder deine ' +
  'persönliche Situation noch Nachrichtenlage, Fundamentaldaten oder Liquidität. Vergangene Kursverläufe ' +
  'sind kein Indikator für zukünftige Entwicklungen. Der Handel mit Finanzinstrumenten, insbesondere mit ' +
  'Hebel, ist mit erheblichen Risiken verbunden und kann zum Totalverlust des eingesetzten Kapitals führen. ' +
  'Jede Handelsentscheidung triffst du eigenverantwortlich und auf eigenes Risiko. Für Anlageentscheidungen ' +
  'wende dich an eine zugelassene Finanzdienstleisterin oder einen zugelassenen Finanzdienstleister.';

/** The compact banner shown above the fold. */
export function DisclaimerBanner() {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-hold/30 bg-hold/10 px-4 py-3">
      <AlertTriangle size={16} className="mt-0.5 shrink-0 text-hold" />
      <p className="text-xs leading-relaxed text-hold/90">
        <span className="font-semibold">Keine Finanzberatung.</span> ChartCheck liefert eine automatisierte
        technische Auswertung deines Screenshots — keine Empfehlung, keine Garantie, keine Beratung. Handeln
        erfolgt auf eigenes Risiko und kann zum Totalverlust führen.
      </p>
    </div>
  );
}

/** The full legal text for the footer. */
export function DisclaimerFull() {
  return (
    <div className="panel p-5">
      <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-mist">
        <AlertTriangle size={14} className="text-hold" />
        Rechtlicher Hinweis
      </h3>
      <p className="text-xs leading-relaxed text-mist/80">{DISCLAIMER_LONG}</p>
    </div>
  );
}
