#!/usr/bin/env python3
"""VECTOR SCMDB-aware item audit v3: Armor baseline resolvers."""
import argparse, csv, json, re, sys
from collections import Counter, defaultdict
from pathlib import Path

COMPONENTS = ('helmet','core','arms','legs','backpack','undersuit')
COLOR_TAG = re.compile(r'\bColor[_ -]([A-Za-z0-9_-]+)', re.I)
QUOTED = re.compile(r'["“”]([^"“”]+)["“”]')

ARMOR_ALIASES = {
    'armor_temperaturemin': {
        'temperaturemin','mintemperature','minimumtemperature','minoperatingtemperature',
        'operatingtemperaturemin','temperatureminimum','minsafeTemperature'.lower()
    },
    'armor_temperaturemax': {
        'temperaturemax','maxtemperature','maximumtemperature','maxoperatingtemperature',
        'operatingtemperaturemax','temperaturemaximum','maxsafeTemperature'.lower()
    },
}
RESISTANCE_REF_HINTS = {
    'damageresistanceindex','damageresistancesindex','resistanceindex',
    'damageresistancepoolindex','damageresistancespoolindex','resistancepoolindex'
}
RESISTANCE_INLINE_HINTS = {'damageresistance','damageresistances','resistance','resistances'}


def load(path): return json.loads(Path(path).read_text(encoding='utf-8-sig'))

def dump_csv(path, rows, fields=None):
    path=Path(path)
    if not rows:
        path.write_text('',encoding='utf-8'); return
    fields=fields or list(rows[0])
    with path.open('w',newline='',encoding='utf-8-sig') as f:
        w=csv.DictWriter(f,fieldnames=fields,extrasaction='ignore'); w.writeheader(); w.writerows(rows)

def norm(k): return re.sub(r'[^a-z0-9]','',str(k).lower())

def walk(value, path=''):
    if isinstance(value,dict):
        for k,v in value.items():
            p=f'{path}.{k}' if path else str(k)
            yield p,k,v
            yield from walk(v,p)
    elif isinstance(value,list):
        for i,v in enumerate(value): yield from walk(v,f'{path}[{i}]')

def scalar(v): return isinstance(v,(int,float)) and not isinstance(v,bool)

def base_family(item):
    name=str(item.get('name') or '').strip(); q=QUOTED.search(name)
    design=q.group(1).strip() if q else None; base=QUOTED.sub(' ',name); component=None
    for c in COMPONENTS:
        if re.search(rf'\b{c}\b',base,re.I):
            component=c.upper(); base=re.sub(rf'\b{c}\b',' ',base,flags=re.I); break
    m=COLOR_TAG.search(str(item.get('tags') or '')); color=m.group(1) if m else None
    base=re.sub(r'\s+',' ',base).strip(' -_')
    sig='|'.join(str(item.get(k) or '') for k in ('itemType','attachType','attachSubType','manufacturerCode'))+'|'+base.lower()
    return sig,base,design or color,component

def iter_modifiers(bp):
    for ti,tier in enumerate(bp.get('tiers') or []):
        for si,slot in enumerate(tier.get('slots') or []):
            for mi,m in enumerate(slot.get('modifiers') or []): yield ti,si,mi,slot,m

def find_numeric_alias(item, aliases):
    matches=[]
    for path,key,value in walk(item):
        if norm(key) in aliases and scalar(value): matches.append((path,value))
    if not matches: return None,None,'SOURCE_DATA_MISSING'
    matches.sort(key=lambda x:(x[0].count('.'),len(x[0])))
    status='RESOLVED' if len({v for _,v in matches})==1 else 'REVIEW_REQUIRED'
    return matches[0][1],matches[0][0],status

