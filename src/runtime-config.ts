import type {ControlHttpPort} from './identity-types';
import type {RuntimeConfig} from './control-contracts';
import {validateSettings,runtimePublicPolicy} from './settings-schema';
import {fail} from './http';

/** Bounded staleness only for runtime settings. Authorization always queries the domain. */
export class RuntimeSettings {
 private value?:RuntimeConfig;private expires=0;private pending?:Promise<RuntimeConfig>;
 constructor(private readonly control:ControlHttpPort,private readonly clock=()=>Date.now()){}
 async get():Promise<RuntimeConfig>{
  if(this.value&&this.clock()<this.expires)return this.value;
  if(!this.pending)this.pending=(async()=>{
   const data=await this.control.execute('get-runtime-config',{}) as RuntimeConfig;
   if(!data||!Number.isSafeInteger(data.revision)||data.revision<1||!data.readiness)fail(503,'SETTINGS_INVALID','서버 설정을 확인하지 못했습니다.');
   const result={...data,settings:validateSettings(data.settings)};
   publicPolicy(result);this.value=result;this.expires=this.clock()+10000;return result;
  })().finally(()=>{this.pending=undefined;});
  return this.pending;
 }
 invalidate(){this.expires=0;}
}
export function publicPolicy(config:RuntimeConfig){return runtimePublicPolicy(config.settings);}
export function publicCatalog(config:RuntimeConfig){return config.settings.public.catalog.filter(r=>r.enabled).map(({slug,title})=>({slug,title}));}
export function requireRuntime(config:RuntimeConfig){if(!config.settings.deployment.enabled||!config.readiness.budget_ready||!config.readiness.lifecycle_ready)fail(503,'SERVICE_UNAVAILABLE','서비스를 준비하고 있습니다.');}
