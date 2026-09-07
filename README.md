# ChartCheck

Trader laden einen Chart-Screenshot hoch und bekommen in Sekunden eine automatisierte
technische Auswertung: Trend, Marktstruktur, Support- und Resistance-Zonen, Chartmuster,
Indikatoren und eine Tendenz (**Buy / Sell / Neutral**) mit Konfidenzangabe — dazu je ein
bullisches und ein bärisches Szenario mit klarer Invalidierung.

> **Keine Finanzberatung.** Die Seite gibt ausdrücklich keine Anlageempfehlungen ab. Der
> Haftungsausschluss ist fest im Produkt verankert: er hängt an jeder einzelnen Analyse
> (serverseitig, nicht entfernbar), steht als Banner über der Oberfläche und ausführlich
> im Footer.

---

## Schnellstart

```bash
npm install
cp .env.example .env          # und GEMINI_API_KEY eintragen
npm run dev                   # http://localhost:3000
```

Weitere Befehle:

| Befehl | Zweck |
| --- | --- |
| `npm run dev` | Entwicklungsserver (Express + Vite Middleware) |
| `npm run build` | Frontend nach `dist/`, Server nach `dist/server.cjs` |
| `npm start` | Produktionsserver aus `dist/` |
| `npm test` | Testsuite — prüft u.a. die Margen-Garantie |
| `npm run lint` | TypeScript-Typecheck |

Ohne `GEMINI_API_KEY` läuft die Seite im **Demo-Modus**: die Oberfläche funktioniert
vollständig, die Analyse ist aber ein klar gekennzeichneter Platzhalter. Es wird nie eine
erfundene Analyse als echt ausgegeben.

---

## Preise und Marge

Anforderung: **mindestens 12 CHF Gewinn pro Abo und Monat.** Beide Pläne erfüllen das mit
deutlichem Puffer. Die Rechnung liegt in `server/pricing.ts` und wird von `npm test`
geprüft — eine Preisänderung, die unter 12 CHF fällt, lässt die Tests rot werden.

| | Trader Pro | Trader Pro — Jahr |
| --- | ---: | ---: |
| Preis | 19.00 CHF / Monat | 190.00 CHF / Jahr |
| Umsatz pro Monat | 19.00 | 15.83 |
| − Stripe (2.9% + 0.30 CHF) | −0.85 | −0.48 |
| − KI-Kosten bei voller Nutzung (150 Analysen) | −0.64 | −0.64 |
| − Infrastruktur (12 CHF/Mt. ÷ 10 Abos) | −1.20 | −1.20 |
| **= Gewinn pro Abo und Monat** | **16.30 CHF** | **13.50 CHF** |

Wichtige Punkte dieser Rechnung:

- **Worst Case gerechnet.** Angenommen wird, dass ein Abonnent sein volles Kontingent von
  150 Analysen ausschöpft. Real nutzen die meisten deutlich weniger, der Gewinn liegt also
  höher.
- **Sicherheitsfaktor 1.8** auf die KI-Kosten (`aiSafetyFactor`), damit längere Antworten,
  hochauflösende Screenshots, Wiederholungen und künftige Preiserhöhungen abgedeckt sind.
- **Fixkosten schon ab 10 Abos gedeckt.** Bei mehr Abonnenten sinkt der Infrastrukturanteil
  pro Kunde und der Gewinn steigt weiter.
- **Bereits ein einziges Abo trägt das Ziel**, sobald die Infrastruktur bezahlt ist — mit
  10 Abos liegt der Gesamtgewinn bei rund 163 CHF pro Monat.

Live nachrechnen:

```bash
curl http://localhost:3000/api/economics                 # Basis: 10 Abonnenten
curl "http://localhost:3000/api/economics?subscribers=50"
```

Die Kostenannahmen (Wechselkurs, Token-Preise, Stripe-Gebühren, Infrastruktur) stehen
gesammelt in `COST_MODEL` in `server/pricing.ts` und lassen sich dort an die echten Zahlen
anpassen.

### Kostenlose Testphase

Jeder Besucher hat **3 Gratis-Analysen** (`FREE_TRIAL_ANALYSES`), danach greift die
Paywall. Das Kontingent wird serverseitig gebucht, **bevor** ein API-Aufruf passiert —
niemand kann also kostenpflichtige Analysen ohne Abo auslösen.

---

## Stripe einrichten

Ohne Stripe-Konfiguration läuft der Checkout im Demo-Modus und schaltet nur lokal frei; er
täuscht niemals eine Zahlung vor.

1. Im Stripe-Dashboard ein Produkt „ChartCheck Trader Pro" anlegen, mit zwei
   wiederkehrenden Preisen: **19 CHF / Monat** und **190 CHF / Jahr**.
2. Die beiden Preis-IDs (`price_…`) und den Secret Key in `.env` eintragen:

   ```bash
   STRIPE_SECRET_KEY="sk_live_…"
   STRIPE_PRICE_PRO_MONTHLY="price_…"
   STRIPE_PRICE_PRO_YEARLY="price_…"
   APP_URL="https://deine-domain.ch"
   ```

