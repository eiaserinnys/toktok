import {readFile,writeFile} from 'node:fs/promises';
import ts from 'typescript';
const source=new URL('../src/public-safety.ts',import.meta.url);
const target=new URL('../public/shared/agent-safety.js',import.meta.url);
const compiled=ts.transpileModule(await readFile(source,'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const notice=await import('data:text/javascript;base64,'+Buffer.from(compiled).toString('base64'));
const output='// Generated from src/public-safety.ts. Run node scripts/agent-safety.mjs; do not edit.\n'+['AGENT_SAFETY_VERSION','AGENT_SAFETY_NOTICE'].map(key=>'export const '+key+'='+JSON.stringify(notice[key])+';\n').join('');
if(process.argv.includes('--check')){if(await readFile(target,'utf8').catch(()=>null)!==output)throw new Error('Agent safety client module is stale.');}
else await writeFile(target,output);
