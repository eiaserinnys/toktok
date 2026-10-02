import type { Env as WorkerEnv } from '../src/contracts';
declare global { namespace Cloudflare { interface Env extends WorkerEnv {} } }
declare module 'cloudflare:workers' { interface ProvidedEnv extends WorkerEnv {} }
