"""Eight-round local EcoBrass rules using the existing Atlas view contract."""
from copy import deepcopy
from pathlib import Path
import json
import random

ROOT = Path(__file__).resolve().parents[1]
BOARD = json.loads((ROOT / 'upstream/api/board').read_text(encoding='utf-8'))
GEO = json.loads((ROOT / 'dist/theme/geography.json').read_text(encoding='utf-8'))
ENGINE = 'ecobrass-hackathon-v1'
ZONES = ['BRITAIN', 'EUROPE', 'AMERICAS', 'ASIAPAC']
NAMES = {'COAL':'Coal mine','IRON':'Ironworks','PROV':'Brewery','MFG':'Factory','COTTON':'Cotton mill','LUX':'Pottery'}
# Cash, coal, iron, construction pollution. Keep historical art/slots intact.
SPECS = {'COAL':(8,0,0,3),'IRON':(10,1,0,3),'PROV':(10,0,1,1),
         'MFG':(12,1,1,2),'COTTON':(10,1,0,2),'LUX':(12,0,1,2)}
for c in BOARD['cities']:
    c['zh'] = c['en'];c['regionZh'] = GEO.get(c['regionZh'],c['region'])
for r in BOARD['regions']:r['zh'] = GEO.get(r['zh'], r.get('en',r['id']))
BOARD['industryZh'] = NAMES
for link in BOARD['links']:link['era']='BOTH'
for ind in SPECS:
    cost,coal,iron,_ = SPECS[ind]
    BOARD['tiles'][ind] = [dict(level=n,cost=cost,coal=coal,iron=iron,vp=3*n,income=n,
        linkVp=1,produces=2*n if ind in ('COAL','IRON') else 0,sellProv=0,noDev=False,era='BOTH',copies=12) for n in range(1,4)]
for era in ('E1','E2'):
    for surface in ('sea','land'):BOARD['linkCost'][era+'_'+surface] = dict(money=5,coal=1,prov=0)
CITIES = {c['id']:c for c in BOARD['cities']}
REGIONS = {r['id']:r for r in BOARD['regions']}

class RuleError(ValueError):pass

def reach(s,pid):
    return {c['id'] for c in CITIES.values() if c['region']==s['players'][pid]['home']} | {t['city'] for t in s['placed'] if t['owner']==pid} | {c for l in s['builtLinks'] if l['owner']==pid for c in (l['a'],l['b'])}

def log(s,pid,text,at=()):
    s['log'].append(dict(who=s['players'][pid]['name'] if pid is not None else 'System',text=text,why='',era='E1',round=s['round'],at=list(at)))

def new_game(options=None,seed=1848):
    options = options or {}
    options['avatar'] = options.get('avatar') if options.get('avatar') in ('uk','eu','us','la','cn','jp','in','sea','af','au') else 'uk'
    homes = ['LANCS','MIDYORK','NORTHBR','SOUTHBR']
    ps = [dict(id=i,name=['You','Campbell','Hawthorne','Kessler'][i],money=30,income=3,vp=0,
        coal=3,iron=3,pollution=0,greenPoints=0,home=homes[i],spent=0,
        avatar=options.get('avatar','uk') if i==0 else ['uk','eu','us','in'][i],
        supply={ind:{'1':12,'2':0,'3':0} for ind in SPECS}) for i in range(4)]
    s = dict(engine=ENGINE,mapId='ecobrass-world-80',ver=1,era='E1',round=1,players=ps,
        actionsLeft=2,active=0,order=[0,1,2,3],placed=[],builtLinks=[],over=False,
        eco=dict(enabled=True,pollution={c:0 for c in CITIES},green=[0]*4,finalized=False),
        log=[],vpBreak={str(i):{} for i in range(4)},hints=bool(options.get('hints',False)),
        seed=seed,nextId=1,aiStep=0,turnCounts=[0]*4)
    for p in ps:
        c = next(c for c in CITIES.values() if c['region']==p['home'] and any('MFG' in slot or 'COTTON' in slot for slot in c['slots']))
        slot = next(i for i,sl in enumerate(c['slots']) if 'MFG' in sl or 'COTTON' in sl)
        ind = 'MFG' if 'MFG' in c['slots'][slot] else 'COTTON'
        add_tile(s,p['id'],c['id'],slot,ind)
    log(s,None,'Eight rounds, two actions each turn. Connect your starter factory, then sell. Resources missing from stock are bought automatically for £2 each.')
    return s

