#!/usr/bin/env python3
"""VECTOR V5 SCMDB path profiler and conservative resolver.
Requires beside this file:
- vector_item_data_audit_v4_universal.py
- VECTOR_V5_RESOLVER_DEFINITION.json
"""
import argparse, csv, importlib.util, json, re, sys
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent


def load_module(path):
    spec = importlib.util.spec_from_file_location('vector_v4', path)
    mod = importlib.util.module_from_spec(spec); spec.loader.exec_module(mod); return mod


def norm(v): return re.sub(r'[^a-z0-9]', '', str(v).lower())
def scalar(v): return isinstance(v, (int, float)) and not isinstance(v, bool)


def walk(value, path=''):
    if isinstance(value, dict):
        for k, v in value.items():
            p = f'{path}.{k}' if path else str(k)
            yield p, str(k), v
            yield from walk(v, p)
    elif isinstance(value, list):
        for i, v in enumerate(value): yield from walk(v, f'{path}[{i}]')


def parent(path): return path.rsplit('.', 1)[0] if '.' in path else ''

def metadata_text(item):
    return ' '.join(str(item.get(k) or '') for k in ('name','itemType','attachType','attachSubType','tags')).lower()


def entries(item):
    nums=[]; strings=[]
    for path,key,value in walk(item):
        if scalar(value): nums.append({'path':path,'key':key,'leaf':norm(key),'value':value,'parent':parent(path)})
        elif isinstance(value,str): strings.append((path,value.lower()))
    return nums,strings


def context_for(path, strings, item_text):
    parts=[item_text, path.lower()]
    p=parent(path)
    for sp,sv in strings:
        if sp.startswith(p) or p.startswith(parent(sp)): parts.append(sv)
    return ' '.join(parts)


def score_candidate(prop, family, e, context):
    leaves={norm(x) for x in family.get('candidateLeaves',{}).get(prop,[])}
    tokens={norm(x) for x in family.get('scope',{}).get('pathTokens',[])}
    leaf_score = 6 if e['leaf'] in leaves else 0
    token_hits=sum(1 for t in tokens if t and t in norm(e['path']+' '+context))
    return leaf_score + min(token_hits,4), leaf_score, token_hits


def scoped(item, family):
    scope=family.get('scope',{}); text=metadata_text(item)
    types={norm(x) for x in scope.get('itemType',[])}
    attaches={norm(x) for x in scope.get('attachType',[])}
    if types and norm(item.get('itemType')) not in types: return False
    if attaches and not any(a in norm(item.get('attachType')) or a in norm(item.get('attachSubType')) or a in norm(item.get('name')) for a in attaches): return False
    return True


def profile_property(item, family, prop):
    nums,strings=entries(item); text=metadata_text(item); rows=[]
    if not scoped(item,family): return rows, None, 'SOURCE_DATA_MISSING'
    for e in nums:
        ctx=context_for(e['path'],strings,text); score,leaf_score,hits=score_candidate(prop,family,e,ctx)
        if leaf_score == 0: continue
        decision='ACCEPTED' if score >= 7 else 'REJECTED_SCOPE'
        reason=f'leaf={e["key"]}; scopeTokenHits={hits}; score={score}'
        rows.append({**e,'scope_score':score,'reason':reason,'decision':decision})
    accepted=[r for r in rows if r['decision']=='ACCEPTED']
    if not accepted: return rows,None,'SOURCE_DATA_MISSING'
    best=max(r['scope_score'] for r in accepted); top=[r for r in accepted if r['scope_score']==best]
    unique={(r['path'],json.dumps(r['value'])) for r in top}
    if len(unique)==1: return rows,top[0],'RESOLVED'
    for r in top: r['decision']='AMBIGUOUS'
    return rows,top[0],'REVIEW_REQUIRED'


def enforce_family_rules(item, family, results):
    fid=family['id']
    if fid in ('ARMOR_ENVIRONMENT','RADAR_AIM_ASSIST'):
        for pair in family.get('pairRules',[]):
            a,b=pair; ra=results.get(a); rb=results.get(b)
            if ra and rb and ra[0] and rb[0] and ra[0]['parent'] != rb[0]['parent']:
                results[a]=(ra[0],ra[1],'REVIEW_REQUIRED'); results[b]=(rb[0],rb[1],'REVIEW_REQUIRED')
    if fid=='SHIP_RESOURCE_COOLANT':
        for prop,(best,rows,status) in list(results.items()):
            if best and not any(x in (best['path']+' '+best['reason']).lower() for x in ('coolant','cooling')):
                results[prop]=(best,rows,'REVIEW_REQUIRED')
    return results


