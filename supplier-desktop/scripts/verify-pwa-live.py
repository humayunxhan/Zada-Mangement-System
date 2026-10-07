"""Read-only deployment checks; no UI and no financial test writes."""
from pathlib import Path
import json, urllib.request, urllib.error, hashlib, concurrent.futures, os
ROOT=Path(__file__).resolve().parents[1]
BASE='https://spms.zadapharmacy.com'
paths=['/','/manifest.webmanifest','/sw.js','/offline.html','/icons/spms-192.png','/icons/spms-512.png','/icons/spms-maskable-512.png','/icons/apple-touch-icon.png']
paths += ['/assets/'+p.name for p in (ROOT/'dist-php/assets').iterdir()]
def fetch(path,data=None,token=None):
 headers={'Content-Type':'application/json'}
 if token:headers['Authorization']='Bearer '+token
 request=urllib.request.Request(BASE+path,headers=headers,data=json.dumps(data).encode() if data else None)
 try:res=urllib.request.urlopen(request,timeout=25)
 except urllib.error.HTTPError as err:res=err
 return res.status,res.headers,res.read()
def verify_file(path):
 status,headers,body=fetch(path)
 assert status==200,path
 if path in ['/', '/offline.html', '/sw.js', '/manifest.webmanifest']:
  assert 'noindex' in headers.get('X-Robots-Tag',''),path
 local=ROOT/'dist-php'/('index.html' if path=='/' else path.lstrip('/'))
 if path.endswith('.png'):
  import struct
  assert body[:8]==b'\x89PNG\r\n\x1a\n'
  assert struct.unpack('>II',body[16:24])==struct.unpack('>II',local.read_bytes()[16:24]), 'Icon dimension mismatch'
 else:
  assert hashlib.sha256(body).digest()==hashlib.sha256(local.read_bytes()).digest(), 'Deployment mismatch: '+path
 if path.endswith('webmanifest'):assert 'manifest+json' in headers.get('Content-Type','')
 if path.endswith('.js'):assert 'javascript' in headers.get('Content-Type','')
 return 'PASS: '+path
with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
 for result in pool.map(verify_file,paths):print(result)
assert fetch('/api/bills')[0]==401
assert fetch('/api/config.php')[0]==403
assert fetch('/api/finance.php')[0]==403
assert fetch('/api/ledger.php')[0]==403
credentials=json.loads(Path(os.environ.get('SPMS_LOGIN_FILE',ROOT/'deploy/initial-login.credentials.json')).read_text())
status,_,raw=fetch('/api/auth/login',{'username':credentials['username'],'password':credentials['password']})
assert status==200,'Login failed (do not reset credentials automatically)'
token=json.loads(raw)['token']
status,headers,raw=fetch('/api/bills',token=token)
assert status==200 and isinstance(json.loads(raw),list)
assert 'no-store' in headers.get('Cache-Control','')
for bill in json.loads(raw):
 for key in ['net_payable','remaining_balance','pending_credit','returned_amount','ledgerEvents','credit_applied']:
  assert key in bill, 'Missing ledger response field: '+key
 if bill['category']=='PAYABLE':
  effective=bill['paid_amount']+bill['credit_applied']-bill['refund_amount']-bill['credit_used']
  assert abs(bill['remaining_balance']-max(0,bill['net_payable']-effective))<0.005
status,_,raw=fetch('/api/returns/sync-status',token=token)
assert status==200 and json.loads(raw)['enabled'] is False
print('PASS: login, authenticated bill read, unauthorized protection and no-store API.')
print('PASS: ledger response balances, protected includes and disabled external sync.')
for url in ['https://zadapharmacy.com/','https://drbakhtzada.com/']:
 with urllib.request.urlopen(url,timeout=25) as response:assert response.status==200
 print('PASS: existing site available:',url)
print('Live mobile/PWA release verified without browser UI or financial writes.')
