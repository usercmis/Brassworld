"""HTTP integration: python3 -m unittest tests.test_hackathon_http -v"""
import http.cookiejar
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import tempfile
import unittest
from urllib.request import build_opener,HTTPCookieProcessor,Request
from urllib.error import HTTPError

ROOT=Path(__file__).resolve().parents[1]
class HTTP(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp=tempfile.TemporaryDirectory();env=dict(os.environ,ECOBRASS_DB=cls.tmp.name+'/sessions.sqlite3')
        cls.proc=subprocess.Popen([sys.executable,str(ROOT/'ecobrass.py'),'--port','0'],stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True,env=env)
        cls.url=cls.proc.stdout.readline().strip().split()[-1]
    @classmethod
    def tearDownClass(cls):
        cls.proc.terminate();cls.proc.communicate(timeout=5);cls.tmp.cleanup()
    def setUp(self):self.opener=build_opener(HTTPCookieProcessor(http.cookiejar.CookieJar()))
    def request(self,path,body=None):
        req=Request(self.url+path,data=json.dumps(body).encode() if body is not None else None,headers={'Content-Type':'application/json'})
        with self.opener.open(req,timeout=5) as r:return json.load(r)
    def test_full_game_http_and_signed_resume(self):
        self.assertFalse(self.request('/api/state')['started'])
        s=self.request('/api/new',{});save=s['save']
        self.assertIn('signature',save)
        for n in range(16):s=self.request('/api/pass',{'v':s['ver']})
        self.assertTrue(s['over']);self.assertEqual(s['round'],8)
        self.assertEqual(s['save']['game']['turnCounts'],[16]*4)
        s=self.request('/api/load',{'save':save});self.assertEqual(s['round'],1)
        save['game']['players'][0]['money']=999
        with self.assertRaises(HTTPError) as e:self.request('/api/load',{'save':save})
        self.assertEqual(e.exception.code,400);self.assertEqual(self.request('/api/state')['players'][0]['money'],30)
    def test_session_isolation_stale_and_invalid_requests(self):
        s=self.request('/api/new',{})
        stale=self.request('/api/pass',{'v':0});self.assertTrue(stale['stale'])
        self.assertEqual(stale['ver'],s['ver'])
        with self.assertRaises(HTTPError) as e:self.request('/api/action',{'v':s['ver'],'i':-1})
        self.assertEqual(e.exception.code,400)
        other=build_opener(HTTPCookieProcessor(http.cookiejar.CookieJar()))
        with other.open(self.url+'/api/state') as r:self.assertFalse(json.load(r)['started'])
        req=Request(self.url+'/api/pass',data=json.dumps({'v':s['ver']}).encode(),headers={'Origin':'https://example.com'})
        with self.assertRaises(HTTPError) as e:self.opener.open(req)
        self.assertEqual(e.exception.code,403)
        self.assertEqual(self.request('/api/state')['ver'],s['ver'])
    def test_shared_visual_assets_and_module_mime(self):
        for path,source in [('/css/app.css','dist/css/app.css'),('/theme/atlas.css','dist/theme/atlas.css'),('/js/art.js','dist/js/art.js'),('/assets/map.json','dist/assets/map.json'),('/assets/tiles/MFG.jpg','dist/assets/tiles/MFG.jpg')]:
            with self.opener.open(self.url+path) as r:self.assertEqual(r.read(),(ROOT/source).read_bytes())
        with self.opener.open(self.url+'/js/app.js') as r:
            self.assertIn('javascript',r.headers['Content-Type']);self.assertIn(b'How to play EcoBrass',r.read())
        with self.opener.open(self.url+'/') as r:self.assertIn(b'EcoBrass',r.read())

if __name__=='__main__':unittest.main()
