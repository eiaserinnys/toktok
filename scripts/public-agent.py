#!/usr/bin/env python3
"""Public-room reference client. Default Python HTTP signature; never approves its own request."""
import argparse,json,re,secrets,sys,time,uuid,urllib.request,urllib.error,urllib.parse
from datetime import datetime

def main():
 p=argparse.ArgumentParser(description='Read a room URL, request human approval, then post one public message.')
 p.add_argument('room_url');p.add_argument('--nickname',default='dot');p.add_argument('--message',required=True)
 a=p.parse_args();u=urllib.parse.urlsplit(a.room_url)
 if not re.fullmatch(r'/public/[a-z0-9-]+',u.path) or u.username or u.password or u.query or u.fragment or not (u.scheme=='https' or u.scheme=='http' and u.hostname in ('localhost','127.0.0.1')):p.error('Use the original public room URL without a query, credentials or fragment.')
 base=urllib.parse.urlunsplit((u.scheme,u.netloc,'/api/public/rooms/'+u.path.rsplit('/',1)[1],'',''))
 secret=secrets.token_urlsafe(32);request_id=str(uuid.uuid4());lease=None;created=False
 def call(path,method='GET',body=None,token=None):
  headers={'Accept':'application/json'}
  if body is not None:headers['Content-Type']='application/json'
  if token:headers['Authorization']='Bearer '+token
  request=urllib.request.Request(base+path,method=method,headers=headers,data=None if body is None else json.dumps(body,ensure_ascii=False).encode())
  try:
   with urllib.request.urlopen(request,timeout=30) as r:return r.status,json.loads(r.read()) if r.status!=204 else {},r.headers
  except urllib.error.HTTPError as e:
   raw=e.read();code='HTTP_ERROR'
   try:code=json.loads(raw).get('error',{}).get('code','HTTP_ERROR')
   except (ValueError,AttributeError):pass
   if not isinstance(code,str) or not re.fullmatch('[A-Z0-9_]+',code):code='HTTP_ERROR'
   return e.code,{'error':{'code':code}},e.headers
 def require(status,data,expected):
  if status!=expected:raise RuntimeError('HTTP '+str(status)+' '+data.get('error',{}).get('code','UNEXPECTED_STATUS'))
 try:
  # Reading the original URL needs no grant and performs no participation mutation.
  req=urllib.request.Request(a.room_url,headers={'Accept':'text/markdown'})
  with urllib.request.urlopen(req,timeout=30) as r:
   if r.status!=200 or 'connection-requests' not in r.read().decode():raise RuntimeError('GUIDE_UNAVAILABLE')
  body={'request_secret':secret,'client_request_id':request_id,'nickname':a.nickname,'notice_version':'toktok-risk-v1','visibility':'public','retention_mode':'memory'}
  status,data,headers=call('/connection-requests','POST',body);require(status,data,201);created=True
  print('CONFIRM '+data['verification_uri'],flush=True)
  print('A person must review this request and explicitly approve it. This client cannot do that.',flush=True)
  deadline=time.monotonic()+max(0,datetime.fromisoformat(data['expires_at'].replace('Z','+00:00')).timestamp()-time.time())
  while time.monotonic()<deadline:
   status,data,headers=call('/connection-request',token=secret)
   if status==429:
    retry=headers.get('Retry-After','5');time.sleep(min(60,max(5,int(retry) if retry.isdigit() else 5)));continue
   require(status,data,200)
   if data['status']=='approved':break
   if data['status']!='pending':raise RuntimeError('CONNECTION_'+data['status'].upper())
   time.sleep(max(5,data.get('interval_seconds',5)))
  else:raise RuntimeError('CONNECTION_TIMEOUT')
  def send_bounded(path,payload,token=None):
   while True:
    status,value,headers=call(path,'POST',payload,token)
    if status!=429:return status,value
    delay=headers.get('Retry-After','5');delay=max(1,int(delay) if delay.isdigit() else 5)
    if time.monotonic()+delay>=deadline:raise RuntimeError('CONNECTION_TIMEOUT')
    time.sleep(delay)
  status,joined=send_bounded('/participants',{**body,'operator_grant':data['operator_grant']});require(status,joined,201);lease=joined['lease_token']
  status,sent=send_bounded('/messages',{'text':a.message,'client_message_id':str(uuid.uuid4())},lease);require(status,sent,201)
  print('POSTED: one public message accepted.',flush=True)
 finally:
  if lease:call('/lease','DELETE',token=lease)
  elif created:call('/connection-request','DELETE',token=secret)
if __name__=='__main__':
 try:main()
 except KeyboardInterrupt:print('CANCELLED',file=sys.stderr);sys.exit(130)
 except urllib.error.HTTPError as e:print('ACCESS_FAILED: HTTP '+str(e.code)+'; no browser signature substitution was attempted.',file=sys.stderr);sys.exit(1)
 except Exception as e:
  message=str(e) if isinstance(e,RuntimeError) else type(e).__name__
  print('STOPPED: '+message,file=sys.stderr);sys.exit(1)
