import type {IdentityEnv,ControlHttpPort} from './identity-types';
import type {RuntimeConfig} from './control-contracts';
import {createControlPlane} from './control-runtime';
import {PublicRoom as PublicRoomBase} from './public-room';
import {PrivateRoom as PrivateRoomBase} from './private-room';
import {responseControlPort} from './control-transport';
import {controlBudget} from './host-budget';
import {demoInstallationProfile} from './installation-profile';
import {publicPolicy,publicCatalog} from './runtime-config';
import type {AssetPort} from './site-assets';

export interface CloudflareHostEnv extends IdentityEnv {
 ASSETS:AssetPort;
 CONTROL:DurableObjectNamespace<ControlPlane>;
 PUBLIC_ROOMS:DurableObjectNamespace<PublicRoom>;
 PRIVATE_ROOMS:DurableObjectNamespace<PrivateRoom>;
}
export function cfControl(env:Pick<CloudflareHostEnv,'CONTROL'>):ControlHttpPort {
 return responseControlPort((action,input)=>env.CONTROL.getByName('control').fetch(new Request('https://control/'+action,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(input)})));
}
function cfBudget(env:unknown){return controlBudget(cfControl(env as CloudflareHostEnv));}
export class ControlPlane extends createControlPlane(env=>({
 bootstrapEmail:env.ADMIN_BOOTSTRAP_EMAIL,
 installation:{enforcement_version:1,profile:demoInstallationProfile()},
 enforcement:{version:1,ready:()=>Boolean('CONTROL' in env&&'PUBLIC_ROOMS' in env&&'PRIVATE_ROOMS' in env)}
})){}
export class PublicRoom extends PublicRoomBase {
 private appliedRevision=0;
 constructor(ctx:DurableObjectState,env:CloudflareHostEnv){super(ctx,env,{budgetFactory:cfBudget});}
 applyConfiguration(config:RuntimeConfig){if(config.revision<=this.appliedRevision)return;this.core.configure(config.revision,publicPolicy(config),publicCatalog(config));this.appliedRevision=config.revision;}
}
export class PrivateRoom extends PrivateRoomBase {
 constructor(ctx:DurableObjectState,env:CloudflareHostEnv){super(ctx,env,{budgetFactory:cfBudget});}
}
