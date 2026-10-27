#!/usr/bin/env python3
"""VECTOR SCMDB-aware global item audit v2 (read-only)."""
import argparse, csv, hashlib, json, re, sys
from collections import Counter, defaultdict
from pathlib import Path

COMPONENTS = ('helmet','core','arms','legs','backpack','undersuit')
COLOR_TAG = re.compile(r'\bColor[_ -]([A-Za-z0-9_-]+)', re.I)
QUOTED = re.compile(r'["“”]([^"“”]+)["“”]')


def load(path):
    return json.loads(Path(path).read_text(encoding='utf-8-sig'))


def dump_csv(path, rows, fields=None):
    path=Path(path)
    if not rows:
        path.write_text('',encoding='utf-8'); return
    fields=fields or list(rows[0])
    with path.open('w',newline='',encoding='utf-8-sig') as f:
        w=csv.DictWriter(f,fieldnames=fields,extrasaction='ignore'); w.writeheader(); w.writerows(rows)


def flatten(v,p=''):
    if isinstance(v,dict):
        for k,x in v.items(): yield from flatten(x,f'{p}.{k}' if p else k)
    elif isinstance(v,list):
        for x in v: yield from flatten(x,f'{p}[]')
    else: yield p,v


def base_family(item):
    name=str(item.get('name') or '').strip()
    design=(QUOTED.search(name).group(1).strip() if QUOTED.search(name) else None)
    base=QUOTED.sub(' ',name)
    component=None
    for c in COMPONENTS:
        if re.search(rf'\b{c}\b',base,re.I):
            component=c.upper(); base=re.sub(rf'\b{c}\b',' ',base,flags=re.I); break
    color=None
    m=COLOR_TAG.search(str(item.get('tags') or ''))
    if m: color=m.group(1)
    base=re.sub(r'\s+',' ',base).strip(' -_')
    signature='|'.join(str(item.get(k) or '') for k in ('itemType','attachType','attachSubType','manufacturerCode'))+'|'+base.lower()
    return signature,base,design or color,component


def iter_modifiers(bp):
    for ti,tier in enumerate(bp.get('tiers') or []):
        for si,slot in enumerate(tier.get('slots') or []):
            for mi,m in enumerate(slot.get('modifiers') or []):
                yield ti,si,mi,slot,m


def item_baselines(item, pools):
    result={}
    if item.get('health') is not None: result['health_maxhealth']=item.get('health')
    if item.get('maxHealth') is not None: result['health_maxhealth']=item.get('maxHealth')
    for k,canonical in [('temperatureMin','armor_temperaturemin'),('temperatureMax','armor_temperaturemax'),('damageMitigation','armor_damagemitigation')]:
        if item.get(k) is not None: result[canonical]=item[k]
    idx=item.get('fireModesIndex')
    if isinstance(idx,int) and 0 <= idx < len(pools.get('fireModesPools',[])):
        modes=pools['fireModesPools'][idx] or []
        flat=[]
        for mode in modes:
            flat.extend(mode.get('sequenceEntries') or [mode])
        if flat:
            primary=flat[0]
            if primary.get('fireRate') is not None: result['weapon_firerate']=primary['fireRate']
            recoil=primary.get('recoil') or {}
            if recoil:
                # Canonical raw components, mapping decision remains reviewable.
                result['weapon_recoil_smoothness']=recoil.get('smoothTime')
                result['weapon_recoil_handling']=recoil.get('maxFireTime')
                pitches=[abs(recoil.get(k) or 0) for k in ('pitchMaxDeg','yawMaxDeg','rollMaxDeg')]
                result['weapon_recoil_kick']=max(pitches) if pitches else None
    return {k:v for k,v in result.items() if v is not None}


