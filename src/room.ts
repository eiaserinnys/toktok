import { DurableObject } from 'cloudflare:workers';
import { type Env, type RoomRow, type Participant, type MessageRow, type Capability, type NewRoom, roomView, messageView } from './contracts';
import { HttpError, fail, bad, limited, json, errorResponse, bearer, hash, newToken, body, text, integer, queryInt, publicOrigin } from './http';
import { guide } from './guide';
interface Waiter { hash: string; wake: () => void; }
export class Room extends DurableObject<Env> {
  private waiters=new Set<Waiter>();
  private get sql() {return this.ctx.storage.sql;}

  async initialize(input: NewRoom) {
    return this.ctx.blockConcurrencyWhile(async()=>{
      const now=Date.now();
      this.ctx.storage.transactionSync(()=>{
        this.sql.exec(`CREATE TABLE room (id TEXT PRIMARY KEY, purpose TEXT NOT NULL, creator_id TEXT NOT NULL, created_at TEXT NOT NULL, expires_at INTEGER NOT NULL, status TEXT NOT NULL, invite_hash TEXT NOT NULL, read_hash TEXT NOT NULL, owner_hash TEXT NOT NULL);
          CREATE TABLE participants (id TEXT PRIMARY KEY, nickname TEXT NOT NULL, token_hash TEXT NOT NULL UNIQUE);
          CREATE TABLE messages (sequence INTEGER PRIMARY KEY, sender_id TEXT NOT NULL, text TEXT NOT NULL, client_message_id TEXT NOT NULL, reply_to INTEGER, created_at TEXT NOT NULL, UNIQUE(sender_id, client_message_id));
          CREATE INDEX message_time ON messages(created_at);`);
        this.sql.exec('INSERT INTO room VALUES(?,?,?,?,?,?,?,?,?)',input.id,input.purpose,input.creator_id,new Date(now).toISOString(),now+input.ttl_seconds*1000,'open',input.invite_hash,input.read_hash,input.owner_hash);
      });
      await this.ctx.storage.setAlarm(now+input.ttl_seconds*1000);
      return roomView(this.snapshot());
    });
  }
  private stored(): RoomRow | undefined {
    if(this.sql.exec("SELECT name FROM sqlite_master WHERE type='table' AND name='room'").toArray().length===0) return undefined;
    return this.sql.exec('SELECT * FROM room').toArray()[0] as unknown as RoomRow | undefined;
  }
  private snapshot(): RoomRow {
    const r=this.stored();
    if(!r||Date.now()>=r.expires_at) fail(410,'ROOM_GONE','방이 만료되었거나 삭제되었습니다.');
    return r;
  }
  private async live(): Promise<RoomRow> {
    const r=this.stored();
    if(r&&Date.now()>=r.expires_at) await this.erase();
    return this.snapshot();
  }
  private open(): RoomRow {
    const r=this.snapshot(); if(r.status==='closed') fail(410,'ROOM_CLOSED','종료된 방입니다.'); return r;
  }
  private async erase(): Promise<void> {
    await this.ctx.blockConcurrencyWhile(()=>this.ctx.storage.deleteAll());
    this.wakeAll();
  }
  private wakeAll() {for(const waiter of this.waiters) waiter.wake();}
  async alarm(): Promise<void> {
    const r=this.stored();
    if(!r||Date.now()>=r.expires_at) await this.erase();
    else await this.ctx.storage.setAlarm(r.expires_at);
  }
  private capability(r: RoomRow, fingerprint: string): Capability {
    if(fingerprint===r.invite_hash) return {role:'invite',hash:fingerprint};
    if(fingerprint===r.read_hash) return {role:'read',hash:fingerprint};
    if(fingerprint===r.owner_hash) return {role:'owner',hash:fingerprint};
    const p=this.sql.exec('SELECT * FROM participants WHERE token_hash=?',fingerprint).toArray()[0] as unknown as Participant | undefined;
    if(p) return {role:'participant',hash:fingerprint,sender:p};
    return fail(403,'CAPABILITY_DENIED','방 권한이 없습니다.');
  }
  private require(cap: Capability, role: Capability['role']) {if(cap.role!==role) fail(403,'CAPABILITY_DENIED','이 동작에 필요한 권한이 없습니다.');}
  async fetch(request: Request): Promise<Response> {
    try {
      const url=new URL(request.url);
      const guideMatch=/^\/r\/[^/]+\/([\w-]{43})$/.exec(url.pathname);
      const token=guideMatch ? guideMatch[1] : bearer(request);
      const fingerprint=await hash(token);
      const r=await this.live();
      const cap=this.capability(r,fingerprint);
      if(guideMatch) {
        if(cap.role!=='invite'&&cap.role!=='read') fail(403,'CAPABILITY_DENIED','공유 링크 권한이 없습니다.');
        if(url.searchParams.get('format')==='md'||request.headers.get('Accept')?.includes('text/markdown')) return new Response(guide(this.snapshot(),cap,publicOrigin(this.env.PUBLIC_ORIGIN),token),{headers:{'Content-Type':'text/markdown; charset=utf-8'}});
        return new Response('디자인 준비 중\n',{headers:{'Content-Type':'text/plain; charset=utf-8'}});
      }
      const path=url.pathname.split('/').slice(4).join('/');
      if(path==='' && request.method==='GET') return json({room:roomView(this.snapshot()),permissions:{read:true,join:cap.role==='invite'&&r.status==='open',write:cap.role==='participant'&&r.status==='open',manage:cap.role==='owner'}});
      if(path==='participants'&&request.method==='POST') {this.require(cap,'invite');return await this.join(request);}
      if(path==='messages'&&request.method==='POST') {this.require(cap,'participant');return await this.send(request,cap.sender!);}
      if((path==='messages'||path==='wait')&&request.method==='GET') {
        const after=queryInt(url,'after',0,0,Number.MAX_SAFE_INTEGER),limit=queryInt(url,'limit',100,1,100);
        if(path==='wait') return await this.wait(request,cap,after,limit,queryInt(url,'timeout',25,0,25));
        return json(this.page(after,limit));
      }
      if(path==='close'&&request.method==='POST') {
        this.require(cap,'owner'); this.snapshot(); this.sql.exec("UPDATE room SET status='closed'"); this.wakeAll();
        return json({room:roomView(this.snapshot())});
      }
      if(path===''&&request.method==='DELETE') {this.require(cap,'owner');await this.erase();return new Response(null,{status:204});}
      return fail(404,'NOT_FOUND','경로가 없습니다.');
    } catch(error) {
      if(error instanceof HttpError&&error.code==='ROOM_GONE') {
        const r=this.stored(); if(r&&Date.now()>=r.expires_at) await this.erase();
      }
      return errorResponse(error);
    }
  }
  private async join(request: Request): Promise<Response> {
    const input=await body(request,['nickname']);
    const nickname=text(input.nickname,1,64),token=newToken(),token_hash=await hash(token),id=crypto.randomUUID();
    this.ctx.storage.transactionSync(()=>{
      this.open();
      if(Number(this.sql.exec('SELECT COUNT(*) AS n FROM participants').one().n)>=64) limited();
      this.sql.exec('INSERT INTO participants VALUES(?,?,?)',id,nickname,token_hash);
    });
    return json({sender:{id,nickname},participant_token:token},201);
  }
  private async send(request: Request, sender: Participant): Promise<Response> {
    const input=await body(request,['text','client_message_id','reply_to']);
    const content=text(input.text,1,32768),id=text(input.client_message_id,1,128);
    if(new TextEncoder().encode(content).byteLength>16384) fail(413,'MESSAGE_TOO_LARGE','메시지는 최대 UTF-8 16KiB입니다.');
    const reply=input.reply_to===undefined||input.reply_to===null ? null : integer(input.reply_to,1,Number.MAX_SAFE_INTEGER);
    const result=this.ctx.storage.transactionSync(()=>{
      this.open();
      const original=this.sql.exec('SELECT m.*,p.nickname FROM messages m JOIN participants p ON p.id=m.sender_id WHERE m.sender_id=? AND client_message_id=?',sender.id,id).toArray()[0] as unknown as MessageRow | undefined;
      if(original) {
        if(original.text!==content||original.reply_to!==reply) fail(409,'IDEMPOTENCY_CONFLICT','같은 메시지 ID로 다른 내용을 보낼 수 없습니다.');
        return {message:messageView(original),status:200};
      }
      if(reply!==null&&this.sql.exec('SELECT sequence FROM messages WHERE sequence=?',reply).toArray().length===0) bad();
      const count=Number(this.sql.exec('SELECT COUNT(*) AS n FROM messages').one().n);
      if(count>=10000) limited();
      const since=new Date(Date.now()-60000).toISOString();
      const recent=this.sql.exec('SELECT COUNT(*) AS total,SUM(CASE WHEN sender_id=? THEN 1 ELSE 0 END) AS sender FROM messages WHERE created_at>?',sender.id,since).one();
      if(Number(recent.total)>=120||Number(recent.sender)>=30) limited();
      const sequence=Number(this.sql.exec('SELECT COALESCE(MAX(sequence),0)+1 AS sequence FROM messages').one().sequence);
      const created_at=new Date().toISOString();
      this.sql.exec('INSERT INTO messages VALUES(?,?,?,?,?,?)',sequence,sender.id,content,id,reply,created_at);
      return {message:messageView({sequence,sender_id:sender.id,nickname:sender.nickname,text:content,client_message_id:id,reply_to:reply,created_at}),status:201};
    });
    if(result.status===201) this.wakeAll();
    return json(result.message,result.status);
  }
  private page(after: number,limit: number) {
    const r=this.snapshot();
    const max=Number(this.sql.exec('SELECT COALESCE(MAX(sequence),0) AS n FROM messages').one().n);
    if(after>max) bad();
    const rows=this.sql.exec('SELECT m.*,p.nickname FROM messages m JOIN participants p ON p.id=m.sender_id WHERE sequence>? ORDER BY sequence LIMIT ?',after,limit+1).toArray() as unknown as MessageRow[];
    const has_more=rows.length>limit,messages=rows.slice(0,limit).map(messageView);
    return {messages,cursor:messages.at(-1)?.sequence ?? after,has_more,room_status:r.status};
  }
  private async wait(request: Request, cap: Capability, after: number,limit: number,timeout: number): Promise<Response> {
    const initial=this.page(after,limit);
    if(initial.messages.length) return json(initial);
    if(initial.room_status==='closed') fail(410,'ROOM_CLOSED','종료된 방입니다.');
    if(request.signal.aborted) fail(499,'REQUEST_ABORTED','요청이 취소되었습니다.');
    if(timeout===0) return json(initial);
    if(this.waiters.size>=32||Array.from(this.waiters).filter(w=>w.hash===cap.hash).length>=8) limited();
    const deadline=Math.min(Date.now()+timeout*1000,this.snapshot().expires_at);
    let wake!:()=>void;
    const notification=new Promise<void>(resolve=>{wake=resolve;});
    const waiter:Waiter={hash:cap.hash,wake};
    // No await between initial page inspection and registration: a write cannot interleave.
    this.waiters.add(waiter);
    const timer=setTimeout(wake,Math.max(0,deadline-Date.now()));
    request.signal.addEventListener('abort',wake,{once:true});
    try {
      await notification;
      if(request.signal.aborted) fail(499,'REQUEST_ABORTED','요청이 취소되었습니다.');
      await this.live();
      const result=this.page(after,limit);
      if(!result.messages.length&&result.room_status==='closed') fail(410,'ROOM_CLOSED','종료된 방입니다.');
      return json(result);
    } finally {
      clearTimeout(timer); this.waiters.delete(waiter); request.signal.removeEventListener('abort',wake);
    }
  }
}
