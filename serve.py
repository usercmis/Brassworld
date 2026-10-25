#!/usr/bin/env python3
"""Local frontend server; preserves the original Brassworld rules via its API."""
import argparse, http.cookiejar, json, os, secrets, threading, sqlite3, hmac, hashlib
from game import engine as eco_engine
from game import combined
from http.cookies import SimpleCookie
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import urlsplit
from urllib.request import Request, build_opener, HTTPCookieProcessor

ROOT = Path(__file__).resolve().parent
DB_PATH = os.environ.get('ECO_DB_PATH', str(ROOT / 'eco_games.sqlite3'))
with sqlite3.connect(DB_PATH) as _db:
    _db.execute('CREATE TABLE IF NOT EXISTS eco_games (sid TEXT PRIMARY KEY, state TEXT NOT NULL)')
    _db.execute('CREATE TABLE IF NOT EXISTS eco_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)')
    _db.execute("INSERT OR IGNORE INTO eco_meta VALUES ('signing_key', ?)", (secrets.token_hex(32),))
    SAVE_KEY = bytes.fromhex(_db.execute("SELECT value FROM eco_meta WHERE key='signing_key'").fetchone()[0])

def sign_save(save):
    return hmac.new(SAVE_KEY, json.dumps(save['game'], sort_keys=True, separators=(',', ':')).encode(), hashlib.sha256).hexdigest()
UPSTREAM = 'https://brass.iboardgame.app'
ALLOWED = {'/api/state', '/api/new', '/api/action', '/api/pass', '/api/load', '/api/settings'}
sessions = {}
sessions_lock = threading.Lock()

