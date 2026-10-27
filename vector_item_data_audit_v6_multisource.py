#!/usr/bin/env python3
"""VECTOR V6 multi-source SCMDB resolver.

Builds on the existing V4/V5 audit and adds conservative fallback resolution from
all SCMDB channel files (especially merged and specialized datasets).

Resolution order:
  1. V4 canonical item resolver
  2. V5 scoped path profiler
  3. V6 multi-source records matched to the product entity UUID/class/name
  4. SOURCE_UNAVAILABLE when every configured source was inspected

No zero fallback. Ambiguous candidates remain REVIEW_REQUIRED.
"""
from __future__ import annotations

import argparse
import csv
import importlib.util
import json
import re
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Tuple

ROOT = Path(__file__).resolve().parent


def load_module(name: str, path: Path):
    spec = importlib.util.spec_from_file_location(name, path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Cannot load module: {path}")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def load_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8-sig"))


def norm(value: Any) -> str:
    return re.sub(r"[^a-z0-9]", "", str(value or "").lower())


def scalar(value: Any) -> bool:
    return isinstance(value, (int, float)) and not isinstance(value, bool)


def walk(value: Any, path: str = "") -> Iterable[Tuple[str, str, Any]]:
    if isinstance(value, dict):
        for key, child in value.items():
            current = f"{path}.{key}" if path else str(key)
            yield current, str(key), child
            yield from walk(child, current)
    elif isinstance(value, list):
        for index, child in enumerate(value):
            current = f"{path}[{index}]"
            yield from walk(child, current)


def parent_path(path: str) -> str:
    return path.rsplit(".", 1)[0] if "." in path else ""


IDENTIFIER_KEYS = {
    "entityclass", "entityclassguid", "classguid", "classid", "classuuid",
    "uuid", "guid", "id", "classname", "class", "recordid"
}
NAME_KEYS = {"name", "displayname", "itemname", "productname"}


def collect_record_identifiers(record: Dict[str, Any]) -> Tuple[set, set]:
    identifiers, names = set(), set()
    for key, value in record.items():
        nk = norm(key)
        if isinstance(value, str):
            if nk in IDENTIFIER_KEYS:
                identifiers.add(value.lower())
            if nk in NAME_KEYS:
                names.add(norm(value))
    return identifiers, names


def build_record_index(document: Any, source_file: str) -> Tuple[Dict[str, List[dict]], Dict[str, List[dict]]]:
    """Index every object carrying an identifier/name.

    The stored record is the full object, which preserves nearby semantic context.
    Duplicate object identities are suppressed per lookup key.
    """
    by_id: Dict[str, List[dict]] = defaultdict(list)
    by_name: Dict[str, List[dict]] = defaultdict(list)
    seen = set()

    def visit(value: Any, path: str = ""):
        if isinstance(value, dict):
            ids, names = collect_record_identifiers(value)
            if ids or names:
                marker = (source_file, path)
                if marker not in seen:
                    seen.add(marker)
                    entry = {"source_file": source_file, "record_path": path, "record": value}
                    for ident in ids:
                        by_id[ident].append(entry)
                    for name in names:
                        by_name[name].append(entry)
            for key, child in value.items():
                next_path = f"{path}.{key}" if path else str(key)
                visit(child, next_path)
        elif isinstance(value, list):
            for index, child in enumerate(value):
                visit(child, f"{path}[{index}]")

    visit(document)
    return by_id, by_name


def merge_indexes(target: Dict[str, List[dict]], incoming: Dict[str, List[dict]]) -> None:
    for key, values in incoming.items():
        existing = {(v["source_file"], v["record_path"]) for v in target[key]}
        for value in values:
            marker = (value["source_file"], value["record_path"])
            if marker not in existing:
                target[key].append(value)
                existing.add(marker)


def source_files_for_channel(root: Path, channel_meta: dict) -> List[Path]:
    files = channel_meta.get("files") or {}
    ordered_keys = [
        "crafting_items", "merged", "mining_equipment", "mining_data",
        "crafting_blueprints", "cig_data_issues", "mission_history"
    ]
    paths = []
    for key in ordered_keys:
        rel = files.get(key)
        if rel:
            path = root / rel
            if path.exists() and path not in paths:
                paths.append(path)
    for rel in files.values():
        path = root / rel
        if path.exists() and path not in paths:
            paths.append(path)
    return paths


