import {defineConfig} from 'vitest/config';
import {cloudflareTest} from '@cloudflare/vitest-pool-workers';
export default defineConfig({plugins:[cloudflareTest({wrangler:{configPath:'./test/control-port-wrangler.jsonc'},remoteBindings:false})],test:{include:['test/control-email-eligibility.test.ts'],fileParallelism:false,maxWorkers:1,testTimeout:60000,hookTimeout:60000}});
