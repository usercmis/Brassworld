import unittest
from copy import deepcopy
from game import combined as c

class CombinedTests(unittest.TestCase):
    def test_full_game_and_scoring(self):
        s=c.new_game(seed=4); previous=[]
        self.assertEqual(c.public_state(s)['currency'],'USD')
        for r in range(1,9):
            self.assertEqual(s['round'],r)
            opts=c.actions(s); a=next((a for a in opts if a['kind']=='BUILD'),opts[0])
            money=s['players'][0]['money']; inc=s['players'][0]['income']
            c.handle(s,'/api/action',{'v':s['ver'],'i':a['i']})
            self.assertEqual(s['players'][0]['money'],money-a['cost']+inc+(2 if a['kind']=='BUILD' else 0))
            self.assertTrue(all(t in s['placed'] for t in previous)); previous=deepcopy(s['placed'])
            self.assertEqual(s['era'],'BOTH')
        self.assertTrue(s['over']); self.assertEqual(s['round'],8)
        for p in s['players']: self.assertEqual(p['vp'],sum(s['vpBreak'][str(p['id'])].values()))
        before=deepcopy(s)
        with self.assertRaises(c.RuleError):c.handle(s,'/api/pass',{'v':s['ver']})
        self.assertEqual(s,before)
    def test_routes_all_eras_and_supply(self):
        s=c.new_game(); s['players'][0]['money']=10000
        self.assertEqual(len(c.CITIES),len(c.BOARD['cities']))
        for ts in c.BOARD['tiles'].values():
            for t in ts: self.assertIn(t['era'],['E1','E2','BOTH'])
        for t in c.BOARD['cities']:s['placed'].append(dict(city=t['id'],slot=-1,owner=0))
        routes=[a for a in c.actions(s) if a['kind']=='NETWORK']
        self.assertEqual(len(routes),len(c.BOARD['links']))
        self.assertTrue(all(a['cost']==5 and a['vp']==3 for a in routes))
        self.assertTrue(all(a['kind'] in ['BUILD','NETWORK'] for a in c.actions(s)))
    def test_steam_only_tiles_have_no_resource_gate(self):
        s=c.new_game(); s['players'][0]['money']=100
        s['players'][0]['supply']['PROV']=[4]
        plans=[a for a in c.actions(s) if a.get('industry')=='PROV']
        self.assertTrue(plans)
        self.assertTrue(all(a['level']==4 and a['income']==2 for a in plans))
        c.handle(s,'/api/action',{'v':s['ver'],'i':plans[0]['i']})
        self.assertEqual(s['players'][0]['income'],7)
        self.assertTrue(any(t['industry']=='PROV' and t['level']==4 for t in s['placed']))

    def test_legacy_currency_display(self):
        s=c.new_game()
        s['log']=[dict(who='You',text='Income +£2.',era='BOTH',round=1)]
        self.assertEqual(c.public_state(s)['log'][0]['text'],'Income +US$2.')
        self.assertEqual(s['log'][0]['text'],'Income +£2.')

    def test_atomic_invalid_stale_save(self):
        s=c.new_game(); before=deepcopy(s)
        with self.assertRaises(c.RuleError):c.handle(s,'/api/action',{'v':1,'i':-1})
        self.assertEqual(before,s)
        self.assertTrue(c.handle(s,'/api/pass',{'v':0})['stale']);self.assertEqual(before,s)
        saved=c.public_state(s)['save'];self.assertEqual(c.public_state(saved['game']),c.public_state(s))
        for _ in range(8):c.handle(s,'/api/pass',{'v':s['ver']})
        self.assertEqual(s['players'][0]['money'],70);self.assertTrue(s['over'])

if __name__=='__main__':unittest.main()
