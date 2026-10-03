import {readFile,writeFile} from 'node:fs/promises';
import ts from 'typescript';
const source=new URL('../src/public-connection-content.ts',import.meta.url);
const target=new URL('../public/shared/components/public-agent-entry.js',import.meta.url);
const output='// Generated from src/public-connection-content.ts by scripts/public-entry.mjs.\n'+ts.transpileModule(await readFile(source,'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
if(process.argv.includes('--check')){if(await readFile(target,'utf8')!==output)throw Error('Public agent entry is stale');}
else await writeFile(target,output);
