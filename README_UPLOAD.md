# SC Group Crafting v1.2.4 – Upload-Paket

Dieses Paket aktualisiert ausschließlich den Fabricator-Architekturblock. Bestehende SCMDB-Daten unter `data/scmdb/`, Supabase-Konfiguration, Inventory und Workflow bleiben bestehen.

## Enthalten
- `index.html` – lädt die neue Engine und Bridge
- `sw.js` – neuer PWA Cache v1.2.4
- `fabricator-engine.js` – Product Stat Resolver, Segmente, Multi-Slot-Aggregation
- `fabricator-ui.js` – SCMDB-nahe Product-Stats/Slot-Ansicht
- `fabricator-bridge.js` – verbindet die Engine mit dem bestehenden `app.js`
- `fabricator-v124.css` – neue Fabricator-Styles

## Upload
Alle Dateien aus diesem Ordner auf GitHub in das Root-Verzeichnis des vorhandenen `star-citizen-crafting` Repositorys hochladen. Vorhandene `index.html` und `sw.js` ersetzen. `app.js`, `styles.css`, `supabase-config.js` und `data/scmdb/` NICHT löschen.

## Cache
Nach dem Pages-Deployment am besten zuerst in einem privaten Browserfenster testen. Bei einer installierten PWA ggf. Site-Daten/Service Worker aktualisieren.

## Referenztest
JS-400 mit Q750 auf allen drei Slots muss ergeben:
- Integrity 980 HP -> 1078 HP
- Power Output 21 -> 23 Pips
- Shell x1.100
- Beryl +1 Pip
- Savrilium +1 Pip
- keine doppelten Stat-Zeilen
- pro Slot nur ein aktives Segment
