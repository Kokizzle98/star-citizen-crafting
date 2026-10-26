SC Group Crafting v1.2.2

Neu: Generische Quality-Modifier-Berechnung für alle Blueprints, deren Modifier-Metadaten in blueprints.json enthalten sind. Slot-Beiträge gleicher Eigenschaften werden zusammengeführt. Baseline ist Q500. SMART nutzt echte Modifier-Kurven/Schwellen, soweit sie in den Daten eindeutig vorhanden sind. Blueprints ohne auswertbare Modifier zeigen ausdrücklich "keine auswertbaren Quality-Modifier".

Upload:
1. blueprints.json im GitHub-Root beibehalten.
2. Keine neue SQL-Migration nötig, wenn MIGRATION_v1_2.sql bereits lief.
3. Alle Dateien der ZIP in den Repository-Root hochladen/ersetzen.
4. GitHub Pages main / (root) beibehalten.
5. Nach Deployment Inkognito testen oder alten Service Worker löschen.

Sicherheit: Reservierung und automatische Lagerabbuchung bleiben deaktiviert.