def mitigation_from_pool(pool):
    """Return structured armor mitigation without inventing a lossy scalar."""
    if not isinstance(pool,(dict,list)): return None
    channels={}
    impact=None
    for path,key,value in walk(pool):
        nk=norm(key)
        if nk=='impactforce' and scalar(value): impact=value
        if nk=='multiplier' and scalar(value):
            parent=path.rsplit('.',1)[0]
            channel=parent.rsplit('.',1)[-1].split('[')[0]
            channels[channel]=value
    if not channels and impact is None: return None
    return {'channels':channels,'impactForce':impact}

def resolve_armor(item,pools):
    out={}; provenance={}; states={}
    for canonical,aliases in ARMOR_ALIASES.items():
        value,path,status=find_numeric_alias(item,aliases)
        if value is not None: out[canonical]=value
        provenance[canonical]=path or 'not found in item payload'; states[canonical]=status

    pool_list=pools.get('damageResistancePools',[])
    candidates=[]
    for path,key,value in walk(item):
        nk=norm(key)
        if nk in RESISTANCE_REF_HINTS and isinstance(value,int) and 0 <= value < len(pool_list):
            candidates.append((path,value,pool_list[value]))
        elif nk in RESISTANCE_INLINE_HINTS and isinstance(value,(dict,list)):
            candidates.append((path,None,value))
    resolved=[]
    for path,index,pool in candidates:
        structured=mitigation_from_pool(pool)
        if structured is not None: resolved.append((path,index,structured))
    if resolved:
        path,index,structured=resolved[0]
        out['armor_damagemitigation']=structured
        provenance['armor_damagemitigation']=f'{path} -> damageResistancePools[{index}]' if index is not None else path
        states['armor_damagemitigation']='RESOLVED' if len(resolved)==1 else 'REVIEW_REQUIRED'
    else:
        provenance['armor_damagemitigation']='no valid inline or pool reference found'
        states['armor_damagemitigation']='SOURCE_DATA_MISSING'
    return out,provenance,states

def item_baselines(item,pools):
    result={}; provenance={}; states={}
    armor,aprov,astates=resolve_armor(item,pools)
    result.update(armor); provenance.update(aprov); states.update(astates)
    for key in ('health','maxHealth'):
        if item.get(key) is not None:
            result['health_maxhealth']=item[key]; provenance['health_maxhealth']=f'items[].{key}'; states['health_maxhealth']='RESOLVED'
    idx=item.get('fireModesIndex')
    if isinstance(idx,int) and 0 <= idx < len(pools.get('fireModesPools',[])):
        modes=pools['fireModesPools'][idx] or []; flat=[]
        for mode in modes: flat.extend(mode.get('sequenceEntries') or [mode])
        if flat:
            primary=flat[0]
            if primary.get('fireRate') is not None:
                result['weapon_firerate']=primary['fireRate']; provenance['weapon_firerate']=f'fireModesPools[{idx}].primary.fireRate'; states['weapon_firerate']='RESOLVED'
            recoil=primary.get('recoil') or {}
            for canonical,raw in [('weapon_recoil_smoothness','smoothTime'),('weapon_recoil_handling','maxFireTime')]:
                if recoil.get(raw) is not None:
                    result[canonical]=recoil[raw]; provenance[canonical]=f'fireModesPools[{idx}].primary.recoil.{raw}'; states[canonical]='REVIEW_REQUIRED'
            axes={k:recoil.get(k) for k in ('pitchMaxDeg','yawMaxDeg','rollMaxDeg') if recoil.get(k) is not None}
            if axes:
                result['weapon_recoil_kick']=axes; provenance['weapon_recoil_kick']=f'fireModesPools[{idx}].primary.recoil'; states['weapon_recoil_kick']='REVIEW_REQUIRED'
    return result,provenance,states

