"""HTTP integration test; run against a disposable local server on TEST_URL."""
import http.cookiejar, json, os
from urllib.request import build_opener, HTTPCookieProcessor, Request
from urllib.error import HTTPError
base=os.environ.get('TEST_URL','http://127.0.0.1:3012')
client=build_opener(HTTPCookieProcessor(http.cookiejar.CookieJar()))
def api(path,body=None):
    req=Request(base+'/api/'+path,data=json.dumps(body).encode() if body is not None else None,headers={'Content-Type':'application/json'})
    try:
        with client.open(req) as r:return r.status,json.load(r)
    except HTTPError as e:return e.code,json.load(e)
status,s=api('new',{'mode':'combined'});assert status==200 and s['mode']=='combined'
save=s['save']; assert s['currency']=='USD'; assert save['signature']; assert len(s['actions'])>200
assert api('load',{'save':save})[1]['save']==save
bad=json.loads(json.dumps(save));bad['game']['players'][0]['money']+=100
assert api('load',{'save':bad})[0]==400
assert api('action',{'v':s['ver'],'i':-1})[0]==400
assert api('pass',{'v':0})[1]['stale']
assert api('settings',{'hints':True})[1]['hints']
for r in range(1,9):
    assert s['round']==r and s['era']=='BOTH'
    a=next((a for a in s['actions'] if a['kind']=='NETWORK'),s['actions'][0])
    status,s=api('action',{'v':s['ver'],'i':a['i']});assert status==200,(status,s)
    assert all(t['city'] for t in s['placed'])
assert s['over'] and s['round']==8
assert '£' not in json.dumps(s,ensure_ascii=False)
assert all(p['vp']==sum(s['vpBreak'][str(p['id'])].values()) for p in s['players'])
assert api('pass',{'v':s['ver']})[0]==400
assert not any('\u4e00'<=ch<='\u9fff' for ch in json.dumps(s,ensure_ascii=False))
print('PASS HTTP new/action/settings/stale/invalid/save/load/tamper rejection, eight rounds, scoring and English payloads')