PROPERTY_RULES = {
    "itemresource_coolantgeneration": {
        "leaves": {"coolantgeneration", "coolantgenerationrate", "coolingrate", "coolantrate", "coolantrating", "generation"},
        "required_context": {"coolant", "cooling", "resource", "network"},
        "forbidden_context": {"capacity", "demand", "consumption", "power"},
        "attach_types": {"cooler"},
        "unit": "segments",
    },
    "radar_minaimassistdistance": {
        "leaves": {"minaimassistdistance", "minimumaimassistdistance", "mindistance", "minrange", "min"},
        "required_context": {"aimassist", "targetassist", "targetingassist"},
        "forbidden_context": {"combatrange", "tractor", "beam", "salvage", "weapon", "shield", "temperature"},
        "attach_types": {"radar"},
        "unit": "m",
    },
    "radar_maxaimassistdistance": {
        "leaves": {"maxaimassistdistance", "maximumaimassistdistance", "maxdistance", "maxrange", "max"},
        "required_context": {"aimassist", "targetassist", "targetingassist"},
        "forbidden_context": {"combatrange", "tractor", "beam", "salvage", "weapon", "shield", "temperature"},
        "attach_types": {"radar"},
        "unit": "m",
    },
    "weapon_hullscraping_speed": {
        "leaves": {"hullscrapingspeed", "scrapingspeed", "scrapespeed", "extractionrate", "rate", "speed"},
        "required_context": {"salvage", "scrape", "scraper", "hullscraping"},
        "forbidden_context": {"weaponfirerate", "quantum", "tractor"},
        "attach_types": {"salvagehead", "salvage"},
        "unit": None,
    },
    "weapon_hullscraping_efficiency": {
        "leaves": {"hullscrapingefficiency", "scrapingefficiency", "scrapeefficiency", "efficiency", "yield"},
        "required_context": {"salvage", "scrape", "scraper", "hullscraping"},
        "forbidden_context": {"dismantle", "mining", "tractor"},
        "attach_types": {"salvagehead", "salvage"},
        "unit": None,
    },
    "weapon_hullscraping_radius": {
        "leaves": {"hullscrapingradius", "scrapingradius", "scraperadius", "beamradius", "radius"},
        "required_context": {"salvage", "scrape", "scraper", "hullscraping"},
        "forbidden_context": {"tractor", "mining", "weaponspread"},
        "attach_types": {"salvagehead", "salvage"},
        "unit": "m",
    },
}


def item_scope_ok(item: dict, rule: dict) -> bool:
    allowed = rule.get("attach_types") or set()
    if not allowed:
        return True
    text = norm(" ".join(str(item.get(k) or "") for k in ("attachType", "attachSubType", "itemType", "name")))
    return any(token in text for token in allowed)


def record_candidates(item: dict, entries: List[dict], prop: str) -> List[dict]:
    rule = PROPERTY_RULES[prop]
    if not item_scope_ok(item, rule):
        return []
    outputs = []
    for entry in entries:
        record = entry["record"]
        string_context = []
        for path, key, value in walk(record):
            if isinstance(value, str):
                string_context.append(f"{path} {value}")
        all_strings = norm(" ".join(string_context))
        for path, key, value in walk(record):
            if not scalar(value):
                continue
            leaf = norm(key)
            if leaf not in rule["leaves"]:
                continue
            local_parent = parent_path(path)
            local_context = norm(f"{path} {local_parent} {all_strings}")
            required_hits = [token for token in rule["required_context"] if token in local_context]
            forbidden_hits = [token for token in rule["forbidden_context"] if token in norm(f"{path} {local_parent}")]
            if forbidden_hits:
                decision = "REJECTED_SEMANTICS"
            elif not required_hits:
                decision = "REJECTED_SCOPE"
            else:
                decision = "ACCEPTED"
            score = 10 + len(required_hits) * 2 - len(forbidden_hits) * 4
            outputs.append({
                "property_key": prop,
                "source_file": entry["source_file"],
                "record_path": entry["record_path"],
                "candidate_path": path,
                "candidate_value": value,
                "parent_path": local_parent,
                "scope_score": score,
                "required_hits": "|".join(required_hits),
                "forbidden_hits": "|".join(forbidden_hits),
                "decision": decision,
            })
    return outputs


def choose_candidate(candidates: List[dict]) -> Tuple[Optional[dict], str]:
    accepted = [c for c in candidates if c["decision"] == "ACCEPTED"]
    if not accepted:
        return None, "SOURCE_UNAVAILABLE"
    max_score = max(c["scope_score"] for c in accepted)
    top = [c for c in accepted if c["scope_score"] == max_score]
    normalized = {(c["source_file"], c["candidate_path"], json.dumps(c["candidate_value"], sort_keys=True)) for c in top}
    values = {json.dumps(c["candidate_value"], sort_keys=True) for c in top}
    if len(values) == 1:
        return top[0], "RESOLVED"
    for candidate in top:
        candidate["decision"] = "AMBIGUOUS"
    return top[0], "REVIEW_REQUIRED"


def build_channel_indexes(root: Path, channel_meta: dict):
    by_id: Dict[str, List[dict]] = defaultdict(list)
    by_name: Dict[str, List[dict]] = defaultdict(list)
    loaded_sources = []
    for path in source_files_for_channel(root, channel_meta):
        try:
            doc = load_json(path)
        except Exception as exc:
            print(f"WARN: cannot load {path}: {exc}")
            continue
        idx_id, idx_name = build_record_index(doc, path.name)
        merge_indexes(by_id, idx_id)
        merge_indexes(by_name, idx_name)
        loaded_sources.append(path.name)
    return by_id, by_name, loaded_sources


