#!/usr/bin/env python3
"""Dependency-free local Eco Lab server with SQLite persistence and session isolation."""
import argparse
import json
import os
import secrets
import sqlite3
from http.cookies import SimpleCookie
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit
from backend.demo_game import execute, new_game, public_state
from backend.eco_rules import RuleError

ROOT = Path(__file__).resolve().parent


class Handler(SimpleHTTPRequestHandler):
    extensions_map = {**SimpleHTTPRequestHandler.extensions_map,
                      ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8"}

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT / "frontend"), **kwargs)

    def log_message(self, *args):
        pass

    def _session(self):
        cookies = SimpleCookie()
        try:
            cookies.load(self.headers.get("Cookie", ""))
        except Exception:
            pass
        token = cookies.get("eco_sid")
        sid = token.value if token else ""
        if len(sid) != 43 or not all(c.isalnum() or c in "_-" for c in sid):
            sid = secrets.token_urlsafe(32)
        return sid

    def reply(self, code, payload, sid=None):
        data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        if sid:
            self.send_header("Set-Cookie", f"eco_sid={sid}; Path=/; HttpOnly; SameSite=Strict")
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        path = urlsplit(self.path).path
        if path == "/api/state":
            sid = self._session()
            with sqlite3.connect(self.server.db_path) as db:
                row = db.execute("SELECT state FROM games WHERE sid=?", (sid,)).fetchone()
            return self.reply(200, {"state": public_state(json.loads(row[0])) if row else None}, sid)
        if path.startswith("/api/"):
            return self.reply(404, {"error": "Unknown endpoint"})
        return super().do_GET()

    def do_POST(self):
        path = urlsplit(self.path).path
        if path not in ("/api/new", "/api/action"):
            return self.reply(404, {"error": "Unknown endpoint"})
        origin = self.headers.get("Origin")
        if origin and urlsplit(origin).netloc != self.headers.get("Host"):
            return self.reply(403, {"error": "Cross-origin request rejected"})
        if self.headers.get_content_type() != "application/json":
            return self.reply(415, {"error": "Use application/json"})
        try:
            size = int(self.headers.get("Content-Length", "0"))
            if not 0 < size <= 4096:
                return self.reply(413, {"error": "Invalid request size"})
            body = json.loads(self.rfile.read(size))
            if not isinstance(body, dict):
                raise ValueError()
        except (ValueError, UnicodeDecodeError):
            return self.reply(400, {"error": "Invalid JSON object"})
        sid = self._session()
        try:
            with sqlite3.connect(self.server.db_path, timeout=10) as db:
                db.execute("BEGIN IMMEDIATE")
                if path == "/api/new":
                    if type(body.get("eco_enabled", True)) is not bool:
                        raise RuleError("eco_enabled must be a boolean")
                    state = new_game(body.get("eco_enabled", True))
                else:
                    row = db.execute("SELECT state FROM games WHERE sid=?", (sid,)).fetchone()
                    if not row:
                        raise RuleError("Start a new scenario first")
                    state = execute(json.loads(row[0]), body.get("id"), body.get("revision"))
                db.execute("INSERT INTO games(sid,state) VALUES(?,?) ON CONFLICT(sid) DO UPDATE SET state=excluded.state",
                           (sid, json.dumps(state)))
            return self.reply(200, {"state": public_state(state)}, sid)
        except RuleError as error:
            return self.reply(409, {"error": str(error)}, sid)
        except sqlite3.Error:
            return self.reply(503, {"error": "Save unavailable; retry shortly"}, sid)


def make_server(host="127.0.0.1", port=3001, db_path=None):
    path = str(db_path or os.environ.get("ECO_DB_PATH", ROOT / "eco.sqlite3"))
    with sqlite3.connect(path) as db:
        db.execute("CREATE TABLE IF NOT EXISTS games (sid TEXT PRIMARY KEY, state TEXT NOT NULL)")
    server = ThreadingHTTPServer((host, port), Handler)
    server.db_path = path
    return server


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=int(os.environ.get("PORT", "3001")))
    parser.add_argument("--strictPort", action="store_true", help=argparse.SUPPRESS)
    args = parser.parse_args()
    server = make_server(args.host, args.port)
    print(f"Brassworld Eco Lab: http://{args.host}:{server.server_port}", flush=True)
    print("Two-player hotseat scenario. This is not the full original rules engine.", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
