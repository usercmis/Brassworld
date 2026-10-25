import copy
import json
import tempfile
import threading
import unittest
from http.cookiejar import CookieJar
from urllib.request import Request, build_opener, HTTPCookieProcessor
from urllib.error import HTTPError
from http.server import ThreadingHTTPServer
from game import engine as e


def place(s,city,ind='COTTON',owner=0,level=1,slot=None,upgraded=False):
    used={t['slot'] for t in s['placed'] if t['city']==city}
    slot=next(i for i,a in enumerate(e.CITIES[city]['slots']) if ind in a and i not in used) if slot is None else slot
    t=e.TILES[ind,level]
    tile={'id':__import__('uuid').uuid4().hex,'city':city,'slot':slot,'industry':ind,'owner':owner,'level':level,
          'flipped':False,'vp':t['vp'],'linkVp':t['linkVp'],'resources':t['produces'],'ecoUpgraded':upgraded,'greenClaimed':False}
    s['placed'].append(tile)
    return tile


def setup_sale():
    s=e.new_game(seed=7)
    s['players'][0]['money']=100;s['actionsLeft']=2;s['round']=2
    s['builtLinks'].append({'a':'newyork','b':'boston','owner':0})
    t=place(s,'newyork','COTTON')
    h=next(h for h in s['hubs'] if h['city']=='newyork')
    return s,t,h


