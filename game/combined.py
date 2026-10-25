"""Independent beginner rules on the original full board; no upstream rules source required."""
from collections import Counter
from copy import deepcopy
import json
from pathlib import Path
import random
from .engine import RuleError

ENGINE = 'atlas-combined-v1'
BOARD = json.loads((Path(__file__).resolve().parents[1] / 'upstream/api/board').read_text())
CITIES = {c['id']: c for c in BOARD['cities']}
REGIONS = {r['id']: r for r in BOARD['regions']}
NAMES = {'COAL':'Coal mine','IRON':'Iron works','PROV':'Brewery','COTTON':'Cotton mill','MFG':'Manufacturing','LUX':'Pottery'}

def new_game(options=None, seed=None):
    options = options or {}
    homes = ['LANCS', 'MIDYORK', 'NEENG', 'LAKES']
    players = [dict(id=i, name=['You','Campbell','Hawthorne','Kessler'][i], money=30, income=5, vp=0,
        home=homes[i], avatar=options.get('avatar','uk') if i==0 else ['uk','eu','us','in'][i],
        supply={ind:[t['level'] for t in ts for _ in range(t['copies'])] for ind,ts in BOARD['tiles'].items()}) for i in range(4)]
    return dict(engine=ENGINE, currency='USD', ver=1, era='BOTH', round=1, players=players, placed=[], builtLinks=[], over=False,
        log=[], hints=bool(options.get('hints',True)), vpBreak={str(i):{'tiles':0,'links':0} for i in range(4)}, aiStep=seed or 0)

def reach(s,pid):
    return {c['id'] for c in BOARD['cities'] if c['region']==s['players'][pid]['home']} | {t['city'] for t in s['placed'] if t['owner']==pid} | {c for l in s['builtLinks'] if l['owner']==pid for c in (l['a'],l['b'])}

def actions(s,pid=0):
    if s['over']: return []
    p=s['players'][pid]; out=[]; occupied={(t['city'],t['slot']) for t in s['placed']}
    # Any city is eligible. Cards are retained as visual industry guides, not a second cost.
    for c in BOARD['cities']:
        for slot,inds in enumerate(c['slots']):
            if (c['id'],slot) in occupied: continue
            for ind in inds:
                levels=p['supply'][ind]
                if not levels: continue
                lv=min(levels); t=next(t for t in BOARD['tiles'][ind] if t['level']==lv)
                if t['cost']<=p['money']:
                    out.append(dict(kind='BUILD',city=c['id'],slot=slot,industry=ind,level=lv,cost=t['cost'],base=t['cost'],vp=t['vp'],income=2))
    built={tuple(sorted((l['a'],l['b']))) for l in s['builtLinks']}; network=reach(s,pid)
    if p['money']>=5:
        for l in BOARD['links']:
            if tuple(sorted((l['a'],l['b']))) not in built and {l['a'],l['b']} & network:
                out.append(dict(kind='NETWORK',link=[l['a'],l['b']],cost=5,vp=3,income=0))
    return [dict(a,i=i) for i,a in enumerate(out)]

def execute(s,pid,a):
    p=s['players'][pid]; p['money']-=a['cost']; p['vp']+=a['vp']
    if a['kind']=='BUILD':
        p['supply'][a['industry']].remove(a['level']); p['income']+=2
        s['placed'].append(dict(id=f"tile-{len(s['placed'])}",city=a['city'],slot=a['slot'],industry=a['industry'],level=a['level'],owner=pid,flipped=True,res=0))
        category='tiles'; text=f"Built {NAMES[a['industry']]} in {CITIES[a['city']]['en']}: +{a['vp']} VP, income +US$2."
    else:
        s['builtLinks'].append(dict(a=a['link'][0],b=a['link'][1],owner=pid)); category='links'
        text=f"Connected {CITIES[a['link'][0]]['en']} to {CITIES[a['link'][1]]['en']}: +3 VP."
    s['vpBreak'][str(pid)][category]+=a['vp']
    s['log'].append(dict(who=p['name'],text=text,era='BOTH',round=s['round']))

def public_state(s):
    ps=[]
    for p in s['players']:
        ps.append(dict(p,isMe=p['id']==0,homeZh={'LANCS':'Lancashire','MIDYORK':'Midlands & Yorkshire','NEENG':'New England','LAKES':'Great Lakes'}[p['home']],levelZh='' if p['id']==0 else 'Beginner AI',hand=0,
            supply={ind:dict(Counter(map(str,ls))) for ind,ls in p['supply'].items()},tiles=sum(t['owner']==p['id'] for t in s['placed']),links=sum(l['owner']==p['id'] for l in s['builtLinks'])))
    return dict(started=True,currency='USD',engine=ENGINE,mode='combined',mapId='world-combined-v1',era='BOTH',eraZh='Combined Era',round=s['round'],deck=0,
        ver=s['ver'],over=s['over'],players=ps,active=0,turnOrder=[0,1,2,3],actionsLeft=0 if s['over'] else 1,actionsTotal=1,
        hand=[dict(kind='INDUSTRY',v=ind,label=name) for ind,name in NAMES.items()],placed=deepcopy(s['placed']),builtLinks=deepcopy(s['builtLinks']),
        reach=sorted(reach(s,0)),hubs=[],markets={},zoneGroup={},myZones=[],actions=actions(s),buildInfo={},passDiscard=[],linkedPairs=[],contested=[],
        log=[dict(entry,text=entry['text'].replace('£','US$')) for entry in s['log']],events=[],hints=s['hints'],vpBreak=deepcopy(s['vpBreak']),save=dict(engine=ENGINE,game=deepcopy(s)))

def handle(s,path,body):
    if path=='/api/settings': s['hints']=bool(body.get('hints')); return public_state(s)
    if s['over']: raise RuleError('The eight rounds are complete. Start a new game.')
    if type(body.get('v')) is not int or body['v']!=s['ver']: return dict(public_state(s),stale=True)
    work=deepcopy(s)
    if path=='/api/action':
        opts=actions(work); i=body.get('i')
        if type(i) is not int or not 0<=i<len(opts): raise RuleError('Choose an available action.')
        execute(work,0,opts[i])
    elif path=='/api/pass':
        work['log'].append(dict(who='You',text='Saved money for the next round.',era='BOTH',round=work['round']))
    else: raise RuleError('Unknown game endpoint.')
    rng=random.Random(work['aiStep']); work['aiStep']+=1
    for pid in range(1,4):
        opts=actions(work,pid)
        # Casual opponents sometimes save and pick affordable moves without lookahead.
        if opts and rng.random()<0.8: execute(work,pid,rng.choice(opts))
    for p in work['players']: p['money']+=p['income']
    work['log'].append(dict(who='system',text='Round income paid automatically to every player.',era='BOTH',round=work['round']))
    if work['round']==8:
        work['over']=True
        work['log'].append(dict(who='system',text='Final scoring: building VP + connection VP. Ties use income, then cash.',era='BOTH',round=8))
    else: work['round']+=1
    work['ver']+=1; s.clear(); s.update(work)
    return public_state(s)
