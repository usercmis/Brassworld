import copy
import json
import tempfile
import threading
import unittest
from http.cookiejar import CookieJar
from urllib.error import HTTPError
from urllib.request import HTTPCookieProcessor, Request, build_opener
from backend.demo_game import add_tile, execute, new_game, options
from backend.eco_rules import EcoConfig, EcoRules, RuleError
from backend.integration import execute_owned_game
from server import make_server


class EcoTests(unittest.TestCase):
    def setUp(self):
        self.state = new_game()
        self.rules = EcoRules()
        self.mfg = next(t['id'] for t in self.state['tiles'].values() if t['industry'] == 'MFG')
        self.lux = next(t['id'] for t in self.state['tiles'].values() if t['industry'] == 'LUX')

    def test_emissions(self):
        self.assertEqual(self.rules.quote_sale(self.state, self.mfg)['emissions'], 2)
        self.assertEqual(self.rules.quote_sale(self.state, self.lux)['emissions'], 3)
        cotton = next(t['id'] for t in self.state['tiles'].values() if t['industry'] == 'COTTON')
        self.assertEqual(self.rules.quote_sale(self.state, cotton)['emissions'], 1)

    def test_threshold_and_total(self):
        self.assertEqual(self.rules.quote_build(self.state, 'newyork', 13)['total'], 13)
        self.state['eco']['pollution']['newyork'] = 6
        self.assertEqual(self.rules.quote_build(self.state, 'newyork', 13), {'base': 13, 'pollution_fee': 5, 'total': 18})

    def test_upgrade_and_reward(self):
        self.rules.upgrade(self.state, '0', self.mfg)
        self.assertEqual(self.state['players']['0']['money'], 37)
        self.assertEqual(self.state['players']['0']['spent'], 8)
        quote = self.rules.record_sale(self.state, self.mfg)
        self.assertEqual(quote['emissions'], 0)
        self.assertEqual(self.state['eco']['green']['0'], 2)

    def test_upgraded_pottery_still_emits_one(self):
        self.rules.upgrade(self.state, '0', self.lux)
        self.assertEqual(self.rules.quote_sale(self.state, self.lux)['emissions'], 1)

    def test_upgrade_floor(self):
        tile = next(t['id'] for t in self.state['tiles'].values() if t['industry'] == 'COTTON')
        self.rules.upgrade(self.state, '1', tile)
        self.assertEqual(self.rules.quote_sale(self.state, tile)['emissions'], 0)

    def test_upgrade_rejects_wrong_owner_and_repeat(self):
        with self.assertRaises(RuleError): self.rules.upgrade(self.state, '1', self.mfg)
        self.rules.upgrade(self.state, '0', self.mfg)
        with self.assertRaises(RuleError): self.rules.upgrade(self.state, '0', self.mfg)

    def test_no_upgrade_after_sale(self):
        self.state['tiles'][self.mfg]['flipped'] = True
        with self.assertRaises(RuleError): self.rules.upgrade(self.state, '0', self.mfg)

    def test_no_upgrade_brewery(self):
        tile = next(t['id'] for t in self.state['tiles'].values() if t['industry'] == 'PROV')
        with self.assertRaises(RuleError): self.rules.upgrade(self.state, '0', tile)

    def test_cleanup_ownership_and_floor(self):
        with self.assertRaises(RuleError): self.rules.clean_up(self.state, '0', 'marseille')
        self.state['eco']['pollution']['newyork'] = 2
        self.rules.clean_up(self.state, '0', 'newyork')
        self.assertEqual(self.state['eco']['pollution']['newyork'], 0)
        self.assertEqual(self.state['players']['0']['money'], 40)
        with self.assertRaises(RuleError): self.rules.clean_up(self.state, '0', 'newyork')

    def test_cash_validation(self):
        self.state['players']['0']['money'] = 0
        before = copy.deepcopy(self.state)
        with self.assertRaises(RuleError): self.rules.upgrade(self.state, '0', self.mfg)
        with self.assertRaises(RuleError): self.rules.clean_up(self.state, '0', 'newyork')
        self.assertEqual(before, self.state)

    def test_pollution_cap(self):
        self.state['eco']['pollution']['newyork'] = 9
        q = self.rules.record_sale(self.state, self.lux)
        self.assertEqual(q['after'], 10)
        self.assertEqual(q['added'], 1)

    def test_green_only_once_and_final_only(self):
        self.rules.upgrade(self.state, '0', self.mfg)
        self.rules.record_sale(self.state, self.mfg)
        self.state['tiles'][self.mfg]['flipped'] = True
        with self.assertRaises(RuleError): self.rules.record_sale(self.state, self.mfg)
        with self.assertRaises(RuleError): self.rules.finalize(self.state)
        self.state['over'] = True
        self.rules.finalize(self.state)
        self.rules.finalize(self.state)
        self.assertEqual(self.state['players']['0']['vp'], 2)

    def test_standard_unchanged(self):
        s = new_game(False)
        tile = next(t['id'] for t in s['tiles'].values() if t['industry'] == 'LUX')
        self.rules.record_sale(s, tile)
        self.assertEqual(sum(s['eco']['pollution'].values()), 0)
        self.assertEqual(self.rules.quote_build(s, 'marseille', 13)['total'], 13)
        self.assertFalse(any(a['kind'] in ('CLEAN_UP', 'ECO_UPGRADE') for a in options(s)))

    def test_stale_revision_is_atomic(self):
        before = copy.deepcopy(self.state)
        with self.assertRaises(RuleError): execute(self.state, '0', -1)
        self.assertEqual(self.state, before)

    def test_cleanup_consumes_card_and_action(self):
        action = next(a for a in options(self.state) if a['kind'] == 'CLEAN_UP')
        result = execute(self.state, action['id'], 0)
        self.assertEqual(result['actions_left'], 1)
        self.assertEqual(result['players']['0']['cards'], 7)
        self.assertEqual(result['players']['0']['money'], 40)
        self.assertEqual(result['revision'], 1)

    def test_sale_consumes_own_beer_and_flips_brewery(self):
        action = next(a for a in options(self.state) if a['kind'] == 'SELL' and a['tile_id'] == self.mfg)
        result = execute(self.state, action['id'], 0)
        self.assertEqual(result['tiles'][action['beer_id']]['resources'], 0)
        self.assertTrue(result['tiles'][action['beer_id']]['flipped'])
        self.assertEqual(result['players']['0']['income'], 7)

    def test_surcharge_charged(self):
        action = next(a for a in options(self.state) if a['kind'] == 'BUILD' and a['city'] == 'marseille' and a['industry'] == 'MFG')
        result = execute(self.state, action['id'], 0)
        self.assertEqual(result['players']['0']['money'], 27)
        self.assertEqual(result['players']['0']['spent'], 18)

    def test_insufficient_total_hides_build(self):
        self.state['players']['0']['money'] = 13
        self.assertFalse(any(a['kind'] == 'BUILD' and a['city'] == 'marseille' and a['industry'] == 'MFG' for a in options(self.state)))

    def test_era_and_final_persist(self):
        s = self.state
        s['eco']['green']['0'] = 2
        for _ in range(32):
            action = next(a for a in options(s) if a['kind'] == 'PASS')
            s = execute(s, action['id'], s['revision'])
        self.assertTrue(s['over'])
        self.assertEqual(s['players']['0']['vp'], 2)
        self.assertEqual(s['eco']['pollution']['newyork'], 5)
        self.assertEqual(options(s), [])

    def test_config_validation(self):
        with self.assertRaises(ValueError): EcoConfig(threshold=11)
        with self.assertRaises(ValueError): EcoConfig(cleanup_cost=-1)

    def test_unique_tile_identity(self):
        other = add_tile(self.state, '0', 'rotterdam', 'MFG')
        self.assertNotEqual(other, self.mfg)

    def test_adapter_rolls_back_when_base_engine_fails(self):
        class FailingEngine:
            def validate_turn(self, *args): pass
            def validate_discard(self, *args): pass
            def validate_base(self, *args): return 13
            def apply_base(self, *args): raise RuleError('Resource disappeared')
        before = copy.deepcopy(self.state)
        with self.assertRaises(RuleError):
            execute_owned_game(self.state, '0', {'kind': 'BUILD', 'city': 'marseille', 'discard': 0}, FailingEngine())
        self.assertEqual(self.state, before)

    def test_adapter_cleanup_consumes_once(self):
        calls = []
        class Engine:
            def validate_turn(self, *args): calls.append('validate')
            def validate_discard(self, *args): calls.append('card')
            def consume_action(self, s, actor, discard):
                s['actions_left'] -= 1
                s['players'][actor]['cards'] -= 1
                calls.append('consume')
            def advance(self, s): calls.append('advance')
        result = execute_owned_game(self.state, '0', {'kind': 'CLEAN_UP', 'city': 'newyork', 'discard': 0}, Engine())
        self.assertEqual(result['actions_left'], 1)
        self.assertEqual(calls, ['validate', 'card', 'consume', 'advance'])


class HttpTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp = tempfile.TemporaryDirectory()
        cls.server = make_server(port=0, db_path=cls.temp.name + '/test.sqlite3')
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()
        cls.base = f'http://127.0.0.1:{cls.server.server_port}'

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown(); cls.server.server_close(); cls.thread.join(); cls.temp.cleanup()

    def setUp(self):
        self.client = build_opener(HTTPCookieProcessor(CookieJar()))

    def call(self, path, data=None, client=None):
        request = Request(self.base + path, data=None if data is None else json.dumps(data).encode(), headers={'Content-Type': 'application/json'})
        with (client or self.client).open(request) as response:
            return json.load(response)

    def test_http_and_session_isolation(self):
        state = self.call('/api/new', {'eco_enabled': True})['state']
        self.assertEqual(state['revision'], 0)
        self.assertIsNone(self.call('/api/state', client=build_opener())['state'])
        action = next(a for a in state['options'] if a['kind'] == 'CLEAN_UP')
        result = self.call('/api/action', {'id': action['id'], 'revision': 0})['state']
        self.assertEqual(result['revision'], 1)
        self.assertEqual(self.call('/api/state')['state'], result)
        with self.assertRaises(HTTPError) as error:
            self.call('/api/action', {'id': action['id'], 'revision': 0})
        self.assertEqual(error.exception.code, 409)

    def test_client_cannot_set_costs(self):
        state = self.call('/api/new', {'eco_enabled': True})['state']
        action = next(a for a in state['options'] if a['kind'] == 'ECO_UPGRADE')
        result = self.call('/api/action', {'id': action['id'], 'revision': 0, 'cost': 0, 'money': 99999})['state']
        self.assertEqual(result['players']['0']['money'], 37)

    def test_static_page(self):
        with self.client.open(self.base + '/') as response:
            self.assertIn(b'Eco Lab', response.read())


if __name__ == '__main__':
    unittest.main()
