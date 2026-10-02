#!/usr/bin/env python3
"""Two independent HTTP clients, using curl for every network operation.
No Worker imports, database access, model execution or real team data.
"""
import argparse
import json
import os
import subprocess
from urllib.parse import urlparse


def require(condition, message):
    if not condition:
        raise AssertionError(message)


def curl(url, token=None, method='GET', body=None, expected=200):
    config = ['silent', 'show-error', 'max-time = 30', 'url = ' + json.dumps(url),
              'request = ' + json.dumps(method), 'write-out = "\\n%{http_code}"']
    if token:
        config.append('header = ' + json.dumps('Authorization: Bearer ' + token))
    if body is not None:
        config.append('header = "Content-Type: application/json"')
        config.append('data = ' + json.dumps(json.dumps(body, ensure_ascii=False), ensure_ascii=False))
    result = subprocess.run(['curl', '--config', '-'], input='\n'.join(config), text=True,
                            capture_output=True, timeout=35, check=True)
    content, status = result.stdout.rsplit('\n', 1)
    require(int(status) == expected, f'HTTP contract mismatch: expected {expected}, got {status}')
    return content


class Client:
    def __init__(self, invite_url, nickname):
        # Each participant independently reads the link and discovers its API address.
        guide = curl(invite_url + '?format=md')
        base = next(line.removeprefix('API: ') for line in guide.splitlines() if line.startswith('API: '))
        require('/wait?after=' in guide and 'client_message_id' in guide, 'guide is incomplete')
        self.base, self.cursor = base, 0
        invite = urlparse(invite_url).path.split('/')[-1]
        joined = json.loads(curl(base + '/participants', invite, 'POST', {'nickname': nickname}, 201))
        self.token, self.sender = joined['participant_token'], joined['sender']

    def send(self, ident, text, reply=None, expected=201):
        body = {'text': text, 'client_message_id': ident}
        if reply is not None:
            body['reply_to'] = reply
        return json.loads(curl(self.base + '/messages', self.token, 'POST', body, expected))

    def receive(self):
        page = json.loads(curl(f'{self.base}/wait?after={self.cursor}&timeout=0', self.token))
        sequence = [m['sequence'] for m in page['messages']]
        require(sequence == list(range(self.cursor + 1, page['cursor'] + 1)), 'sequence gap')
        self.cursor = page['cursor']  # Save only after processing the returned page.
        return page


def run(base, creator):
    require(urlparse(base).hostname in ('localhost', '127.0.0.1', '::1'), 'acceptance is local-only')
    room = json.loads(curl(base + '/api/rooms', creator, 'POST', {'purpose': '창작 우주 우편 대화', 'ttl_seconds': 60}, 201))
    a = Client(room['invite_url'], '창작 항해자')
    b = Client(room['invite_url'], '창작 기록자')
    require(a.sender['id'] != b.sender['id'], 'participants must be independent')
    for turn in range(1, 4):
        sent = a.send(f'a-{turn}', f'창작 질문 {turn}')
        if turn == 1:
            # Simulate lost POST response: identical retry must return the original record.
            require(a.send('a-1', '창작 질문 1', expected=200) == sent, 'retry was duplicated')
        require(b.receive()['messages'][-1]['text'] == f'창작 질문 {turn}', 'B missed question')
        answer = b.send(f'b-{turn}', f'창작 응답 {turn}', sent['sequence'])
        require(a.receive()['messages'][-1] == answer, 'A missed reply')
    # B consumes its own last reply, then both clients save cursor 6.
    b.receive()
    require(a.cursor == b.cursor == 6, 'round-trip cursor mismatch')
    empty = a.receive()
    require(empty['messages'] == [] and empty['cursor'] == 6, 'timeout advanced cursor')
    # A disconnects an actual long-poll HTTP request before B sends another message.
    interrupted = subprocess.run(['curl', '--silent', '--max-time', '0.1', '--config', '-'],
        input='url = ' + json.dumps(a.base + '/wait?after=6&timeout=25') + '\nheader = ' + json.dumps('Authorization: Bearer ' + a.token),
        capture_output=True, text=True, timeout=2)
    require(interrupted.returncode == 28, 'disconnect was not exercised')
    b.send('b-reconnect', '창작 재연결 소식')
    resumed = a.receive()
    require(resumed['cursor'] == 7 and resumed['messages'][0]['text'] == '창작 재연결 소식', 'cursor resume failed')
    read = urlparse(room['read_url']).path.split('/')[-1]
    spectator = json.loads(curl(a.base + '/messages?after=6', read))
    require(spectator['cursor'] == 7, 'read-only spectator missed update')
    curl(a.base + '/participants', read, 'POST', {'nickname': '관전'}, 403)
    curl(a.base + '/close', room['owner_token'], 'POST')
    curl(a.base + '/wait?after=7', read, expected=410)
    curl(a.base, room['owner_token'], 'DELETE', expected=204)
    curl(a.base, read, expected=410)
    print('TOKTOK_CURL_ACCEPTANCE_PASS: two participants, 3 round trips, retry, disconnect/resume, read-only, close/delete')


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--base', required=True)
    args = parser.parse_args()
    run(args.base, os.environ['TOKTOK_AGENT_TOKEN'])
