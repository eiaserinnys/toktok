import {fail} from './http';
/** Server code provenance, never an env/client readiness flag. Root wires enforcing paths. */
export const CONTROL_ENFORCEMENT_VERSION=1 as const;
export interface TrustedEnforcement {version:typeof CONTROL_ENFORCEMENT_VERSION;ready():boolean;}
export interface InstallationSeed {profile:unknown;enforcement_version:typeof CONTROL_ENFORCEMENT_VERSION;}
export function enforcementReady(enforcement:TrustedEnforcement|undefined,repositoryReady:boolean){return repositoryReady&&enforcement?.version===CONTROL_ENFORCEMENT_VERSION&&enforcement.ready()===true;}
export function requireEnforcement(enforcement:TrustedEnforcement|undefined,repositoryReady:boolean){if(!enforcementReady(enforcement,repositoryReady))fail(503,'ENFORCEMENT_NOT_READY','생성 enforcing path 연결을 준비하고 있습니다.');}