3. Server neu starten. „Abo starten" leitet jetzt auf Stripe Checkout weiter; nach der
   Zahlung wird die Session serverseitig gegen die Stripe-API verifiziert, bevor
   irgendetwas freigeschaltet wird.

**Für den Produktivbetrieb empfohlen:** zusätzlich einen Webhook auf
`checkout.session.completed` sowie auf `customer.subscription.deleted` einrichten. Aktuell
wird die Aktivierung über den Success-Redirect bestätigt — schliesst jemand den Tab zu
früh, geht die Zahlung nicht verloren, die Freischaltung passiert aber erst beim nächsten
Besuch. Verlängerungen und Kündigungen über das Stripe-Kundenportal werden noch nicht
automatisch zurückgespielt.

---

## Architektur

```
server.ts                 Express: API + Auslieferung des Frontends
server/pricing.ts         Pläne, Kostenmodell, Margen-Berechnung
server/analysis.ts        Gemini-Aufruf, JSON-Schema, Normalisierung, Demo-Modus
server/subscription.ts    Abo-Status, Monatskontingent, Stripe Checkout (via REST)
server/test-runner.ts     Testsuite
src/App.tsx               Oberfläche
src/components/           Uploader, Ergebnisdarstellung, Paywall, Haftungsausschluss
src/lib/                  API-Client, Client-ID, lokaler Verlauf
```

**API-Endpunkte**

| Methode | Pfad | Zweck |
| --- | --- | --- |
| `GET` | `/api/health` | Statusprüfung, zeigt ob KI und Stripe konfiguriert sind |
| `GET` | `/api/pricing` | Pläne und Preise |
| `GET` | `/api/economics` | Margenrechnung (Betreiber-Sicht) |
| `GET` | `/api/quota` | Verbleibende Analysen dieses Browsers |
| `POST` | `/api/analyze` | Chart-Analyse |
| `POST` | `/api/subscription/checkout` | Stripe-Checkout starten |
| `POST` | `/api/subscription/confirm` | Zahlung verifizieren |
| `POST` | `/api/subscription/cancel` | Abo beenden |

**Bewusste Vereinfachungen** (bewusst gewählt, damit die Seite klein bleibt):

- **Kein Login.** Eine zufällige Client-ID im `localStorage` identifiziert den Browser.
  Das reicht für den Start, ist aber umgehbar (neuer Browser = neue Gratis-Analysen). Für
  echten Umsatzschutz gehört ein Login mit E-Mail dazu — die Abo-Logik in
  `server/subscription.ts` muss dafür nur auf eine User-Tabelle statt auf die Client-ID
  zeigen.
- **Dateibasierter Speicher.** Abo- und Kontingentdaten liegen in `data/subscriptions.json`.
  Auf mehreren Instanzen oder auf Plattformen mit flüchtigem Dateisystem (z.B. Cloud Run)
  muss das durch eine echte Datenbank ersetzt werden — es sind nur die Lese-/Schreibhelfer
  in `server/subscription.ts`.
- **Screenshots werden nicht gespeichert.** Das Bild geht durch den Server an die KI und
  wird danach verworfen. Der Verlauf liegt ausschliesslich im Browser des Nutzers.

---

## Deployment

Läuft überall, wo Node 20+ verfügbar ist:

```bash
npm ci
npm run build
NODE_ENV=production PORT=8080 npm start
```

Nötige Umgebungsvariablen in der Produktion: `GEMINI_API_KEY`, `STRIPE_SECRET_KEY`,
`STRIPE_PRICE_PRO_MONTHLY`, `STRIPE_PRICE_PRO_YEARLY`, `APP_URL`.

Beachte den Punkt zum dateibasierten Speicher oben: auf Cloud Run oder ähnlichen
Plattformen mit flüchtigem Dateisystem gehen Abo-Daten beim Neustart verloren. Vor dem
Verkauf echter Abos also entweder eine Datenbank anbinden oder auf einem Host mit
persistentem Volume deployen.

---

## Vor dem Livegang

Technisch ist die Seite fertig; das hier ist noch offen und liegt ausserhalb des Codes:

- [ ] **Impressum, AGB und Datenschutzerklärung** ergänzen (in der Schweiz revDSG, bei
      EU-Kunden zusätzlich DSGVO).
- [ ] **Widerrufs- bzw. Kündigungsbedingungen** für das Abo festhalten.
- [ ] **MwSt. klären** — die Preise sind als Endpreise inkl. MwSt. ausgewiesen.
- [ ] Rechtlich prüfen lassen, dass das Angebot als Software-Werkzeug und nicht als
      bewilligungspflichtige Finanzdienstleistung auftritt. Der Haftungsausschluss ist
      dafür da, ersetzt aber keine juristische Prüfung.
- [ ] Login ergänzen, falls die Gratis-Analysen nicht umgangen werden sollen.

---

## Lizenz / Haftung

Dieses Projekt stellt ein Werkzeug zur technischen Chartauswertung bereit. Es gibt keine
Finanz-, Anlage-, Steuer- oder Rechtsberatung, keine Handelssignale und keine Zusicherung
über Richtigkeit oder Vollständigkeit der Auswertungen. Der Handel mit Finanzinstrumenten
kann zum Totalverlust des eingesetzten Kapitals führen.
