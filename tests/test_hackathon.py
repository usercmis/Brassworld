"""Run: python3 -m unittest tests.test_hackathon -v"""
import json
import random
import unittest
from copy import deepcopy
from unittest.mock import patch
from game import hackathon as g

class Rules(unittest.TestCase):
    def setUp(self):self.s=g.new_game()
    def choose(self,kind,**kw):
        a=next(a for a in g.actions(self.s) if a['kind']==kind and all(a.get(k)==v for k,v in kw.items()))
        return g.handle(self.s,'/api/action',dict(v=self.s['ver'],i=a['i']))
    def test_original_map_and_four_actions(self):
        original=json.loads((g.ROOT/'upstream/api/board').read_text())
        self.assertEqual([c['id'] for c in original['cities']],list(g.CITIES))
        self.assertEqual([(l['a'],l['b'],l['sea']) for l in original['links']],[(l['a'],l['b'],l['sea']) for l in g.BOARD['links']])
        self.assertEqual(len(g.CITIES),80);self.assertEqual(len(g.BOARD['links']),137)
        self.assertEqual(len(self.s['players']),4);self.assertEqual(self.s['actionsLeft'],2)
        self.assertLessEqual({a['kind'] for a in g.actions(self.s)},{'BUILD','NETWORK','DEVELOP','SELL'})
    def test_clean_route_then_sale_and_ai(self):
        starter=self.s['placed'][0];p=self.s['players'][0]
        a=next(a for a in g.actions(self.s) if a['kind']=='NETWORK' and a['eco'] and starter['city'] in a['link'])
        g.handle(self.s,'/api/action',dict(v=1,i=a['i']))
        self.assertEqual(self.s['actionsLeft'],1);self.assertEqual(self.s['players'][0]['money'],22)
        self.assertEqual(self.s['players'][0]['pollution'],2)
        self.choose('SELL');p=self.s['players'][0]
        self.assertEqual(p['money'],36);self.assertEqual(p['coal'],2);self.assertEqual(p['vp'],5)
        self.assertEqual(self.s['round'],2);self.assertEqual(self.s['turnCounts'],[2]*4)
        self.assertEqual(self.s['aiStep'],6)
    def test_develop_eco_stock_and_scoring(self):
        self.choose('DEVELOP',variant='eco');p=self.s['players'][0]
        self.assertEqual((p['money'],p['iron'],p['pollution'],p['greenPoints']),(24,2,0,1))
        self.assertTrue(self.s['placed'][0]['ecoUpgraded'])
        self.choose('DEVELOP',variant='level');p=self.s['players'][0]
        self.assertEqual(p['vp'],2);self.assertEqual(self.s['placed'][0]['level'],2)
        self.assertEqual(p['pollution'],0)
        for _ in range(14):g.handle(self.s,'/api/pass',dict(v=self.s['ver']))
        self.assertTrue(self.s['over']);self.assertEqual(self.s['vpBreak']['0']['green'],3)
        self.assertEqual(self.s['turnCounts'],[16]*4)
    def test_missing_resource_delivery(self):
        self.s['players'][0].update(coal=0,iron=0)
        a=next(a for a in g.actions(self.s) if a['kind']=='BUILD' and a['industry']=='MFG')
        self.assertEqual((a['cost'],a['mktCoal'],a['mktIron']),(16,1,1))
        g.handle(self.s,'/api/action',dict(v=1,i=a['i']))
        self.assertEqual(self.s['players'][0]['money'],14)
        self.assertEqual((self.s['players'][0]['coal'],self.s['players'][0]['iron']),(0,0))
    def test_production_and_money(self):
        self.choose('BUILD',industry='COAL')
        self.assertEqual(self.s['players'][0]['money'],22)
        g.handle(self.s,'/api/pass',dict(v=self.s['ver']))
        self.assertEqual(self.s['players'][0]['coal'],5)
        self.assertEqual(self.s['players'][0]['money'],25)
    def test_stale_bad_index_and_rollback(self):
        old=deepcopy(self.s)
        self.assertTrue(g.handle(self.s,'/api/pass',dict(v=0))['stale']);self.assertEqual(self.s,old)
        for i in (-1,True,100000,'0'):
            with self.assertRaises(g.RuleError):g.handle(self.s,'/api/action',dict(v=1,i=i))
            self.assertEqual(self.s,old)
        g.handle(self.s,'/api/pass',dict(v=1));old=deepcopy(self.s)
        with patch.object(g,'run_ai',side_effect=g.RuleError('test rollback')):
            with self.assertRaises(g.RuleError):g.handle(self.s,'/api/pass',dict(v=self.s['ver']))
        self.assertEqual(self.s,old)
    def test_no_double_selling_and_max_level(self):
        for _ in range(2):self.choose('DEVELOP',variant='level')
        self.assertEqual(self.s['placed'][0]['level'],3)
        self.assertFalse(any(a.get('tileId')=='tile-1' and a.get('variant')=='level' for a in g.actions(self.s)))
        a=next(a for a in g.actions(self.s) if a['kind']=='NETWORK' and 'manchester' in a['link'])
        g.handle(self.s,'/api/action',dict(v=self.s['ver'],i=a['i']))
        self.choose('SELL',tileId='tile-1')
        self.assertFalse(any(a.get('tileId')=='tile-1' and a['kind'] in ('DEVELOP','SELL') for a in g.actions(self.s)))
    def test_final_winner_and_exact_tie(self):
        for _ in range(16):g.handle(self.s,'/api/pass',dict(v=self.s['ver']))
        p=g.rank(self.s)[0];self.assertIn(p['id'],self.s['winnerIds'])
        before=deepcopy(self.s)
        with self.assertRaises(g.RuleError):g.handle(self.s,'/api/pass',dict(v=self.s['ver']))
        self.assertEqual(self.s,before)
        s=g.new_game();s['round']=8
        g.finish_round(s);self.assertEqual(s['winnerIds'],[0,1,2,3])
    def test_twenty_complete_games_with_invariants(self):
        for seed in range(20):
            s=g.new_game(seed=seed);rng=random.Random(seed)
            for turn in range(16):
                acts=g.actions(s);a=rng.choice(acts) if acts else None
                g.handle(s,'/api/action' if a else '/api/pass',dict(v=s['ver'],**({'i':a['i']} if a else {})))
                self.assertTrue(all(p['money']>=0 and p['coal']>=0 and p['iron']>=0 and p['pollution']>=0 for p in s['players']))
                self.assertEqual(sum(p['pollution'] for p in s['players']),sum(s['eco']['pollution'].values()))
                self.assertEqual(len({(t['city'],t['slot']) for t in s['placed']}),len(s['placed']))
                self.assertEqual(len({tuple(sorted((l['a'],l['b']))) for l in s['builtLinks']}),len(s['builtLinks']))
            self.assertTrue(s['over']);self.assertEqual(s['round'],8);self.assertEqual(s['turnCounts'],[16]*4)
            for p in s['players']:self.assertEqual(p['vp'],sum(s['vpBreak'][str(p['id'])].values()))
            self.assertEqual(s['vpBreak']['0']['pollution'],-(s['players'][0]['pollution']//3))

if __name__=='__main__':unittest.main()