class Handler(SimpleHTTPRequestHandler):
    # Windows registry MIME overrides must not turn ES modules into text/plain.
    extensions_map = {**SimpleHTTPRequestHandler.extensions_map,
        '.js':'text/javascript; charset=utf-8', '.mjs':'text/javascript; charset=utf-8',
        '.json':'application/json; charset=utf-8', '.css':'text/css; charset=utf-8',
        '.woff2':'font/woff2', '.svg':'image/svg+xml'}

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT / 'dist'), **kwargs)

    def log_message(self, fmt, *args):
        # Do not log session tokens, save data, or request bodies.
        if str(args[1] if len(args)>1 else '') != '200':
            super().log_message(fmt, *args)

    def session(self):
        cookie = SimpleCookie()
        try: cookie.load(self.headers.get('Cookie', ''))
        except Exception: pass
        sid = cookie['atlas_sid'].value if 'atlas_sid' in cookie else None
        with sessions_lock:
            if not sid or len(sid) != 32 or any(c not in 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_-' for c in sid):
                sid = secrets.token_urlsafe(24)
            if sid not in sessions:
                sessions[sid] = (build_opener(HTTPCookieProcessor(http.cookiejar.CookieJar())), threading.Lock())
            return sid, sessions[sid]

    def json_reply(self, code, payload, sid=None):
        if payload.get('engine') in ('atlas-eco-v1', combined.ENGINE) and payload.get('save'):
            payload['save']['signature'] = sign_save(payload['save'])
        data = json.dumps(payload, ensure_ascii=False).encode()
        self.send_response(code)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(data)))
        self.send_header('Cache-Control', 'no-store')
        if sid: self.send_header('Set-Cookie', f'atlas_sid={sid}; HttpOnly; SameSite=Strict; Path=/')
        self.end_headers()
        self.wfile.write(data)

    def eco_dispatch(self, path, body, sid):
        try:
            with sqlite3.connect(DB_PATH, timeout=60) as db:
                db.execute('BEGIN IMMEDIATE')
                row = db.execute('SELECT state FROM eco_games WHERE sid=?', (sid,)).fetchone()
                if path == '/api/new' and body.get('mode', 'combined') == 'combined':
                    state = combined.new_game(body)
                    result = combined.public_state(state)
                elif path == '/api/new' and body.get('mode') == 'eco':
                    state = eco_engine.new_game(body)
                    result = eco_engine.public_state(state)
                elif path == '/api/load' and isinstance(body.get('save'), dict) and body['save'].get('engine') in ('atlas-eco-v1', combined.ENGINE):
                    save = body['save']
                    if not hmac.compare_digest(str(save.get('signature','')), sign_save(save)):
                        raise eco_engine.RuleError('This local save cannot be verified on this server. Start a new game or use the original server database.')
                    state = save['game']
                    result = (combined if save['engine'] == combined.ENGINE else eco_engine).public_state(state)
                elif path in ('/api/new','/api/load'):
                    return False
                elif row:
                    state = json.loads(row[0])
                    if state.get('engine') == combined.ENGINE:
                        result = combined.public_state(state) if path == '/api/state' else combined.handle(state,path,body)
                    elif state.get('mapId') != eco_engine.MAP_ID:
                        if path == '/api/state':
                            self.json_reply(200, {'started': False}, sid)
                            return True
                        raise eco_engine.RuleError('Start a new Eco game for the Industrial Belt 20 map.')
                    else:
                        result = eco_engine.public_state(state) if path == '/api/state' else eco_engine.handle(state,path,body)
                elif path == '/api/state':
                    # Opening the new-game selector must work offline. Classic
                    # restores its browser save via /api/load when requested.
                    self.json_reply(200, {'started': False}, sid)
                    return True
                else:
                    return False
                db.execute('INSERT INTO eco_games VALUES (?,?) ON CONFLICT(sid) DO UPDATE SET state=excluded.state', (sid,json.dumps(state)))
            self.json_reply(200,result,sid)
        except (eco_engine.RuleError, KeyError, TypeError, ValueError) as error:
            self.json_reply(400, {'error': str(error), 'started': False},sid)
        except sqlite3.Error:
            self.json_reply(503, {'error':'Eco save is busy or unavailable. Try again.'},sid)
        return True

    def proxy_api(self):
        path = urlsplit(self.path).path
        if path not in ALLOWED:
            return self.json_reply(404, {'error': 'Unknown game endpoint.'})
        origin = self.headers.get('Origin')
        port = self.server.server_port
        allowed_hosts = {self.headers.get('Host'), self.headers.get('X-Forwarded-Host'),
                         f'localhost:{port}', f'127.0.0.1:{port}', f'terminal.local:{port}'}
        if origin and urlsplit(origin).netloc not in allowed_hosts:
            return self.json_reply(403, {'error': 'Cross-origin game requests are not allowed.'})
        body = None
        if self.command == 'POST':
            try: length = int(self.headers.get('Content-Length', '0'))
            except ValueError: return self.json_reply(400, {'error': 'Invalid request.'})
            if not 0 < length <= 10 * 1024 * 1024:
                return self.json_reply(413, {'error': 'Invalid save or action size.'})
            body = self.rfile.read(length)
            try: json.loads(body)
            except Exception: return self.json_reply(400, {'error': 'Expected a JSON game request.'})
        sid, (opener, lock) = self.session()
        payload = json.loads(body) if body else {}
        if not isinstance(payload, dict): return self.json_reply(400, {'error':'Expected a JSON object.'}, sid)
        with lock:
            if self.eco_dispatch(path, payload, sid): return
        req = Request(UPSTREAM + path, data=body, method=self.command,
            headers={'Content-Type':'application/json', 'Accept':'application/json',
                     'User-Agent':'Brassworld-Atlas-Local/1.0'})
        try:
            with lock, opener.open(req, timeout=180) as r:
                result = json.loads(r.read())
            if path in ('/api/new', '/api/load') and result.get('started'):
                with sqlite3.connect(DB_PATH) as db: db.execute('DELETE FROM eco_games WHERE sid=?', (sid,))
            self.json_reply(200, result, sid)
        except HTTPError as e:
            self.json_reply(502, {'error': f'The original game service returned HTTP {e.code}. Please try again later.'}, sid)
        except (URLError, TimeoutError, json.JSONDecodeError, OSError) as exc:
            reason = getattr(exc, 'reason', None)
            # Diagnostic types only: never record request bodies, saves, or credentials.
            (ROOT / 'connection-diagnostic.json').write_text(json.dumps({
                'exception': type(exc).__name__, 'reason_type': type(reason).__name__,
                'errno': getattr(reason, 'errno', None)}), encoding='utf-8')
            self.json_reply(502, {'error': 'Unable to reach the original game service. Check your internet connection and try again.'}, sid)

    def do_GET(self):
        path = urlsplit(self.path).path
        if path == '/api/board':
            try:
                board = json.loads((ROOT / 'upstream/api/board').read_text(encoding='utf-8'))
            except (OSError, ValueError):
                return self.json_reply(500, {'error':'Unable to read the local board configuration. Fully extract the game package and try again.'})
            return self.json_reply(200, board)
        if path.startswith('/api/'):
            if path != '/api/state': return self.json_reply(405, {'error':'Use POST for game actions.'})
            return self.proxy_api()
        return super().do_GET()

    def do_POST(self):
        if urlsplit(self.path).path == '/api/state': return self.json_reply(405, {'error':'Use GET for game state.'})
        return self.proxy_api()

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='Run the local English Brassworld Atlas edition.')
    parser.add_argument('--port', type=int, default=int(os.environ.get('PORT', '3000')))
    parser.add_argument('--host', default=os.environ.get('HOST', '127.0.0.1'))
    parser.add_argument('--strictPort', action='store_true', help=argparse.SUPPRESS)
    args = parser.parse_args()
    server = ThreadingHTTPServer((args.host, args.port), Handler)
    print(f'Brassworld Atlas: http://{args.host}:{args.port}', flush=True)
    print('Combined Era: local beginner rules. Classic: upstream rules. Eco: local Eco rules.', flush=True)
    try: server.serve_forever()
    except KeyboardInterrupt: pass
    finally: server.server_close()
