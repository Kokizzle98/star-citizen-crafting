# Star Citizen Group Crafting PWA – V1

## Enthalten
- Installierbare PWA-Grundstruktur
- Dashboard
- Fabricator mit Blueprint-Suche und Rezeptanzeige
- Materiallager (V1 lokal im Browser)
- Blueprint-Browser
- 1.618 Blueprints aus 4.10.2-live.12913470
- Klassenvisuals
- Offline-Cache via Service Worker

## Gratis veröffentlichen mit GitHub Pages
1. Kostenloses GitHub-Konto erstellen/anmelden.
2. Neues **öffentliches** Repository anlegen, z. B. `sc-crafting`. GitHub Pages ist mit GitHub Free für öffentliche Repositories verfügbar.
3. Den Inhalt dieses Ordners in das Repository hochladen. `index.html` muss auf oberster Ebene liegen.
4. Repository > Settings > Pages öffnen.
5. Als Publishing Source den `main`-Branch und `/ (root)` auswählen.
6. GitHub zeigt anschließend die öffentliche URL der Site an.

## Wichtig
Diese Grundstruktur funktioniert sofort als PWA, speichert Lagerdaten aber absichtlich noch lokal im Browser (`localStorage`). Damit deine Freunde denselben Live-Bestand sehen, muss als nächster Schritt ein gemeinsames Backend eingebunden werden, z. B. Supabase Free.

## Lokaler Test
PWA-Funktionen benötigen HTTP/HTTPS. Im Projektordner z. B. `python -m http.server 8000` starten und `http://localhost:8000` öffnen.
