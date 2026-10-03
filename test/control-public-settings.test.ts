import {it,expect} from 'vitest';
import {DEFAULT_SETTINGS,SETTINGS_SCHEMA,validateSettings,publicConfig,runtimePublicPolicy,type SchemaNode} from '../src/settings-schema';
import {PUBLIC_POLICY} from '../src/public-contracts';
import {validatePublicPolicy} from '../src/public-policy';
const field=(...path:string[])=>path.reduce((node,key)=>{if(node.type!=='object')throw Error('schema object expected');return node.fields[key];},SETTINGS_SCHEMA as SchemaNode);
const candidate=(values:Record<string,unknown>,policy:Record<string,unknown>={})=>({...structuredClone(DEFAULT_SETTINGS),public:{...structuredClone(DEFAULT_SETTINGS.public),...values,policy:{...DEFAULT_SETTINGS.public.policy,...policy}}});
it('public IP memory uses the engine minimum and bounded maximum in the admin schema',()=>{
 const node=field('public','policy','ipMemoryMs');expect({min:node.min,max:node.max}).toEqual({min:300000,max:3600000});
 for(const value of [1,299999,3600001])expect(()=>validateSettings(candidate({}, {ipMemoryMs:value}))).toThrow();
 for(const value of [300000,3600000]){const accepted=validateSettings(candidate({}, {ipMemoryMs:value}));expect(runtimePublicPolicy(accepted).ipMemoryMs).toBe(value);expect(validatePublicPolicy(runtimePublicPolicy(accepted))).toEqual(runtimePublicPolicy(accepted));}
});
it('first-window message count is an actual bounded schema option and public projection',()=>{
 const node=field('public','firstWindowMessages');expect(node?.type).toBe('integer');expect({min:node?.min,max:node?.max}).toEqual({min:1,max:20});
 expect(runtimePublicPolicy(validateSettings(DEFAULT_SETTINGS))).toEqual(PUBLIC_POLICY);
 const accepted=validateSettings(candidate({firstWindowMessages:3},{pageSize:1}));expect(publicConfig(accepted,1).public.firstWindowMessages).toBe(3);expect(runtimePublicPolicy(accepted).firstWindowMessages).toBe(3);
 for(const n of [0,21])expect(()=>validateSettings(candidate({firstWindowMessages:n}))).toThrow();
});
it('public settings reject unsafe response, wait and batching relationships',()=>{
 for(const policy of [{responseBytes:65535},{byteBurst:65535},{handlers:1,waits:2},{responseBurst:0},{batchMs:1999},{batchMs:10001},{batchMs:2000,waitMs:1999}])expect(()=>validateSettings(candidate({},policy))).toThrow();
});
