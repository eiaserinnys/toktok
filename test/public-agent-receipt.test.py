import contextlib,importlib.util,io,json,pathlib,unittest,urllib.error
from unittest.mock import patch
spec=importlib.util.spec_from_file_location('public_agent',pathlib.Path(__file__).parents[1]/'scripts/public-agent.py')
client=importlib.util.module_from_spec(spec);spec.loader.exec_module(client)
class Response:
 def __init__(self,status,data,raw=False):self.status=status;self.headers={};self.body=data.encode() if raw else json.dumps(data).encode()
 def __enter__(self):return self
 def __exit__(self,*args):pass
 def read(self):return self.body
class ReceiptTests(unittest.TestCase):
 def scenario(self,visible=True,uncertain=False):
  calls=[];receipt={};output=io.StringIO();cursor='11111111-1111-4111-8111-111111111111:3'
  def urlopen(request,**kwargs):
   path=request.full_url;method=request.get_method();calls.append((method,path))
   if '/public/common-room' in path and '/api/' not in path:return Response(200,'connection-requests',True)
   if path.endswith('/connection-requests'):return Response(201,{'verification_uri':'https://example.test/public/common-room?connect=fixture','expires_at':'2099-01-01T00:00:00Z'})
   if path.endswith('/connection-request'):
    return Response(200,{'status':'revoked' if method=='DELETE' else 'approved','operator_grant':'fixture-grant'})
   if path.endswith('/participants'):return Response(201,{'lease_token':'fixture-lease'})
   if path.endswith('/messages') and method=='POST':
    if uncertain:raise urllib.error.URLError('fixture lost response')
    sent=json.loads(request.data);receipt.update(sent,sequence=3,cursor=cursor,created_at='2026-10-03T00:00:00Z');return Response(201,receipt)
   if '/messages?after=' in path:return Response(200,{'messages':[receipt] if visible else [],'history_status':'ok' if visible else 'history_reset'})
   raise AssertionError('Unexpected request')
  failure=None
  with patch.object(client.sys,'argv',['public-agent.py','https://example.test/public/common-room','--message','Fictional receipt test']),patch.object(client.urllib.request,'urlopen',side_effect=urlopen),contextlib.redirect_stdout(output):
   try:client.main()
   except (RuntimeError,urllib.error.URLError) as e:failure=e
  self.assertEqual(sum(method=='POST' and path.endswith('/messages') for method,path in calls),1)
  self.assertEqual(calls[-1],('DELETE','https://example.test/api/public/rooms/common-room/connection-request'))
  self.assertNotIn('fixture-grant',output.getvalue());self.assertNotIn('fixture-lease',output.getvalue())
  return output.getvalue(),failure,cursor
 def test_receipt_and_feed_both_required(self):
  out,failure,cursor=self.scenario();self.assertIsNone(failure);self.assertIn(cursor,out);self.assertIn('client_message_id',out);self.assertIn('POSTED:',out)
 def test_accepted_but_reset_does_not_report_posted_or_resend(self):
  out,failure,_=self.scenario(visible=False);self.assertIn('ACCEPTED ',out);self.assertNotIn('POSTED:',out);self.assertEqual(str(failure),'ACCEPTED_BUT_FEED_UNCONFIRMED_NO_REPOST')
 def test_uncertain_post_is_not_retried(self):
  out,failure,_=self.scenario(uncertain=True);self.assertIsInstance(failure,urllib.error.URLError);self.assertNotIn('POSTED:',out)
if __name__=='__main__':unittest.main()
