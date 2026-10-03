import {DEFAULT_SETTINGS,validateSettings,type Settings} from './settings-schema';
/** Empty-database seed only. Existing administrator settings are never overwritten. */
export function demoInstallationProfile():Settings {
 const s=structuredClone(DEFAULT_SETTINGS);
 s.deployment={mode:'demo',enabled:true};s.signup.policy='invite';
 s.public.catalog=s.public.catalog.slice(0,2);
 Object.assign(s.public.policy,{participants:10,watchers:10,waits:20,handlers:32});
 s.public.agentReadCadenceSeconds=5;s.public.browserReadCadenceSeconds=2;
 Object.assign(s.private,{anonymousEnabled:true,activePerIp:2,activeGlobal:2,dailyCreates:20,anonymousDefaultTtlSeconds:1800,anonymousMaxTtlSeconds:3600,persistenceAllowed:true});
 s.identity.emailLimits.month=1000;
 s.budget={...s.budget,targetUsd:100,warningUsd:25,cutoffUsd:40,workloadCaps:[
  {kind:'admission_requests',unit:'count',day:50000,month:1000000},
  {kind:'response_bytes',unit:'bytes',day:1073741824,month:17179869184},
  {kind:'private_creates',unit:'count',day:20,month:500},
  {kind:'active_room_seconds',unit:'seconds',day:60000,month:1500000},
  {kind:'persistent_write_bytes',unit:'bytes',day:1048576,month:16777216},
  {kind:'email_attempts',unit:'count',day:100,month:1000}
 ]};
 return validateSettings(s);
}