def channel_audit(root, channel, meta, out):
    version=meta['version']; files=meta['files']
    items_doc=load(root/files['crafting_items']); bp_doc=load(root/files['crafting_blueprints'])
    items=items_doc.get('items') or []
    blueprints=bp_doc.get('blueprints') or []
    properties=bp_doc.get('properties') or {}
    by_entity={str(i.get('entityClass')):i for i in items if i.get('entityClass')}
    pools={k:items_doc.get(k) or [] for k in ('fireModesPools','damageResistancePools','signaturesPools')}

    item_rows=[]; family_map=defaultdict(list); baseline_map={}
    for item in items:
        sig,base,design,component=base_family(item)
        baselines=item_baselines(item,pools); baseline_map[str(item.get('entityClass'))]=baselines
        row={'channel':channel,'version':version,'entity_class':item.get('entityClass'),'name':item.get('name'),'item_type':item.get('itemType'),'attach_type':item.get('attachType'),'attach_subtype':item.get('attachSubType'),'manufacturer':item.get('manufacturer'),'size':item.get('size'),'family_signature':sig,'family_name_candidate':base,'design_candidate':design,'set_component_candidate':component,'baseline_keys':'|'.join(sorted(baselines))}
        item_rows.append(row); family_map[sig].append(row)

    modifier_rows=[]; blueprint_rows=[]; issues=[]; used_properties=Counter()
    for bp in blueprints:
        entity=str(bp.get('productEntityClass') or '')
        item=by_entity.get(entity); base=baseline_map.get(entity,{})
        modifiers=list(iter_modifiers(bp))
        keys=sorted({m.get('propertyKey') for *_,m in modifiers if m.get('propertyKey')})
        missing=[k for k in keys if k not in base]
        blueprint_rows.append({'channel':channel,'version':version,'blueprint_guid':bp.get('guid'),'tag':bp.get('tag'),'product_entity_class':entity,'product_name':bp.get('productName'),'gear':bp.get('gear'),'type':bp.get('type'),'subtype':bp.get('subtype'),'item_resolved':bool(item),'modifier_keys':'|'.join(keys),'missing_baseline_keys':'|'.join(missing)})
        if not item: issues.append({'channel':channel,'severity':'REVIEW','code':'BLUEPRINT_OUTPUT_UNRESOLVED','entity':bp.get('productName'),'details':entity})
        for ti,si,mi,slot,m in modifiers:
            key=m.get('propertyKey'); used_properties[key]+=1
            modifier_rows.append({'channel':channel,'version':version,'blueprint_guid':bp.get('guid'),'product_name':bp.get('productName'),'tier_index':ti,'slot_index':si,'slot_name':slot.get('name'),'modifier_index':mi,'property_key':key,'property_name':m.get('propertyName'),'additive':bool(m.get('additive')),'start_quality':m.get('startQuality'),'end_quality':m.get('endQuality'),'modifier_start':m.get('modifierAtStart'),'modifier_end':m.get('modifierAtEnd'),'baseline_status':'RESOLVED' if key in base else 'MISSING'})
            if key not in properties: issues.append({'channel':channel,'severity':'BLOCKING','code':'MODIFIER_PROPERTY_UNDEFINED','entity':bp.get('productName'),'details':key})
            if key not in base: issues.append({'channel':channel,'severity':'REVIEW','code':'CRAFT_STAT_BASELINE_MISSING','entity':bp.get('productName'),'details':key})

    property_rows=[]
    for key,p in properties.items():
        property_rows.append({'channel':channel,'version':version,'property_key':key,'name':p.get('name'),'unit':p.get('unit'),'category':p.get('category'),'modifier_usage_count':used_properties[key],'status':'USED' if used_properties[key] else 'UNUSED'})

    family_rows=[]
    for sig,members in family_map.items():
        if len(members)>1:
            names=sorted({m['name'] for m in members if m['name']})
            family_rows.append({'channel':channel,'version':version,'family_signature':sig,'family_name_candidate':members[0]['family_name_candidate'],'member_count':len(members),'design_values':'|'.join(sorted({str(m['design_candidate']) for m in members if m['design_candidate']})),'component_values':'|'.join(sorted({str(m['set_component_candidate']) for m in members if m['set_component_candidate']})),'members':' | '.join(names),'status':'REVIEW_REQUIRED'})

    cdir=out/channel; cdir.mkdir(parents=True,exist_ok=True)
    dump_csv(cdir/'items.csv',item_rows); dump_csv(cdir/'blueprints.csv',blueprint_rows); dump_csv(cdir/'modifiers.csv',modifier_rows); dump_csv(cdir/'properties.csv',property_rows); dump_csv(cdir/'family_candidates.csv',family_rows); dump_csv(cdir/'issues.csv',issues)
    summary={'channel':channel,'version':version,'items':len(items),'blueprints':len(blueprints),'properties':len(properties),'modifier_rows':len(modifier_rows),'family_candidates':len(family_rows),'issues_by_code':dict(Counter(i['code'] for i in issues)),'source_files':files}
    (cdir/'summary.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2),encoding='utf-8')
    return summary,item_rows,blueprint_rows


def main():
    ap=argparse.ArgumentParser(); ap.add_argument('root',nargs='?',default='.'); ap.add_argument('--out',default='vector-item-audit-v2'); args=ap.parse_args()
    root=Path(args.root); out=Path(args.out); latest=root/'latest.json'
    if not latest.exists(): print(f'ERROR: {latest} fehlt',file=sys.stderr); return 2
    meta=load(latest); summaries={}; channel_data={}
    for channel,cmeta in meta.get('channels',{}).items():
        summaries[channel],items,bps=channel_audit(root,channel,cmeta,out); channel_data[channel]=(items,bps)
    if 'live' in channel_data and 'ptu' in channel_data:
        li={r['entity_class']:r for r in channel_data['live'][0]}; pi={r['entity_class']:r for r in channel_data['ptu'][0]}
        delta=[]
        for eid in sorted(set(li)|set(pi)):
            if eid not in li: delta.append({'entity_class':eid,'change':'ADDED_PTU','live_name':'','ptu_name':pi[eid]['name']})
            elif eid not in pi: delta.append({'entity_class':eid,'change':'REMOVED_PTU','live_name':li[eid]['name'],'ptu_name':''})
            elif li[eid]['name']!=pi[eid]['name'] or li[eid]['baseline_keys']!=pi[eid]['baseline_keys']: delta.append({'entity_class':eid,'change':'CHANGED','live_name':li[eid]['name'],'ptu_name':pi[eid]['name']})
        dump_csv(out/'live_ptu_item_deltas.csv',delta)
    (out/'summary.json').write_text(json.dumps(summaries,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps(summaries,ensure_ascii=False,indent=2)); return 0

if __name__=='__main__': raise SystemExit(main())
