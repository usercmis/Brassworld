"""Independent world-map Eco engine. Uses public board/tile configuration.

Not the upstream server's source or AI. Classic games still use that server.
Every human and AI move uses the same authoritative planner and executor.
"""
from collections import Counter, deque
from copy import deepcopy
from itertools import combinations, combinations_with_replacement
import json
from pathlib import Path
import random
from uuid import uuid4

ROOT = Path(__file__).resolve().parents[1]
BOARD = json.loads((ROOT / 'upstream/api/board').read_text(encoding='utf-8'))
SETUP = json.loads((ROOT / 'game/setup.json').read_text(encoding='utf-8'))
CITIES = {c['id']: c for c in BOARD['cities']}
REGIONS = {r['id']: r for r in BOARD['regions']}
TILES = {(ind, t['level']): t for ind, ts in BOARD['tiles'].items() for t in ts}
ZONES = ['BRITAIN', 'EUROPE', 'AMERICAS', 'ASIAPAC']
INCOMES = list(range(-10, 1)) + [v for v in range(1, 11) for _ in range(2)] + [v for v in range(11, 21) for _ in range(3)] + [v for v in range(21, 31) for _ in range(4)]
EMISSIONS = {'COTTON': 1, 'MFG': 2, 'LUX': 3}
KIND = {'BUILD': '建造', 'NETWORK': '连接', 'SELL': '销售', 'DEVELOP': '开发', 'LOAN': '贷款', 'SCOUT': '侦查', 'CLEAN_UP': 'Clean Up', 'ECO_UPGRADE': 'Eco Upgrade', 'PASS': 'Pass'}


class RuleError(ValueError):
    pass


def income(player):
    return INCOMES[player['incomePos']]


def raise_income(player, steps):
    player['incomePos'] = min(len(INCOMES)-1, player['incomePos'] + steps)


def fresh_deck(rng):
    deck = deepcopy(SETUP['cards'])
    rng.shuffle(deck)
    return deck