class WorldTests(unittest.TestCase):
    def test_board_preserved(self):
        self.assertEqual(len(e.CITIES),80)
        self.assertEqual(len(e.BOARD['links']),137)
        self.assertEqual(len(e.REGIONS),21)
        self.assertEqual(set(e.BOARD['tiles']),{'COAL','IRON','PROV','COTTON','MFG','LUX'})

    def test_fresh_game(self):
        s=e.new_game(seed=1);v=e.public_state(s)
        self.assertEqual(len(v['players']),4)
        self.assertEqual(s['actionsLeft'],1)
        self.assertEqual(sum(s['eco']['pollution'].values()),0)
        self.assertTrue(v['actions'])

    def test_region_card_outside_network(self):
        s=e.new_game(seed=1);s['players'][0]['hand']=[['REGION','NEENG']]
        plans=e.build_plans(s,0)
        self.assertTrue(any(a['city']=='newyork' and a['industry']=='COTTON' for a in plans))

    def test_industry_card_requires_own_network(self):
        s=e.new_game(seed=1);s['players'][0]['hand']=[['INDUSTRY','COTTON+MFG']]
        self.assertFalse(any(a['city']=='newyork' for a in e.build_plans(s,0)))

    def test_own_sail_city_limit(self):
        s=e.new_game(seed=1);s['players'][0]['hand']=[['REGION','NEENG']]
        place(s,'newyork','COTTON')
        self.assertFalse(any(a['city']=='newyork' and not a.get('over') for a in e.build_plans(s,0)))

    def test_build_fee(self):
        s=e.new_game(seed=1);s['players'][0]['hand']=[['REGION','NEENG']]
        s['eco']['pollution']['newyork']=6
        a=next(a for a in e.build_plans(s,0) if a['city']=='newyork' and a['industry']=='COTTON')
        self.assertEqual(a['cost'],17);self.assertEqual(a['pollutionFee'],5)

    def test_insufficient_cash_includes_fee(self):
        s=e.new_game(seed=1);s['players'][0]['hand']=[['REGION','NEENG']];s['players'][0]['money']=12
        s['eco']['pollution']['newyork']=6
        self.assertFalse(any(a['city']=='newyork' and a['industry']=='COTTON' for a in e.build_plans(s,0)))

    def test_upgrade_and_sale(self):
        s,t,h=setup_sale()
        a=next(a for a in e.actions(s) if a['kind']=='ECO_UPGRADE' and a['tileId']==t['id'])
        e.execute(s,0,a)
        self.assertEqual(s['players'][0]['money'],92)
        self.assertTrue(t['ecoUpgraded'])
        a=e.sale_plan(s,0,[t['id']],h['id']);a['discard']={'n':1,'allowed':list(range(len(s['players'][0]['hand']))),'default':[0]}
        self.assertEqual(a['ecoPreview'][0]['emissions'],0)
        e.execute(s,0,a)
        self.assertEqual(s['eco']['green'][0],2)
        self.assertTrue(t['flipped'])

    def test_normal_sale_emits(self):
        s,t,h=setup_sale();s['eco']['pollution']['newyork']=5
        a=e.sale_plan(s,0,[t['id']],h['id'])
        self.assertEqual(a['ecoPreview'][0]['after'],6)
        self.assertEqual(a['greenGain'],0)

    def test_own_beer_anywhere(self):
        s,t,h=setup_sale();h['prov']=0
        beer=place(s,'riga','PROV')
        a=e.sale_plan(s,0,[t['id']],h['id'])
        self.assertEqual(a['prov'][0]['id'],beer['id'])

    def test_opponent_beer_requires_connection(self):
        s,t,h=setup_sale();h['prov']=0;place(s,'riga','PROV',owner=1)
        with self.assertRaises(e.RuleError):e.sale_plan(s,0,[t['id']],h['id'])

    def test_invalid_beer_rejected(self):
        s,t,h=setup_sale()
        with self.assertRaises(e.RuleError):e.sale_plan(s,0,[t['id']],h['id'],[])

    def test_closed_trade_port(self):
        s,t,h=setup_sale();s['builtLinks']=[]
        with self.assertRaises(e.RuleError):e.sale_plan(s,0,[t['id']],h['id'])

    def test_cannot_sell_other_factory_or_twice(self):
        s,t,h=setup_sale();t['owner']=1
        with self.assertRaises(e.RuleError):e.sale_plan(s,0,[t['id']],h['id'])
        t['owner']=0;t['flipped']=True
        with self.assertRaises(e.RuleError):e.sale_plan(s,0,[t['id']],h['id'])

    def test_pottery_reduced_emission(self):
        s,t,h=setup_sale();s['placed']=[];t=place(s,'newyork','LUX',upgraded=True)
        self.assertEqual(e.sale_plan(s,0,[t['id']],h['id'])['ecoPreview'][0]['emissions'],1)

    def test_pollution_cap(self):
        s,t,h=setup_sale();s['placed']=[];t=place(s,'newyork','LUX');s['eco']['pollution']['newyork']=9
        self.assertEqual(e.sale_plan(s,0,[t['id']],h['id'])['ecoPreview'][0]['after'],10)

    def test_cleanup_ownership(self):
        s,t,h=setup_sale();s['eco']['pollution']['newyork']=2;s['eco']['pollution']['london']=9
        opts=e.actions(s);a=next(a for a in opts if a['kind']=='CLEAN_UP')
        self.assertEqual(a['city'],'newyork');self.assertEqual(a['pollutionAfter'],0)
        before=len(s['players'][0]['hand']);e.execute(s,0,a)
        self.assertEqual(s['players'][0]['money'],95);self.assertEqual(s['actionsLeft'],1)
        self.assertEqual(len(s['players'][0]['hand']),before-1)

    def test_coal_requires_connection_iron_does_not(self):
        s=e.new_game(seed=1);s['builtLinks']=[];place(s,'philadelphia','COAL');place(s,'stetienne','IRON')
        with self.assertRaises(e.RuleError):e.material_plan(s,'riga',1,0)
        self.assertEqual(e.material_plan(s,'riga',0,1)['mktCash'],0)

    def test_nearest_coal(self):
        s=e.new_game(seed=1);s['builtLinks']=[{'a':'riga','b':'stockholm','owner':0},{'a':'stockholm','b':'gothenburg','owner':1}]
        near=place(s,'stockholm','COAL',slot=0);place(s,'gothenburg','COAL',slot=0)
        self.assertEqual(e.material_plan(s,'riga',1)['coal'][0]['id'],near['id'])

    def test_develop_cannot_remove_no_dev(self):
        s=e.new_game(seed=1)
        with self.assertRaises(e.RuleError):e.develop_plan(s,0,['LUX'])

    def test_scout_discards_three(self):
        s=e.new_game(seed=1);s['actionsLeft']=2;s['round']=2
        a=next(a for a in e.actions(s) if a['kind']=='SCOUT');e.execute(s,0,a)
        self.assertEqual(len(s['players'][0]['hand']),7)
        self.assertEqual(sum(c[0]=='WILD' for c in s['players'][0]['hand']),2)

    def test_stale_is_noop(self):
        s=e.new_game(seed=1);before=copy.deepcopy(s)
        result=e.handle(s,'/api/action',{'i':0,'v':-1})
        self.assertTrue(result['stale']);self.assertEqual(s,before)

    def test_failure_is_atomic(self):
        s=e.new_game(seed=1);before=copy.deepcopy(s)
        with self.assertRaises(e.RuleError):e.handle(s,'/api/action',{'i':0,'v':s['ver'],'discard':[999]})
        self.assertEqual(s,before)

    def test_era_cleanup_and_green_persist(self):
        s=e.new_game(seed=1);s['eco']['pollution']['riga']=7;s['eco']['green'][0]=2
        s['deck']=[]
        for p in s['players']:p['hand']=[]
        place(s,'riga','PROV');higher=place(s,'newyork','MFG',level=2,upgraded=True)
        s['turnIndex']=3;s['actionsLeft']=0;e.advance(s)
        self.assertEqual(s['era'],'E2');self.assertFalse(any(t['level']==1 for t in s['placed']))
        self.assertTrue(higher in s['placed']);self.assertTrue(higher['ecoUpgraded'])
        self.assertEqual(s['eco']['pollution']['riga'],7);self.assertEqual(s['eco']['green'][0],2)

    def test_final_green_once(self):
        s=e.new_game(seed=1);s['era']='E2';s['deck']=[];s['eco']['green'][0]=4
        for p in s['players']:p['hand']=[]
        s['turnIndex']=3;s['actionsLeft']=0;e.advance(s)
        self.assertTrue(s['over']);self.assertEqual(s['vpBreak']['0']['green'],4)
        before=s['players'][0]['vp']
        with self.assertRaises(e.RuleError):e.handle(s,'/api/pass',{'v':s['ver']})
        self.assertEqual(s['players'][0]['vp'],before)


class HttpTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        import serve
        cls.serve=serve;cls.tmp=tempfile.TemporaryDirectory();serve.DB_PATH=cls.tmp.name+'/test.sqlite3'
        import sqlite3
        with sqlite3.connect(serve.DB_PATH) as db:db.execute('CREATE TABLE eco_games (sid TEXT PRIMARY KEY,state TEXT NOT NULL)')
        cls.server=ThreadingHTTPServer(('127.0.0.1',0),serve.Handler)
        cls.thread=threading.Thread(target=cls.server.serve_forever,daemon=True);cls.thread.start()
        cls.base=f'http://127.0.0.1:{cls.server.server_port}'

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown();cls.server.server_close();cls.thread.join();cls.tmp.cleanup()

    def setUp(self):self.client=build_opener(HTTPCookieProcessor(CookieJar()))

    def call(self,path,body=None):
        data=None if body is None else json.dumps(body).encode()
        with self.client.open(Request(self.base+path,data=data,headers={'Content-Type':'application/json'})) as response:return json.load(response)

    def test_offline_start_and_eco_save(self):
        self.assertFalse(self.call('/api/state')['started'])
        state=self.call('/api/new',{'mode':'eco'})
        self.assertTrue(state['started']);self.assertEqual(len(state['players']),4)
        self.assertTrue(state['save']['signature'])
        self.assertEqual(self.call('/api/state')['ver'],state['ver'])
        self.assertEqual(self.call('/api/load',{'save':state['save']})['ver'],state['ver'])

    def test_tampered_save_rejected(self):
        state=self.call('/api/new',{'mode':'eco'});save=state['save'];save['game']['players'][0]['money']=99999
        with self.assertRaises(HTTPError) as error:self.call('/api/load',{'save':save})
        self.assertEqual(error.exception.code,400)
        self.assertEqual(self.call('/api/state')['players'][0]['money'],25)


if __name__=='__main__':unittest.main()
