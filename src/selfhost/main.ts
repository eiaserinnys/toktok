import {openBackend} from './backend';
import {createApplication} from './application';
import {RepositoryError} from '../storage/repository';
import {publicOrigin} from '../http';
import {once} from 'node:events';
import {configuredSmtp} from './smtp';
async function main(){
  if(process.versions.node.split('.')[0]!=='24')throw new RepositoryError('NODE24_REQUIRED');
  const command=process.argv[2];if(!['start','check','apply','migrate','backup'].includes(command))throw new RepositoryError('EXPLICIT_COMMAND_REQUIRED');
  const backend=process.env.TOKTOK_BACKEND;if(backend!=='sqlite'&&backend!=='postgres')throw new RepositoryError('CONFIGURATION_REQUIRED');
  let origin:string|undefined,port:number|undefined;
  if(command==='start'){if(!process.env.PUBLIC_ORIGIN||!process.env.PORT)throw new RepositoryError('CONFIGURATION_REQUIRED');origin=publicOrigin(process.env.PUBLIC_ORIGIN);port=Number(process.env.PORT);if(!Number.isSafeInteger(port)||port<1||port>65535)throw new RepositoryError('CONFIGURATION_REQUIRED');}
  const result=await openBackend({backend,sqliteFile:process.env.TOKTOK_SQLITE_FILE,dsnFile:process.env.TOKTOK_DSN_FILE,dsn:process.env.TOKTOK_PG_DSN,schema:process.env.TOKTOK_PG_SCHEMA},command as 'start'|'check'|'apply'|'migrate'|'backup',process.env.TOKTOK_BACKUP_FILE);
  if(command!=='start'){process.stdout.write(JSON.stringify({command,state:result.state})+'\n');return;}
  let email:Awaited<ReturnType<typeof configuredSmtp>>,app:ReturnType<typeof createApplication>|undefined;
  try{email=await configuredSmtp(process.env.TOKTOK_SMTP_CONFIG_FILE);app=createApplication({origin:origin!,repo:result.repo!,bootstrapEmail:process.env.ADMIN_BOOTSTRAP_EMAIL,email:email?.identity,hostClose:()=>email?.close(),assets:process.env.TOKTOK_ASSETS,trustedProxyCidrs:process.env.TOKTOK_TRUSTED_PROXY_CIDRS?.split(',').filter(Boolean)});
    await app.prepare();
    app.server.listen(port!,'0.0.0.0');await once(app.server,'listening');const started=app;let stopping=false;const stop=()=>{if(stopping)return;stopping=true;void started.stop().catch(()=>{process.exitCode=1;});};process.once('SIGTERM',stop);process.once('SIGINT',stop);
  }catch{if(app)await app.stop();else{email?.close();await result.repo!.close();}throw new RepositoryError('STARTUP_FAILED');}
}
void main().catch(error=>{process.stderr.write(JSON.stringify({error:error instanceof RepositoryError?error.code:'STARTUP_FAILED'})+'\n');process.exitCode=1;});