def new_game(options=None, seed=None):
    options = options or {}
    rng = random.Random(seed)
    homes = rng.sample(list(REGIONS), 4)
    # A consistent Nordic starting network makes the new mode easier to learn.
    if 'BALTIC' not in homes:
        homes[0] = 'BALTIC'
    else:
        i = homes.index('BALTIC'); homes[0], homes[i] = homes[i], homes[0]
    deck = fresh_deck(rng)
    players = []
    for pid in range(4):
        players.append({'id': pid, 'name': ['You', 'Campbell', 'Hawthorne', 'Kessler'][pid],
            'money': 25, 'incomePos': 10, 'vp': 0, 'home': homes[pid], 'spent': 0,
            'avatar': options.get('avatar', 'uk') if pid == 0 else ['uk','eu','us','in'][pid],
            'hand': [deck.pop() for _ in range(8)],
            'supply': {ind: [t['level'] for t in ts for _ in range(t['copies'])] for ind, ts in BOARD['tiles'].items()}})
    links = []
    for p in players:
        for link in BOARD['links']:
            if link['era'] != 'E2' and CITIES[link['a']]['region'] == p['home'] == CITIES[link['b']]['region']:
                if not any({l['a'], l['b']} == {link['a'], link['b']} for l in links):
                    links.append({'a': link['a'], 'b': link['b'], 'owner': p['id']})
    hubs = deepcopy(SETUP['hubs'])
    for h in hubs:
        h.update(active=True, prov=1, bonus=rng.choice(['money','income','vp','develop']), claimedBy=None)
    markets = {}
    starts = {'BRITAIN': (0,0), 'EUROPE': (2,2), 'AMERICAS': (5,4), 'ASIAPAC': (10,6)}
    for zone in ZONES:
        markets[zone] = {}
        for res, max_price, empty in [('coal',7,starts[zone][0]), ('iron',5,starts[zone][1])]:
            slots = [2]*max_price
            for i in range(empty): slots[i//2] -= 1
            markets[zone][res] = {'slots': slots, 'per': 2}
    return {'engine': 'atlas-eco-v1', 'ver': 1, 'era': 'E1', 'round': 1,
            'players': players, 'order': [0,1,2,3], 'turnIndex': 0, 'actionsLeft': 1,
            'deck': deck, 'discard': [], 'placed': [], 'builtLinks': links, 'hubs': hubs,
            'markets': markets, 'zoneGroup': {z:z for z in ZONES}, 'linkedPairs': [],
            'eco': {'enabled': True, 'pollution': {c:0 for c in CITIES}, 'green':[0]*4, 'finalized':False},
            'over': False, 'log': [], 'vpBreak': {str(i):{} for i in range(4)},
            'level': options.get('level','normal'), 'hints': bool(options.get('hints')), 'aiStep': 0}


def active(s):
    return s['order'][s['turnIndex']]


def reach(s, pid):
    return {t['city'] for t in s['placed'] if t['owner']==pid} | {c for l in s['builtLinks'] if l['owner']==pid for c in [l['a'],l['b']]}


def distances(s, city):
    adjacency = {}
    for l in s['builtLinks']:
        adjacency.setdefault(l['a'], []).append(l['b'])
        adjacency.setdefault(l['b'], []).append(l['a'])
    d = {city:0}; queue = deque([city])
    while queue:
        c = queue.popleft()
        for target in adjacency.get(c, []):
            if target not in d:
                d[target] = d[c]+1; queue.append(target)
    return d


def open_hub(s, hub):
    return any(hub['city'] in (l['a'],l['b']) for l in s['builtLinks'])


def linked_hubs(s, city):
    d = distances(s, city)
    return [h for h in s['hubs'] if h['active'] and open_hub(s,h) and h['city'] in d]


def market(s, city, res):
    z = s['zoneGroup'][CITIES[city]['zone']]
    return s['markets'][z][res], z


def buy_market(m, n):
    slots = list(m['slots']); money = 0
    for _ in range(n):
        i = next((i for i,v in enumerate(slots) if v>0), None)
        if i is None: money += len(slots)+1
        else: money += i+1; slots[i] -= 1
    return slots, money


def material_plan(s, city, coal=0, iron=0):
    result = {'coal':[], 'iron':[], 'mktCoal':0, 'mktIron':0, 'mktCash':0, '_market':[]}
    d = distances(s, city)
    for ind,n,key in [('COAL',coal,'coal'),('IRON',iron,'iron')]:
        candidates = [t for t in s['placed'] if t['industry']==ind and t['resources']>0 and (ind=='IRON' or t['city'] in d)]
        candidates.sort(key=lambda t: (d.get(t['city'],0) if ind=='COAL' else 0,t['id']))
        for t in candidates:
            take = min(n,t['resources'])
            if take:
                result[key].append({'id':t['id'],'city':t['city'],'slot':t['slot'],'owner':t['owner'],'n':take})
                n -= take
            if not n: break
        if n:
            if ind=='COAL' and not linked_hubs(s,city):
                raise RuleError('No coal: connect to a mine or an open trade port.')
            m,z = market(s,city,key)
            _, cost = buy_market(m,n)
            result['mkt'+key.title()] = n
            result['mktCash'] += cost
            result['_market'].append([z,key,n])
    return result


def beer_options(s, pid, city, hub=None):
    d=distances(s,city); out=[]
    if hub and hub['prov']:
        out.append({'key':'hub:'+hub['id'],'kind':'hub','id':hub['id'],'zh':hub['zh'],'city':hub['city'],'n':hub['prov'],'for':[0]})
    for t in sorted(s['placed'],key=lambda t:(t['owner']!=pid,t['id'])):
        if t['industry']=='PROV' and t['resources'] and (t['owner']==pid or t['city'] in d):
            out.append({'key':t['id'],'kind':'brewery','id':t['id'],'city':t['city'],'slot':t['slot'],'owner':t['owner'],'mine':t['owner']==pid,'n':t['resources'],'for':[0]})
    return out


def choose_beer(s, pid, city, n, hub=None, keys=None):
    opts=beer_options(s,pid,city,hub); bykey={o['key']:o for o in opts}
    if keys is not None and (not isinstance(keys,list) or len(keys)!=len(set(keys)) or any(k not in bykey for k in keys)):
        raise RuleError('Invalid beer selection')
    order=keys if keys is not None else [o['key'] for o in opts]
    used=[]; need=n
    for k in order:
        take=min(need,bykey[k]['n'])
        if take: used.append({**bykey[k],'n':take}); need-=take
    if need: raise RuleError('Not enough accessible beer')
    return used, {'need':n,'options':opts,'default':[o['key'] for o in used]}


def next_tile(p,ind):
    return TILES.get((ind,min(p['supply'][ind]))) if p['supply'][ind] else None


def allowed_cards(s,pid,city,ind):
    network=reach(s,pid); c=CITIES[city]
    return [i for i,(k,v) in enumerate(s['players'][pid]['hand']) if
            (k=='REGION' and v==c['region']) or (k=='WILD' and v=='REGION') or
            ((not network or city in network) and ((k=='INDUSTRY' and ind in v.split('+')) or (k=='WILD' and v=='INDUSTRY')))]


def pollution_fee(s,city):
    return 5 if s['eco']['pollution'][city]>=6 else 0


def build_plans(s,pid,with_info=False):
    p=s['players'][pid]; result=[]; info={}
    for ind in BOARD['tiles']:
        t=next_tile(p,ind)
        info[ind]={'left':len(p['supply'][ind]),'tile':deepcopy(t),'cities':[]}
        if not t: info[ind]['reason']='No industry tiles remain'; continue
        if t['era'] not in ('BOTH',s['era']): info[ind]['reason']='Develop the era-restricted tile first'; continue
        for cid,c in CITIES.items():
            own=[x for x in s['placed'] if x['city']==cid and x['owner']==pid]
            occupied={x['slot']:x for x in s['placed'] if x['city']==cid}
            free=[i for i,a in enumerate(c['slots']) if ind in a and i not in occupied]
            dedicated=[i for i in free if len(c['slots'][i])==1]
            if dedicated: free=dedicated
            if s['era']=='E1' and own: free=[]
            overwrites=[]
            for slot,old in occupied.items():
                if old['industry']!=ind or old['level']>=t['level']: continue
                permitted=old['owner']==pid
                if not permitted and ind in ('COAL','IRON'):
                    all_empty=not any(x['industry']==ind and x['resources'] for x in s['placed'])
                    markets_empty=not any(sum(m[ind.lower()]['slots']) for m in s['markets'].values())
                    permitted=all_empty and markets_empty
                if permitted: overwrites.append(slot)
            for slot in free+overwrites:
                try: materials=material_plan(s,cid,t['coal'],t['iron'])
                except RuleError as e:
                    info[ind]['cities'].append({'city':cid,'money':None,'why':str(e)}); continue
                fee=pollution_fee(s,cid); cost=t['cost']+materials['mktCash']+fee
                info[ind]['cities'].append({'city':cid,'money':cost,'pollutionFee':fee,'coalFrom':materials['coal'],'ironFrom':materials['iron'],'coalMkt':materials['mktCoal'],'ironMkt':materials['mktIron'],'coalCash':0,'ironCash':materials['mktCash'],'zone':c['zone']})
                cards=allowed_cards(s,pid,cid,ind)
                if not cards or cost>p['money']: continue
                a={'kind':'BUILD','city':cid,'slot':slot,'industry':ind,**{k:t[k] for k in ['level','vp','income','linkVp','produces']},
                   'base':t['cost'],'cost':cost,'pollutionFee':fee,'prov':[],**materials,
                   'discard':{'n':1,'allowed':cards,'default':[cards[0]]}}
                if slot in occupied:
                    old=occupied[slot];a['over']={**old,'mine':old['owner']==pid}
                result.append(a)
    return (result,info) if with_info else result


def network_plan(s,pid,link,second=None):
    p=s['players'][pid]; network=reach(s,pid)
    if not ({link['a'],link['b']} & network): raise RuleError('Extend your own network')
    far = link['b'] if link['a'] in network else link['a']
    if second and far not in (second['a'], second['b']):raise RuleError('Second link must extend the far end')
    w=deepcopy(s)
    plan={'kind':'NETWORK','link':[link['a'],link['b']],'second':None,'cost':0,'base':0,'coal':[],'iron':[],'prov':[],'mktCoal':0,'mktIron':0,'mktCash':0,'_market':[]}
    for step,l in enumerate([link]+([second] if second else [])):
        if l['era'] not in ('BOTH',s['era']): raise RuleError('Wrong era')
        if any({x['a'],x['b']}=={l['a'],l['b']} for x in w['builtLinks']): raise RuleError('Link occupied')
        if step and not ({l['a'],l['b']} & set(plan['link'])): raise RuleError('Second link must extend first')
        cost=BOARD['linkCost'][s['era']+('_sea' if l['sea'] else '_land')]
        w['builtLinks'].append({'a':l['a'],'b':l['b'],'owner':pid})
        # Resources may be delivered through the route currently being built.
        # Choose the far end as resource destination for both orientations.
        destination = far if not step else next(c for c in [l['a'], l['b']] if c != far)
        m=material_plan(w,destination,cost['coal'],0)
        consume_materials(w,m)
        used,b=choose_beer(w,pid,destination,cost['prov']+(1 if step else 0))
        consume_beer(w,used,pid)
        plan['base']+=cost['money']+(5 if step else 0)
        for key in ['coal','iron','_market']:plan[key].extend(m[key])
        for key in ['mktCoal','mktIron','mktCash']:plan[key]+=m[key]
        plan['prov'].extend(o for o in used if o['kind']!='hub')
        if step:plan['second']=[l['a'],l['b']]
    plan['cost']=plan['base']+plan['mktCash']
    if plan['cost']>p['money']:raise RuleError('Not enough cash')
    return plan


def sale_plan(s,pid,tile_ids,hub_id,beer=None):
    if not tile_ids or len(tile_ids)!=len(set(tile_ids)): raise RuleError('Choose unique factories')
    hub=next((h for h in s['hubs'] if h['id']==hub_id and open_hub(s,h)),None)
    if not hub:raise RuleError('Trade port is not open')
    w=deepcopy(s); sells=[]; previews=[]; need=0
    for tid in tile_ids:
        tile=next((t for t in w['placed'] if t['id']==tid),None)
        if not tile or tile['owner']!=pid or tile['flipped'] or tile['industry'] not in EMISSIONS:raise RuleError('Invalid sales industry')
        if tile['industry'] not in hub['accepts'] or hub['city'] not in distances(w,tile['city']):raise RuleError('Factory cannot reach a matching trade port')
        need+=TILES[tile['industry'],tile['level']]['sellProv']
        before=w['eco']['pollution'][tile['city']]
        emission=max(0,EMISSIONS[tile['industry']]-(2 if tile.get('ecoUpgraded') else 0))
        after=min(10,before+emission);w['eco']['pollution'][tile['city']]=after
        previews.append({'city':tile['city'],'before':before,'after':after,'emissions':emission,'green':2 if tile.get('ecoUpgraded') else 0})
        sells.append({**deepcopy(tile), 'prov':TILES[tile['industry'],tile['level']]['sellProv']})
    # For multiple factories, each beer source must be eligible for at least one
    # target; allocation below validates each target sequentially, preventing reuse.
    allused=[]; options={}; defaults=[]
    for index,t in enumerate(sells):
        h=next(h for h in w['hubs'] if h['id']==hub_id)
        n=TILES[t['industry'],t['level']]['sellProv']
        opts=beer_options(w,pid,t['city'],h)
        for o in opts:
            if o['key'] not in options:options[o['key']]={**o,'for':[index]}
            else:options[o['key']]['for'].append(index)
        keys=[k for k in beer if k in {o['key'] for o in opts}] if beer is not None else None
        used,_=choose_beer(w,pid,t['city'],n,h,keys)
        consume_beer(w,used,pid,bonuses=False)
        allused.extend(used)
        defaults.extend(o['key'] for o in used if o['key'] not in defaults)
    first=sells[0]
    public_hub={**deepcopy(hub),'bonusType':hub['bonus']}
    if not any(o['kind']=='hub' for o in allused):public_hub['bonus']=None
    dev_options=[{'industry':ind,'level':t['level']} for ind in BOARD['tiles'] if (t:=next_tile(s['players'][pid],ind)) and not t['noDev']]
    return {'kind':'SELL','city':first['city'],'slot':first['slot'],'industry':first['industry'],'level':first['level'],
            'tileIds':tile_ids,'sells':sells,'hub':public_hub,'cost':0,'vp':sum(t['vp'] for t in sells),
            'income':sum(TILES[t['industry'],t['level']]['income'] for t in sells),
            'hubProv':sum(o['n'] for o in allused if o['kind']=='hub'),
            'prov':[o for o in allused if o['kind']!='hub'],'_beerUsed':allused,
            'beer':{'need':need,'needs':[TILES[t['industry'],t['level']]['sellProv'] for t in sells], 'options':list(options.values()),'default':defaults},
            'ecoPreview':previews,'greenGain':sum(x['green'] for x in previews),
            'devBonus':{'hubs':[hub_id],'options':dev_options,'default':''} if hub['bonus']=='develop' else None}


def develop_plan(s,pid,inds):
    p=deepcopy(s['players'][pid]);dev=[]
    for ind in inds:
        t=next_tile(p,ind)
        if not t or t['noDev']:raise RuleError('Tile cannot be developed')
        dev.append({'industry':ind,'level':t['level']});p['supply'][ind].remove(t['level'])
    m=material_plan(s,next(iter(reach(s,pid)),next(c for c in CITIES if CITIES[c]['region']==p['home'])),0,len(dev))
    if m['mktCash']>p['money']:raise RuleError('Not enough cash')
    return {'kind':'DEVELOP','dev':dev,'industry':dev[0]['industry'],'level':dev[0]['level'],'cost':m['mktCash'],'prov':[],**m}


def actions(s,pid=None,include_info=False):
    pid=active(s) if pid is None else pid;p=s['players'][pid]
    if s['over'] or not p['hand']:return ([],{}) if include_info else []
    builds,info=build_plans(s,pid,True); out=builds
    built={tuple(sorted((l['a'],l['b']))) for l in s['builtLinks']}
    candidates=[l for l in BOARD['links'] if l['era'] in ('BOTH',s['era']) and tuple(sorted((l['a'],l['b']))) not in built]
    for l in candidates:
        try: out.append(network_plan(s,pid,l))
        except RuleError: pass
        if s['era']=='E2' and p['money']>=15 and {l['a'],l['b']} & reach(s,pid):
            for other in candidates:
                if l is other or not ({l['a'],l['b']} & {other['a'],other['b']}):continue
                try: out.append(network_plan(s,pid,l,other))
                except RuleError:pass
    sales=[t for t in s['placed'] if t['owner']==pid and not t['flipped'] and t['industry'] in EMISSIONS]
    for h in s['hubs']:
        eligible=[t for t in sales if t['industry'] in h['accepts'] and h['city'] in distances(s,t['city']) and open_hub(s,h)]
        # Individual and pair plans are convenient shortcuts. The UI's Sell
        # selection accepts any larger subset via the same sale_plan validator.
        groups=[list(x) for n in (1,2) for x in combinations(eligible,n)]
        if len(eligible)>2:groups.append(eligible)
        for group in groups:
            try:out.append(sale_plan(s,pid,[t['id'] for t in group],h['id']))
            except RuleError:pass
    for n in (1,2):
        for inds in combinations_with_replacement(BOARD['tiles'],n):
            try:out.append(develop_plan(s,pid,inds))
            except RuleError:pass
    if income(p)>=-7:out.append({'kind':'LOAN','cost':0})
    if len(p['hand'])>=3 and not any(c[0]=='WILD' for c in p['hand']):out.append({'kind':'SCOUT','cost':0})
    for cid in sorted({t['city'] for t in s['placed'] if t['owner']==pid}):
        pollution=s['eco']['pollution'][cid]
        if pollution and p['money']>=5:out.append({'kind':'CLEAN_UP','city':cid,'cost':5,'pollutionBefore':pollution,'pollutionAfter':max(0,pollution-3)})
    for t in sales:
        if not t.get('ecoUpgraded') and p['money']>=8:
            out.append({'kind':'ECO_UPGRADE','city':t['city'],'slot':t['slot'],'tileId':t['id'],'industry':t['industry'],'level':t['level'],'cost':8,'emissionsAfter':max(0,EMISSIONS[t['industry']]-2)})
    for i,a in enumerate(out):
        a['i']=i;a['kindZh']=KIND[a['kind']]
        if 'discard' not in a:
            n=3 if a['kind']=='SCOUT' else 1
            a['discard']={'n':n,'allowed':list(range(len(p['hand']))),'default':list(range(n))}
        a.setdefault('text',a['kindZh'])
    if out and s['hints']:out[max(range(len(out)),key=lambda i:ai_value(s,pid,out[i],out))]['best']=True
    return (out,info) if include_info else out


def flip(s,t):
    if not t['flipped']:
        t['flipped']=True;raise_income(s['players'][t['owner']],TILES[t['industry'],t['level']]['income'])


def consume_materials(s,plan):
    for res in ['coal','iron']:
        for src in plan[res]:
            tile=next(t for t in s['placed'] if t['id']==src['id'])
            if tile['resources']<src['n']:raise RuleError('Resource no longer available')
            tile['resources']-=src['n']
            if tile['resources']==0:flip(s,tile)
    for z,res,n in plan['_market']:
        m=s['markets'][z][res];m['slots'],_=buy_market(m,n)


def consume_beer(s,used,pid,bonuses=True,dev_bonus=None):
    for src in used:
        if src['kind']=='hub':
            hub=next(h for h in s['hubs'] if h['id']==src['id'])
            if hub['prov']<src['n']:raise RuleError('Port beer no longer available')
            hub['prov']-=src['n']
            if bonuses:
                hub['claimedBy']=pid;p=s['players'][pid]
                if hub['bonus']=='money':p['money']+=5
                elif hub['bonus']=='income':raise_income(p,2)
                elif hub['bonus']=='vp':award(s,pid,'hub',3)
                elif hub['bonus']=='develop' and dev_bonus:
                    ind=dev_bonus[0];t=next_tile(p,ind)
                    if t and not t['noDev']:p['supply'][ind].remove(t['level'])
        else:
            tile=next(t for t in s['placed'] if t['id']==src['id'])
            if tile['resources']<src['n']:raise RuleError('Beer no longer available')
            tile['resources']-=src['n']
            if not tile['resources']:flip(s,tile)


def award(s,pid,kind,n):
    s['players'][pid]['vp']+=n
    bk=s['vpBreak'][str(pid)];bk[kind]=bk.get(kind,0)+n


def merge_markets(s):
    if s['era']!='E2':return
    for l in s['builtLinks']:
        a=s['zoneGroup'][CITIES[l['a']]['zone']];b=s['zoneGroup'][CITIES[l['b']]['zone']]
        if a==b:continue
        for res in ['coal','iron']:
            left=s['markets'][a][res];right=s['markets'][b][res]
            left['slots']=[x+y for x,y in zip(left['slots'],right['slots'])];left['per']+=right['per']
        del s['markets'][b]
        for z,g in s['zoneGroup'].items():
            if g==b:s['zoneGroup'][z]=a


def industry_market_sale(s,t):
    ind=t['industry']
    if ind not in ('COAL','IRON') or (ind=='COAL' and not linked_hubs(s,t['city'])):return
    m,_=market(s,t['city'],ind.lower());money=0
    while t['resources']:
        i=next((i for i in reversed(range(len(m['slots']))) if m['slots'][i]<m['per']),None)
        if i is None:break
        m['slots'][i]+=1;t['resources']-=1;money+=i+1
    s['players'][t['owner']]['money']+=money
    if t['resources']==0:flip(s,t)


def score_era(s):
    for t in s['placed']:
        if t['flipped']:award(s,t['owner'],'tiles',t['vp'])
    for l in s['builtLinks']:
        n=sum(t['linkVp'] for t in s['placed'] if t['flipped'] and t['city'] in (l['a'],l['b']))
        n+=2*sum(h['active'] and h['city'] in (l['a'],l['b']) for h in s['hubs'])
        award(s,l['owner'],'links',n)
    for cid in CITIES:
        owners={t['owner'] for t in s['placed'] if t['city']==cid}
        if len(owners)>1:
            for pid in owners:award(s,pid,'contested',2)


def log(s,pid,text,at=None):
    s['log'].append({'who':s['players'][pid]['name'] if pid is not None else 'System','text':text,'why':'','era':s['era'],'round':s['round'],'at':at or []})


def refill(s,p):
    while s['deck'] and len(p['hand'])<8:p['hand'].append(s['deck'].pop())


def settle_income(s):
    for p in s['players']:
        p['money']+=income(p)
        while p['money']<0:
            owned=[t for t in s['placed'] if t['owner']==p['id']]
            if not owned:break
            t=min(owned,key=lambda t:(t['flipped'],t['vp'],t['id']))
            p['money']+=TILES[t['industry'],t['level']]['cost']//2
            s['placed'].remove(t);log(s,p['id'],'Industry liquidated to cover negative income.',[t['city']])
        if p['money']<0:award(s,p['id'],'debt',p['money']);p['money']=0


def advance(s):
    p=s['players'][active(s)]
    if s['actionsLeft']>0 and p['hand']:return
    refill(s,p)
    for _ in range(4):
        s['turnIndex']+=1
        if s['turnIndex']>=4:
            s['turnIndex']=0
            ended=not s['deck'] and not any(p['hand'] for p in s['players'])
            if not (ended and s['era']=='E2'):settle_income(s)
            s['order'].sort(key=lambda pid:s['players'][pid]['spent'])
            for p in s['players']:p['spent']=0
            if ended:
                score_era(s)
                if s['era']=='E2':
                    s['over']=True
                    if not s['eco']['finalized']:
                        for pid,n in enumerate(s['eco']['green']):award(s,pid,'green',n)
                        s['eco']['finalized']=True
                    log(s,None,'Game over. Green points added to final VP once.');s['actionsLeft']=0;return
                s['era']='E2';s['round']=1
                s['placed']=[t for t in s['placed'] if t['level']>1];s['builtLinks']=[]
                # Pollution, upgrades of surviving tiles and green points persist.
                s['deck']=fresh_deck(random.Random(s['ver']));s['discard']=[]
                for p in s['players']:refill(s,p)
                for h in s['hubs']:h['prov']=1;h['claimedBy']=None
                log(s,None,'Steam Era. Sail links and level I factories removed; pollution persists.')
            else:s['round']+=1
        pid=active(s)
        s['actionsLeft']=min(1 if s['era']=='E1' and s['round']==1 else 2,len(s['players'][pid]['hand']))
        if s['actionsLeft']:return


def execute(s,pid,a,discard=None,beer=None,dev_bonus=None):
    """Only accepts a server-generated plan; HTTP regenerates it under a lock."""
    if s['over'] or active(s)!=pid or s['actionsLeft']<1:raise RuleError('Not your turn')
    p=s['players'][pid];spec=a['discard'];discard=spec['default'] if discard is None else discard
    if not isinstance(discard,list) or any(type(i) is not int for i in discard) or len(discard)!=spec['n'] or len(set(discard))!=len(discard) or any(i not in spec['allowed'] for i in discard):raise RuleError('Choose valid discard cards')
    if a.get('cost',0)>p['money']:raise RuleError('Not enough money')
    kind=a['kind']
    if kind=='SELL':a={**sale_plan(s,pid,a['tileIds'],a['hub']['id'],beer),'discard':spec}
    p['money']-=a.get('cost',0);p['spent']+=a.get('cost',0)
    if kind=='BUILD':
        consume_materials(s,a)
        if a.get('over'):s['placed']=[t for t in s['placed'] if not(t['city']==a['city'] and t['slot']==a['slot'])]
        tile={'id':uuid4().hex,'city':a['city'],'slot':a['slot'],'owner':pid,'industry':a['industry'],'level':a['level'],'flipped':False,'resources':a['produces'],'vp':a['vp'],'linkVp':a['linkVp'],'ecoUpgraded':False,'greenClaimed':False}
        if tile['industry']=='PROV':tile['resources']=1 if s['era']=='E1' else 2
        s['placed'].append(tile);p['supply'][tile['industry']].remove(tile['level']);industry_market_sale(s,tile)
    elif kind=='NETWORK':
        consume_materials(s,a);consume_beer(s,a['prov'],pid)
        for link in [a['link'],a.get('second')]:
            if link:s['builtLinks'].append({'a':link[0],'b':link[1],'owner':pid})
        merge_markets(s)
    elif kind=='SELL':
        consume_beer(s,a['_beerUsed'],pid,dev_bonus=dev_bonus)
        for tid,preview in zip(a['tileIds'],a['ecoPreview']):
            t=next(t for t in s['placed'] if t['id']==tid);flip(s,t)
            s['eco']['pollution'][t['city']]=preview['after']
            if t.get('ecoUpgraded') and not t.get('greenClaimed'):
                s['eco']['green'][pid]+=2;t['greenClaimed']=True
    elif kind=='DEVELOP':
        consume_materials(s,a)
        for d in a['dev']:p['supply'][d['industry']].remove(d['level'])
    elif kind=='LOAN':
        target=income(p)-3;p['money']+=30
        p['incomePos']=max(i for i,n in enumerate(INCOMES) if n==target)
    elif kind=='SCOUT':pass
    elif kind=='CLEAN_UP':s['eco']['pollution'][a['city']]=a['pollutionAfter']
    elif kind=='ECO_UPGRADE':next(t for t in s['placed'] if t['id']==a['tileId'])['ecoUpgraded']=True
    elif kind!='PASS':raise RuleError('Unknown action')
    for i in sorted(discard,reverse=True):s['discard'].append(p['hand'].pop(i))
    if kind=='SCOUT':p['hand'].extend([['WILD','REGION'],['WILD','INDUSTRY']])
    label=KIND[kind]
    if a.get('city'):label+=' · '+CITIES[a['city']]['en']
    if a.get('industry'):label+=' · '+a['industry']
    if a.get('cost'):label+=f" · £{a['cost']}"
    if kind=='SELL':label+=' · '+', '.join(f"{CITIES[q['city']]['en']} pollution {q['before']}→{q['after']}" for q in a['ecoPreview'])+f" · Green +{a['greenGain']}"
    if kind=='CLEAN_UP':label+=f" · Pollution {a['pollutionBefore']}→{a['pollutionAfter']}"
    log(s,pid,label,[a['city']] if a.get('city') else a.get('link',[]))
    # First contact between personal networks rewards both players once.
    for other in range(4):
        pair=sorted([pid,other])
        if other!=pid and pair not in s['linkedPairs'] and reach(s,pid)&reach(s,other):
            s['linkedPairs'].append(pair)
            for who in pair:s['players'][who]['money']+=8;raise_income(s['players'][who],1)
    s['actionsLeft']-=1;s['ver']+=1;advance(s)


def ai_value(s,pid,a,available=()):
    p=s['players'][pid];kind=a['kind'];cost=a.get('cost',0)
    if kind=='SELL':return 25+a['income']*2+a['vp']+a['greenGain']*2-sum(x['emissions'] for x in a['ecoPreview'])
    if kind=='LOAN':return 45 if p['money']<12 else -15
    if kind=='CLEAN_UP':return 19 if a['pollutionBefore']>=6 and p['money']>=20 else -8
    if kind=='ECO_UPGRADE':
        can_sell=any(x['kind']=='SELL' and a['tileId'] in x['tileIds'] for x in available)
        return 44 if can_sell and p['money']>=20 and s['actionsLeft']>=2 else -5
    if kind=='BUILD':
        ind=a['industry'];connected=bool(linked_hubs(s,a['city']))
        return 8+a['income']+a['vp']*.5-cost*.45+(8 if ind in EMISSIONS and connected else 0)+(7 if ind=='PROV' and not any(t['owner']==pid and t['industry']=='PROV' and t['resources'] for t in s['placed']) else 0)-a['pollutionFee']*.5
    if kind=='NETWORK':return 8-cost*.35+sum(7 for h in s['hubs'] if h['city'] in a['link'] and not open_hub(s,h))
    if kind=='DEVELOP':return 1-cost
    if kind=='SCOUT':return -3
    return -100


def run_ai(s):
    n=0
    while not s['over'] and active(s)!=0:
        pid=active(s);opts=actions(s)
        if opts:
            rng=random.Random(s['aiStep']);a=max(opts,key=lambda a:ai_value(s,pid,a,opts)+rng.random()*(3 if s['level']=='easy' else .2))
        else:a={'kind':'PASS','cost':0,'discard':{'n':1,'allowed':list(range(len(s['players'][pid]['hand']))),'default':[0]}}
        execute(s,pid,a);s['aiStep']+=1;n+=1
        if n>1024:raise RuleError('AI turn limit reached')


def card_json(card):
    kind,v=card
    label=REGIONS[v]['zh'] if kind=='REGION' else ('万用区域牌' if v=='REGION' else '万用产业牌') if kind=='WILD' else '/'.join(BOARD['industryZh'][i] for i in v.split('+'))
    return {'kind':kind,'v':v,'label':label}


def public_state(s):
    acts,info=actions(s,0,True) if not s['over'] and active(s)==0 else ([],{})
    ps=[]
    for p in s['players']:
        ps.append({**{k:v for k,v in p.items() if k not in ['hand','supply']},'income':income(p),'isMe':p['id']==0,
                   'homeZh':REGIONS[p['home']]['zh'],'level':None if p['id']==0 else s['level'],
                   'levelZh':'' if p['id']==0 else 'Eco heuristic AI','hand':len(p['hand']),
                   'supply':{ind:dict(Counter(map(str,levels))) for ind,levels in p['supply'].items()},
                   'tiles':sum(t['owner']==p['id'] for t in s['placed']),'links':sum(l['owner']==p['id'] for l in s['builtLinks']),
                   'greenPoints':s['eco']['green'][p['id']]})
    markets={}
    for zone,m in s['markets'].items():
        markets[zone]={}
        for res,v in m.items():
            slots=v['slots'];maxp=len(slots)
            markets[zone][res]={'price':next((i+1 for i,n in enumerate(slots) if n),maxp+1),'count':sum(slots),'capacity':maxp*v['per'],'maxPrice':maxp,'outside':maxp+1,'ladder':[{'price':i+1,'n':n,'per':v['per']} for i,n in enumerate(slots)]}
    hubs=[{**h,'open':open_hub(s,h)} for h in s['hubs']]
    return {'started':True,'over':s['over'],'ver':s['ver'],'era':s['era'],'eraZh':'帆船时代' if s['era']=='E1' else '蒸汽时代',
            'round':s['round'],'deck':len(s['deck']),'mode':'eco','engine':'atlas-eco-v1','players':ps,
            'active':active(s),'turnOrder':s['order'],'actionsLeft':s['actionsLeft'],'actionsTotal':1 if s['era']=='E1' and s['round']==1 else 2,
            'hand':[card_json(c) for c in s['players'][0]['hand']], 'placed':deepcopy(s['placed']),
            'builtLinks':deepcopy(s['builtLinks']),'reach':sorted(reach(s,0)),'hubs':hubs,
            'markets':markets,'zoneGroup':s['zoneGroup'],'myZones':sorted({CITIES[c]['zone'] for c in reach(s,0)}),
            'actions':acts,'buildInfo':info,'passDiscard':[0],'eco':deepcopy(s['eco']),
            'linkedPairs':s['linkedPairs'],'contested':[c for c in CITIES if len({t['owner'] for t in s['placed'] if t['city']==c})>1],
            'log':s['log'],'events':[],'hints':s['hints'],'vpBreak':s['vpBreak'],
            'save':{'engine':'atlas-eco-v1','game':deepcopy(s)}}


def handle(s,path,body):
    if path=='/api/settings':s['hints']=bool(body.get('hints'));return public_state(s)
    if s['over']:raise RuleError('Game is over')
    if type(body.get('v')) is not int or body['v']!=s['ver']:return {**public_state(s),'stale':True}
    work=deepcopy(s)
    if path=='/api/pass':a={'kind':'PASS','cost':0,'discard':{'n':1,'allowed':list(range(len(work['players'][0]['hand']))),'default':[0]}}
    elif path=='/api/action':
        if body.get('sellIds') is not None:
            ids=body['sellIds']
            if not isinstance(ids,list) or len(ids)>40 or any(not isinstance(t,str) for t in ids):raise RuleError('Invalid sales selection')
            a=sale_plan(work,0,ids,body.get('hubId'),body.get('beer'))
            a['discard']={'n':1,'allowed':list(range(len(work['players'][0]['hand']))),'default':[0]}
        else:
            opts=actions(work);i=body.get('i')
            if type(i) is not int or not 0<=i<len(opts):raise RuleError('Invalid action')
            a=opts[i]
    else:raise RuleError('Unknown endpoint')
    execute(work,0,a,body.get('discard'),body.get('beer'),body.get('devBonus'))
    run_ai(work)
    # Commit only if the entire human/AI transaction succeeded.
    s.clear();s.update(work)
    return public_state(s)
