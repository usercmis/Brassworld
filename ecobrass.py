#!/usr/bin/env python3
"""Standalone local EcoBrass launcher. Original serve.py and dist stay untouched."""
import argparse
import hashlib
import hmac
import json
import os
from pathlib import Path
import secrets
import sqlite3
import threading
from http.cookies import SimpleCookie
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlsplit, unquote
from game import hackathon as game

ROOT=Path(__file__).resolve().parent
DB=os.environ.get('ECOBRASS_DB',str(ROOT/'ecobrass.sqlite3'))
LOCK=threading.RLock()
with sqlite3.connect(DB) as db:
    db.execute('CREATE TABLE IF NOT EXISTS games (sid TEXT PRIMARY KEY,state TEXT NOT NULL)')
    db.execute('CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY,value TEXT NOT NULL)')
    db.execute('INSERT OR IGNORE INTO meta VALUES (?,?)',('secret',secrets.token_hex(32)))
    SECRET=db.execute('SELECT value FROM meta WHERE key=?',('secret',)).fetchone()[0].encode()

def signature(save):return hmac.new(SECRET,json.dumps(save['game'],sort_keys=True,separators=(',',':')).encode(),hashlib.sha256).hexdigest()

class Handler(SimpleHTTPRequestHandler):
    extensions_map={**SimpleHTTPRequestHandler.extensions_map,'.js':'text/javascript; charset=utf-8','.json':'application/json; charset=utf-8','.css':'text/css; charset=utf-8','.woff2':'font/woff2'}
    def __init__(self,*a,**kw):super().__init__(*a,directory=str(ROOT/'dist'),**kw)
    def translate_path(self,path):
        rel=unquote(urlsplit(path).path).lstrip('/') or 'index.html'
        if '..' in Path(rel).parts:return str(ROOT/'ecobrass'/'not-found')
        # Only app and shell are overridden. Map, art, fonts, styling and all
        # artwork are served straight from the unmodified Atlas distribution.
        override=ROOT/'ecobrass'/rel
        return str(override if override.is_file() else ROOT/'dist'/rel)
    def log_message(self,*args):pass
    def reply(self,code,payload,sid=None):
        if payload.get('save'):payload['save']['signature']=signature(payload['save'])
        data=json.dumps(payload,ensure_ascii=False).encode()
        self.send_response(code);self.send_header('Content-Type','application/json; charset=utf-8');self.send_header('Content-Length',str(len(data)));self.send_header('Cache-Control','no-store')
        if sid:self.send_header('Set-Cookie',f'ecobrass_sid={sid}; HttpOnly; SameSite=Strict; Path=/')
        self.end_headers();self.wfile.write(data)
    def api(self):
        path=urlsplit(self.path).path
        if path not in ('/api/board','/api/state','/api/new','/api/load','/api/action','/api/pass','/api/settings'):return self.reply(404,dict(error='Unknown endpoint.'))
        if path=='/api/board':return self.reply(200,game.BOARD)
        if (self.command=='GET') != (path=='/api/state'):return self.reply(405,dict(error='Use GET for state and POST for actions.'))
        origin=self.headers.get('Origin')
        if origin and urlsplit(origin).netloc!=self.headers.get('Host'):return self.reply(403,dict(error='Cross-origin action blocked.'))
        cookie=SimpleCookie()
        try:cookie.load(self.headers.get('Cookie',''))
        except Exception:pass
        sid=cookie['ecobrass_sid'].value if 'ecobrass_sid' in cookie else ''
        if len(sid)!=48 or any(c not in '0123456789abcdef' for c in sid):sid=secrets.token_hex(24)
        try:
            n=int(self.headers.get('Content-Length','0'))
            if n<0 or n>2_000_000:raise game.RuleError('Request is too large.')
            body=json.loads(self.rfile.read(n)) if n else {}
            if not isinstance(body,dict):raise game.RuleError('Expected a game request object.')
            with LOCK,sqlite3.connect(DB) as db:
                row=db.execute('SELECT state FROM games WHERE sid=?',(sid,)).fetchone()
                state=json.loads(row[0]) if row else None
                if path=='/api/new':state=game.new_game(body)
                elif path=='/api/load':
                    save=body.get('save',{})
                    if save.get('engine')!=game.ENGINE or not hmac.compare_digest(str(save.get('signature','')),signature(save)):raise game.RuleError('This save belongs to a different game or server. Start a new EcoBrass game.')
                    state=save['game']
                elif not state:return self.reply(200,dict(started=False),sid)
                elif path!='/api/state':
                    result=game.handle(state,path,body)
                if path in ('/api/state','/api/new','/api/load'):result=game.public_state(state)
                db.execute('INSERT INTO games VALUES (?,?) ON CONFLICT(sid) DO UPDATE SET state=excluded.state',(sid,json.dumps(state)))
            self.reply(200,result,sid)
        except (game.RuleError,ValueError,KeyError,TypeError) as e:self.reply(400,dict(error=str(e)),sid)
    def do_GET(self):
        if urlsplit(self.path).path.startswith('/api/'):return self.api()
        super().do_GET()
    def do_POST(self):self.api()

if __name__=='__main__':
    p=argparse.ArgumentParser(description='EcoBrass hackathon demo (local/offline)')
    p.add_argument('--port',type=int,default=4180);p.add_argument('--host',default='127.0.0.1');a=p.parse_args()
    server=ThreadingHTTPServer((a.host,a.port),Handler)
    print(f'EcoBrass: http://{a.host}:{server.server_port}',flush=True)
    try:server.serve_forever()
    except KeyboardInterrupt:pass
    finally:server.server_close()