def related_entries(item: dict, by_id: Dict[str, List[dict]], by_name: Dict[str, List[dict]]) -> List[dict]:
    keys = []
    for field in ("entityClass", "uuid", "guid", "id", "className"):
        value = item.get(field)
        if isinstance(value, str) and value:
            keys.append(value.lower())
    result = []
    seen = set()
    for key in keys:
        for entry in by_id.get(key, []):
            marker = (entry["source_file"], entry["record_path"])
            if marker not in seen:
                seen.add(marker); result.append(entry)
    name = norm(item.get("name"))
    if name:
        for entry in by_name.get(name, []):
            marker = (entry["source_file"], entry["record_path"])
            if marker not in seen:
                seen.add(marker); result.append(entry)
    return result


def make_multisource_enhancer(base_resolver, by_id, by_name, sink):
    def enhanced(item, pools):
        values, provenance, states = base_resolver(item, pools)
        entries = related_entries(item, by_id, by_name)
        for prop in PROPERTY_RULES:
            if prop in values and states.get(prop) in {"RESOLVED", "REVIEW_REQUIRED"}:
                continue
            candidates = record_candidates(item, entries, prop)
            for candidate in candidates:
                sink.append({
                    "entity_class": item.get("entityClass"),
                    "product_name": item.get("name"),
                    "item_type": item.get("itemType"),
                    "attach_type": item.get("attachType"),
                    "attach_subtype": item.get("attachSubType"),
                    **candidate,
                })
            best, status = choose_candidate(candidates)
            if best is not None:
                values[prop] = best["candidate_value"]
                provenance[prop] = f'{best["source_file"]}:{best["record_path"]}:{best["candidate_path"]}'
                states[prop] = status
            else:
                provenance[prop] = "V6 multi-source: all configured sources inspected; no verified candidate"
                states[prop] = "SOURCE_UNAVAILABLE"
        return values, provenance, states
    return enhanced


def write_v6_candidates(out_dir: Path, channel: str, rows: List[dict], loaded_sources: List[str]):
    cdir = out_dir / channel
    cdir.mkdir(parents=True, exist_ok=True)
    fields = [
        "entity_class", "product_name", "item_type", "attach_type", "attach_subtype",
        "property_key", "source_file", "record_path", "candidate_path", "candidate_value",
        "parent_path", "scope_score", "required_hits", "forbidden_hits", "decision"
    ]
    with (cdir / "multisource_candidates.csv").open("w", newline="", encoding="utf-8-sig") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields, extrasaction="ignore")
        writer.writeheader(); writer.writerows(rows)
    freq = Counter((r["property_key"], r["source_file"], r["candidate_path"], r["decision"]) for r in rows)
    with (cdir / "multisource_path_frequency.csv").open("w", newline="", encoding="utf-8-sig") as handle:
        writer = csv.writer(handle)
        writer.writerow(["property_key", "source_file", "candidate_path", "decision", "count"])
        for (prop, source, path, decision), count in sorted(freq.items(), key=lambda x: (x[0][0], -x[1], x[0][1], x[0][2])):
            writer.writerow([prop, source, path, decision, count])
    (cdir / "multisource_manifest.json").write_text(json.dumps({"loadedSources": loaded_sources}, indent=2), encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("root", nargs="?", default="data/scmdb")
    parser.add_argument("--out", default="vector-item-audit-v6-multisource")
    parser.add_argument("--config", default="VECTOR_V5_RESOLVER_DEFINITION.json")
    args = parser.parse_args()

    root = Path(args.root)
    out = Path(args.out)
    latest = load_json(root / "latest.json")
    config = load_json(Path(args.config))

    v4 = load_module("vector_v4", ROOT / "vector_item_data_audit_v4_universal.py")
    v5 = load_module("vector_v5", ROOT / "vector_item_data_audit_v5_profiler.py")
    original_v4 = v4.item_baselines
    summaries = {}

    for channel, channel_meta in (latest.get("channels") or {}).items():
        v5_sink = []
        v6_sink = []
        by_id, by_name, loaded_sources = build_channel_indexes(root, channel_meta)

        v4.item_baselines = original_v4
        v5_resolver = v5.build_enhancer(v4, config, v5_sink)
        v4.item_baselines = make_multisource_enhancer(v5_resolver, by_id, by_name, v6_sink)

        summary, items, blueprints = v4.channel_audit(root, channel, channel_meta, out)
        summary["resolverVersion"] = "6-multisource"
        summary["v5ProfilerCandidates"] = len(v5_sink)
        summary["v6MultiSourceCandidates"] = len(v6_sink)
        summary["v6LoadedSources"] = loaded_sources
        (out / channel / "summary.json").write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")
        v5.write_profiler(out, channel, v5_sink)
        write_v6_candidates(out, channel, v6_sink, loaded_sources)
        summaries[channel] = summary

    (out / "summary.json").write_text(json.dumps(summaries, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(summaries, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