def add_tile(s,pid,city,slot,ind):
    t=dict(id='tile-'+str(s['nextId']),city=city,slot=slot,industry=ind,owner=pid,level=1,
           flipped=False,resources=2 if ind in ('COAL','IRON') else 0,vp=3,linkVp=1,ecoUpgraded=False)
    s['nextId']+=1;s['placed'].append(t);s['players'][pid]['supply'][ind]['1']-=1
    emit(s,pid,city,SPECS[ind][3])
    return t

def emit(s,pid,city,n):
    s['players'][pid]['pollution']+=n;s['eco']['pollution'][city]+=n

def award(s,pid,source,n):
    s['players'][pid]['vp']+=n;b=s['vpBreak'][str(pid)];b[source]=b.get(source,0)+n

def materials(p,base,coal=0,iron=0):
    mc=max(0,coal-p['coal']);mi=max(0,iron-p['iron'])
    return dict(base=base,cost=base+2*(mc+mi),needCoal=coal,needIron=iron,
        mktCoal=mc,mktIron=mi,mktCash=2*(mc+mi),coal=[],iron=[],prov=[])

def actions(s,pid=0,include_info=False):
    if s['over']:return ([],{}) if include_info else []
    p=s['players'][pid];net=reach(s,pid);out=[];info={}
    occupied={(t['city'],t['slot']) for t in s['placed']}
    for ind,(cash,coal,iron,poll) in SPECS.items():
        plan=materials(p,cash,coal,iron)
        inf=dict(left=p['supply'][ind]['1'],tile=deepcopy(BOARD['tiles'][ind][0]),cities=[]);info[ind]=inf
        for cid in sorted(net):
            c=CITIES[cid];free=[j for j,slot in enumerate(c['slots']) if ind in slot and (cid,j) not in occupied]
            if not free:continue
            inf['cities'].append(dict(city=cid,money=plan['cost'],why='',coalFrom=[],ironFrom=[],coalMkt=plan['mktCoal'],ironMkt=plan['mktIron'],coalCash=2*plan['mktCoal'],ironCash=2*plan['mktIron'],zone=c['zone']))
            if not inf['left'] or plan['cost']>p['money']:continue
            slot=min(free,key=lambda j:len(c['slots'][j]))
            out.append(dict(kind='BUILD',city=cid,slot=slot,industry=ind,level=1,vp=3,income=1,
                linkVp=1,produces=2 if ind in ('COAL','IRON') else 0,pollution=poll,**plan))
    taken={tuple(sorted((l['a'],l['b']))) for l in s['builtLinks']}
    for link in BOARD['links']:
        key=tuple(sorted((link['a'],link['b'])))
        if key in taken or not set(key)&net:continue
        for eco in (False,True):
            plan=materials(p,8 if eco else 5,0 if eco else 1)
            if plan['cost']<=p['money']:out.append(dict(kind='NETWORK',link=list(key),eco=eco,pollution=0 if eco else 1,vp=2,**plan))
    for t in s['placed']:
        if t['owner']!=pid or t['flipped']:continue
        if t['level']<3:
            plan=materials(p,5,0,1)
            if plan['cost']<=p['money']:out.append(dict(kind='DEVELOP',variant='level',city=t['city'],slot=t['slot'],tileId=t['id'],industry=t['industry'],level=t['level']+1,dev=[],vp=2,**plan))
        if not t['ecoUpgraded']:
            plan=materials(p,6,0,1)
            if plan['cost']<=p['money']:out.append(dict(kind='DEVELOP',variant='eco',city=t['city'],slot=t['slot'],tileId=t['id'],industry=t['industry'],level=t['level'],dev=[],vp=0,**plan))
        connected=any(l['owner']==pid and t['city'] in (l['a'],l['b']) for l in s['builtLinks'])
        if connected:
            plan=materials(p,0,0 if t['ecoUpgraded'] else 1)
            if plan['cost']<=p['money']:out.append(dict(kind='SELL',city=t['city'],slot=t['slot'],tileId=t['id'],industry=t['industry'],level=t['level'],sells=[dict(t,prov=0)],income=t['level'],vp=t['level']*3,proceeds=8+2*t['level'],pollution=0 if t['ecoUpgraded'] else 1,**plan))
    for i,a in enumerate(out):
        a.update(i=i,kindZh=dict(BUILD='Build',NETWORK='Connect',DEVELOP='Develop',SELL='Sell')[a['kind']],discard=dict(n=0,allowed=[],default=[]))
    if s['hints'] and out:max(out,key=lambda a:ai_value(s,pid,a))['best']=True
    return (out,info) if include_info else out