def channel_audit(root,channel,meta,out):
    version=meta['version']; files=meta['files']
    items_doc=load(root/files['crafting_items']); bp_doc=load(root/files['crafting_blueprints'])
    items=items_doc.get('items') or []; blueprints=bp_doc.get('blueprints') or []; properties=bp_doc.get('properties') or {}
    by_entity={str(i.get('entityClass')):i for i in items if i.get('entityClass')}
    pools={k:items_doc.get(k) or [] for k in ('fireModesPools','damageResistancePools','signaturesPools')}
    item_rows=[]; family_map=defaultdict(list); baseline_map={}; provenance_map={}; state_map={}; armor_rows=[]
    for item in items:
        sig,base,design,component=base_family(item)
        baselines,provenance,states=item_baselines(item,pools); eid=str(item.get('entityClass'))
        baseline_map[eid]=baselines; provenance_map[eid]=provenance; state_map[eid]=states
        row={'channel':channel,'version':version,'entity_class':item.get('entityClass'),'name':item.get('name'),'item_type':item.get('itemType'),'attach_type':item.get('attachType'),'attach_subtype':item.get('attachSubType'),'manufacturer':item.get('manufacturer'),'size':item.get('size'),'family_signature':sig,'family_name_candidate':base,'design_candidate':design,'set_component_candidate':component,'baseline_keys':'|'.join(sorted(baselines))}
        item_rows.append(row); family_map[sig].append(row)
        if str(item.get('itemType') or '').lower()=='armor':
            for key in ('armor_damagemitigation','armor_temperaturemin','armor_temperaturemax'):
                armor_rows.append({'channel':channel,'version':version,'entity_class':eid,'name':item.get('name'),'property_key':key,'resolver_status':states.get(key,'SOURCE_DATA_MISSING'),'source_path':provenance.get(key,''),'value_json':json.dumps(baselines.get(key),ensure_ascii=False) if key in baselines else ''})
    modifier_rows=[]; blueprint_rows=[]; issues=[]; used=Counter(); resolved=Counter(); state_counts=Counter()
    for bp in blueprints:
        eid=str(bp.get('productEntityClass') or ''); item=by_entity.get(eid); base=baseline_map.get(eid,{}); states=state_map.get(eid,{})
        mods=list(iter_modifiers(bp)); keys=sorted({m.get('propertyKey') for *_,m in mods if m.get('propertyKey')}); missing=[k for k in keys if k not in base]
        blueprint_rows.append({'channel':channel,'version':version,'blueprint_guid':bp.get('guid'),'tag':bp.get('tag'),'product_entity_class':eid,'product_name':bp.get('productName'),'gear':bp.get('gear'),'type':bp.get('type'),'subtype':bp.get('subtype'),'item_resolved':bool(item),'modifier_keys':'|'.join(keys),'missing_baseline_keys':'|'.join(missing)})
        if not item: issues.append({'channel':channel,'severity':'REVIEW','code':'BLUEPRINT_OUTPUT_UNRESOLVED','entity':bp.get('productName'),'details':eid})
        for ti,si,mi,slot,m in mods:
            key=m.get('propertyKey'); used[key]+=1; status=states.get(key,'RESOLVED' if key in base else 'SOURCE_DATA_MISSING'); state_counts[(key,status)]+=1
            if key in base: resolved[key]+=1
            modifier_rows.append({'channel':channel,'version':version,'blueprint_guid':bp.get('guid'),'product_name':bp.get('productName'),'tier_index':ti,'slot_index':si,'slot_name':slot.get('name'),'modifier_index':mi,'property_key':key,'property_name':m.get('propertyName'),'additive':bool(m.get('additive')),'start_quality':m.get('startQuality'),'end_quality':m.get('endQuality'),'modifier_start':m.get('modifierAtStart'),'modifier_end':m.get('modifierAtEnd'),'baseline_status':status,'baseline_source':provenance_map.get(eid,{}).get(key,'')})
            if key not in properties: issues.append({'channel':channel,'severity':'BLOCKING','code':'MODIFIER_PROPERTY_UNDEFINED','entity':bp.get('productName'),'details':key})
            if key not in base: issues.append({'channel':channel,'severity':'REVIEW','code':'CRAFT_STAT_BASELINE_MISSING','entity':bp.get('productName'),'details':key})
            elif status=='REVIEW_REQUIRED': issues.append({'channel':channel,'severity':'REVIEW','code':'CRAFT_STAT_BASELINE_REVIEW','entity':bp.get('productName'),'details':key})
    property_rows=[]
    for key,p in properties.items():
        property_rows.append({'channel':channel,'version':version,'property_key':key,'name':p.get('name'),'unit':p.get('unit'),'category':p.get('category'),'modifier_usage_count':used[key],'resolved_count':resolved[key],'missing_count':used[key]-resolved[key],'status':'USED' if used[key] else 'UNUSED'})
    family_rows=[]
    for sig,members in family_map.items():
        if len(members)>1:
            names=sorted({m['name'] for m in members if m['name']})
            family_rows.append({'channel':channel,'version':version,'family_signature':sig,'family_name_candidate':members[0]['family_name_candidate'],'member_count':len(members),'design_values':'|'.join(sorted({str(m['design_candidate']) for m in members if m['design_candidate']})),'component_values':'|'.join(sorted({str(m['set_component_candidate']) for m in members if m['set_component_candidate']})),'members':' | '.join(names),'status':'REVIEW_REQUIRED'})
    cdir=out/channel; cdir.mkdir(parents=True,exist_ok=True)
    for name,data in [('items.csv',item_rows),('blueprints.csv',blueprint_rows),('modifiers.csv',modifier_rows),('properties.csv',property_rows),('family_candidates.csv',family_rows),('issues.csv',issues),('armor_resolver.csv',armor_rows)]: dump_csv(cdir/name,data)
    summary={'channel':channel,'version':version,'resolverVersion':'3-armor','items':len(items),'blueprints':len(blueprints),'properties':len(properties),'modifier_rows':len(modifier_rows),'family_candidates':len(family_rows),'issues_by_code':dict(Counter(i['code'] for i in issues)),'armor_resolution':{key:{status:count for (k,status),count in state_counts.items() if k==key} for key in ('armor_damagemitigation','armor_temperaturemin','armor_temperaturemax')},'source_files':files}
    (cdir/'summary.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2),encoding='utf-8')
    return summary,item_rows,blueprint_rows

def main():
    ap=argparse.ArgumentParser(); ap.add_argument('root',nargs='?',default='.'); ap.add_argument('--out',default='vector-item-audit-v3-armor'); args=ap.parse_args()
    root=Path(args.root); out=Path(args.out); latest=root/'latest.json'
    if not latest.exists(): print(f'ERROR: {latest} fehlt',file=sys.stderr); return 2
    meta=load(latest); summaries={}; data={}
    for channel,cmeta in meta.get('channels',{}).items(): summaries[channel],items,bps=channel_audit(root,channel,cmeta,out); data[channel]=(items,bps)
    if 'live' in data and 'ptu' in data:
        li={r['entity_class']:r for r in data['live'][0]}; pi={r['entity_class']:r for r in data['ptu'][0]}; delta=[]
        for eid in sorted(set(li)|set(pi)):
            if eid not in li: delta.append({'entity_class':eid,'change':'ADDED_PTU','live_name':'','ptu_name':pi[eid]['name']})
            elif eid not in pi: delta.append({'entity_class':eid,'change':'REMOVED_PTU','live_name':li[eid]['name'],'ptu_name':''})
            elif li[eid]['name']!=pi[eid]['name'] or li[eid]['baseline_keys']!=pi[eid]['baseline_keys']: delta.append({'entity_class':eid,'change':'CHANGED','live_name':li[eid]['name'],'ptu_name':pi[eid]['name']})
        dump_csv(out/'live_ptu_item_deltas.csv',delta)
    (out/'summary.json').write_text(json.dumps(summaries,ensure_ascii=False,indent=2),encoding='utf-8'); print(json.dumps(summaries,ensure_ascii=False,indent=2)); return 0
if __name__=='__main__': raise SystemExit(main())