def build_enhancer(v4, config, profiler_sink):
    original=v4.item_baselines
    families=config['resolverFamilies']
    target_props={p for f in families for p in f['properties']}

    def enhanced(item,pools):
        values,provenance,states=original(item,pools)
        per_family=[]
        for family in families:
            temp={}
            for prop in family['properties']:
                rows,best,status=profile_property(item,family,prop)
                temp[prop]=(best,rows,status)
            temp=enforce_family_rules(item,family,temp)
            per_family.append((family,temp))
        for family,temp in per_family:
            for prop,(best,rows,status) in temp.items():
                if prop in values: continue
                for r in rows:
                    profiler_sink.append({'resolver_family':family['id'],'property_key':prop,'entity_class':item.get('entityClass'),'product_name':item.get('name'),'item_type':item.get('itemType'),'attach_type':item.get('attachType'),'attach_subtype':item.get('attachSubType'),'candidate_path':r['path'],'candidate_value':r['value'],'parent_path':r['parent'],'scope_score':r['scope_score'],'reason':r['reason'],'decision':r['decision']})
                if best is not None:
                    values[prop]=best['value']; provenance[prop]=best['path']; states[prop]=status
                elif prop in target_props:
                    provenance[prop]='V5 profiler: no accepted candidate'; states[prop]='SOURCE_DATA_MISSING'
        return values,provenance,states
    return enhanced


def write_profiler(out, channel, rows):
    cdir=out/channel; cdir.mkdir(parents=True,exist_ok=True)
    fields=['resolver_family','property_key','entity_class','product_name','item_type','attach_type','attach_subtype','candidate_path','candidate_value','parent_path','scope_score','reason','decision']
    with (cdir/'path_candidates.csv').open('w',newline='',encoding='utf-8-sig') as f:
        w=csv.DictWriter(f,fieldnames=fields); w.writeheader(); w.writerows(rows)
    freq=Counter((r['property_key'],r['candidate_path'],r['decision']) for r in rows)
    with (cdir/'path_frequency.csv').open('w',newline='',encoding='utf-8-sig') as f:
        w=csv.writer(f); w.writerow(['property_key','candidate_path','decision','count'])
        for (p,path,d),count in sorted(freq.items(),key=lambda x:(x[0][0],-x[1],x[0][1])): w.writerow([p,path,d,count])
    props=list(csv.DictReader((cdir/'properties.csv').open(encoding='utf-8-sig')))
    with (cdir/'resolver_coverage.csv').open('w',newline='',encoding='utf-8-sig') as f:
        fields2=['property_key','modifier_usage_count','resolved_count','missing_count','coverage_percent']
        w=csv.DictWriter(f,fieldnames=fields2); w.writeheader()
        for r in props:
            used=int(r.get('modifier_usage_count') or 0); resolved=int(r.get('resolved_count') or 0)
            w.writerow({'property_key':r['property_key'],'modifier_usage_count':used,'resolved_count':resolved,'missing_count':int(r.get('missing_count') or 0),'coverage_percent':round(resolved/used*100,2) if used else 0})


def main():
    ap=argparse.ArgumentParser(); ap.add_argument('root',nargs='?',default='data/scmdb'); ap.add_argument('--out',default='vector-item-audit-v5'); ap.add_argument('--config',default='VECTOR_V5_RESOLVER_DEFINITION.json'); args=ap.parse_args()
    root=Path(args.root); out=Path(args.out); config=json.loads(Path(args.config).read_text(encoding='utf-8-sig'))
    v4=load_module(ROOT/'vector_item_data_audit_v4_universal.py'); latest=v4.load(root/'latest.json')
    summaries={}; channel_data={}
    base_item_baselines=v4.item_baselines
    for channel,cmeta in latest.get('channels',{}).items():
        sink=[]
        v4.item_baselines=base_item_baselines
        v4.item_baselines=build_enhancer(v4,config,sink)
        summary,items,bps=v4.channel_audit(root,channel,cmeta,out)
        summary['resolverVersion']='5-scmdb-path-profiler'; summary['profiler_candidates']=len(sink)
        (out/channel/'summary.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2),encoding='utf-8')
        write_profiler(out,channel,sink); summaries[channel]=summary; channel_data[channel]=(items,bps)
    (out/'summary.json').write_text(json.dumps(summaries,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps(summaries,ensure_ascii=False,indent=2)); return 0

if __name__=='__main__': raise SystemExit(main())