def ai_value(s,pid,a):
    p=s['players'][pid];kind=a['kind']
    if kind=='SELL':return 28+a['vp']
    if kind=='NETWORK':
        unsold=[t for t in s['placed'] if t['owner']==pid and not t['flipped']]
        unlock=sum(t['city'] in a['link'] and not any(l['owner']==pid and t['city'] in (l['a'],l['b']) for l in s['builtLinks']) for t in unsold)
        return 10+18*unlock-a['cost']*.2+(1 if a['eco'] and p['money']>18 else 0)
    if kind=='DEVELOP':
        if a['variant']=='eco':return 38 if s['round']<7 and s['actionsLeft']==2 and p['money']>16 else 5
        return 12 if s['round']<7 and p['money']>18 else 4
    if kind=='BUILD':return 15-a['cost']*.15+(4 if a['industry'] in ('COAL','IRON') and s['round']<4 and not any(t['owner']==pid and t['industry']==a['industry'] for t in s['placed']) else 0)
    return -100

def finish_round(s):
    for p in s['players']:
        p['money']+=p['income']
        for t in s['placed']:
            if t['owner']==p['id'] and t['industry'] in ('COAL','IRON'):
                p[t['industry'].lower()]+=2*t['level'];t['resources']=2*t['level']
    log(s,None,f"Round {s['round']} complete: income paid and coal/iron produced.")
    if s['round']==8:
        for p in s['players']:
            award(s,p['id'],'green',3*p['greenPoints']);award(s,p['id'],'pollution',-(p['pollution']//3))
        s['eco']['finalized']=True;s['over']=True;s['actionsLeft']=0
        ranking=rank(s);s['winnerIds']=[p['id'] for p in ranking if (p['vp'],p['income'],p['money'])==(ranking[0]['vp'],ranking[0]['income'],ranking[0]['money'])]
        log(s,None,'Final score: earned points + 3 per eco upgrade − 1 per 3 pollution. Ties: income, then cash; exact ties share victory.')
    else:s['round']+=1

def execute(s,pid,a):
    if s['over'] or s['active']!=pid or s['actionsLeft']<1:raise RuleError('Not your turn.')
    p=s['players'][pid]
    if a['cost']>p['money']:raise RuleError('Not enough money.')
    p['money']-=a['cost'];p['spent']+=a['cost']
    p['coal']-=min(p['coal'],a.get('needCoal',0));p['iron']-=min(p['iron'],a.get('needIron',0))
    kind=a['kind'];where=[a['city']] if a.get('city') else a.get('link',[])
    if kind=='BUILD':
        add_tile(s,pid,a['city'],a['slot'],a['industry'])
        if a['industry']=='PROV':p['income']+=1
        label=f"Build {NAMES[a['industry']]} in {CITIES[a['city']]['en']}: £{a['cost']}, +{a['pollution']} pollution."
    elif kind=='NETWORK':
        s['builtLinks'].append(dict(a=a['link'][0],b=a['link'][1],owner=pid,eco=a['eco']))
        emit(s,pid,a['link'][0],a['pollution']);award(s,pid,'links',2)
        label=f"Connect {' — '.join(CITIES[c]['en'] for c in a['link'])}: £{a['cost']}, +2 victory points, +{a['pollution']} pollution."
    elif kind=='DEVELOP':
        t=next(t for t in s['placed'] if t['id']==a['tileId'])
        if a['variant']=='eco':
            t['ecoUpgraded']=True;p['greenPoints']+=1;s['eco']['green'][pid]+=1
            n=min(2,s['eco']['pollution'][t['city']],p['pollution'])
            s['eco']['pollution'][t['city']]-=n;p['pollution']-=n
            label=f"Eco retrofit in {CITIES[t['city']]['en']}: £{a['cost']}, −{n} pollution; +3 final points and coal-free selling."
        else:
            t['level']+=1;t['vp']=t['level']*3;award(s,pid,'develop',2);emit(s,pid,t['city'],0 if t['ecoUpgraded'] else 1)
            label=f"Develop {NAMES[t['industry']]} in {CITIES[t['city']]['en']} to level {t['level']}: £{a['cost']}, +2 victory points."
    elif kind=='SELL':
        t=next(t for t in s['placed'] if t['id']==a['tileId']);t['flipped']=True
        p['money']+=a['proceeds'];p['income']+=a['income'];award(s,pid,'sales',a['vp']);emit(s,pid,t['city'],a['pollution'])
        label=f"Sell {NAMES[t['industry']]} in {CITIES[t['city']]['en']}: +£{a['proceeds']}, +{a['vp']} victory points, income +£{a['income']}, +{a['pollution']} pollution."
    elif kind=='PASS':label='Pass: save this action; round-end income still arrives.'
    else:raise RuleError('Unknown action.')
    s['turnCounts'][pid]+=1;log(s,pid,label,where);s['actionsLeft']-=1;s['ver']+=1
    if s['actionsLeft']==0:
        if pid==3:finish_round(s)
        if not s['over']:s['active']=(pid+1)%4;s['actionsLeft']=2

def rank(s):return sorted(s['players'],key=lambda p:(-p['vp'],-p['income'],-p['money'],p['id']))

def run_ai(s):
    count=0
    while not s['over'] and s['active']!=0:
        pid=s['active'];opts=actions(s,pid);rng=random.Random(s['seed']+s['aiStep'])
        candidates=sorted(opts,key=lambda a:ai_value(s,pid,a),reverse=True)[:4]
        a=candidates[0 if rng.random()<.7 else rng.randrange(len(candidates))] if candidates else dict(kind='PASS',cost=0)
        execute(s,pid,a);s['aiStep']+=1;count+=1
        if count>6:raise RuleError('AI turn limit exceeded.')

def public_state(s):
    acts,info=actions(s,0,True);ps=[]
    for p in s['players']:
        ps.append(dict(deepcopy(p),isMe=p['id']==0,homeZh=REGIONS[p['home']]['zh'],hand=8,
            tiles=sum(t['owner']==p['id'] for t in s['placed']),links=sum(l['owner']==p['id'] for l in s['builtLinks']),
            level=None if p['id']==0 else 'easy',levelZh='' if p['id']==0 else 'Novice AI'))
    markets={z:{res:dict(price=2,count=14,capacity=14,maxPrice=2,outside=2,
        ladder=[dict(price=2,n=14,per=14)]) for res in ('coal','iron')} for z in ZONES}
    setup=json.loads((ROOT/'game/setup.json').read_text())
    hubs=[dict(h,zh=GEO.get(h['zh'],CITIES[h['city']]['en']),active=True,open=True,prov=0,bonus=None,claimedBy=None) for h in setup['hubs']]
    return dict(started=True,over=s['over'],ver=s['ver'],era='E1',eraZh='Combined Era',round=s['round'],roundsTotal=8,
        deck=0,mode='hackathon',engine=ENGINE,mapId=s['mapId'],mapCities=list(CITIES),players=ps,
        active=s['active'],turnOrder=s['order'],actionsLeft=s['actionsLeft'],actionsTotal=2,
        hand=[dict(kind='INDUSTRY',v=ind,label=name) for ind,name in NAMES.items()]+[dict(kind='REGION',v=s['players'][0]['home'],label=REGIONS[s['players'][0]['home']]['zh']),dict(kind='WILD',v='REGION',label='World charter')],
        placed=deepcopy(s['placed']),builtLinks=deepcopy(s['builtLinks']),reach=sorted(reach(s,0)),hubs=hubs,
        markets=markets,zoneGroup={z:z for z in ZONES},myZones=sorted({CITIES[c]['zone'] for c in reach(s,0)}),
        actions=acts,buildInfo=info,passDiscard=[],eco=deepcopy(s['eco']),linkedPairs=[],contested=[],
        log=deepcopy(s['log']),events=[],hints=s['hints'],vpBreak=deepcopy(s['vpBreak']),
        winnerIds=s.get('winnerIds',[]),save=dict(engine=ENGINE,game=deepcopy(s)))

def handle(s,path,body):
    if path=='/api/settings':s['hints']=bool(body.get('hints'));return public_state(s)
    if s['over']:raise RuleError('The eight-round game has ended. Start a new game.')
    if type(body.get('v')) is not int or body['v']!=s['ver']:return dict(public_state(s),stale=True)
    work=deepcopy(s)
    if path=='/api/pass':a=dict(kind='PASS',cost=0)
    elif path=='/api/action':
        opts=actions(work);i=body.get('i')
        if type(i) is not int or not 0<=i<len(opts):raise RuleError('Choose an available action.')
        a=opts[i]
    else:raise RuleError('Unknown game endpoint.')
    execute(work,0,a);run_ai(work);s.clear();s.update(work)
    return public_state(s)
