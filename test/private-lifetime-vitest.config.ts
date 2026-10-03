import {defineConfig} from 'vitest/config';
import {cloudflareTest} from '@cloudflare/vitest-pool-workers';
export default defineConfig({plugins:[cloudflareTest({wrangler:{configPath:'./test/selfhost-wrangler.jsonc'},remoteBindings:false})],test:{include:['test/selfhost-private-lifetime-cloudflare.test.ts'],maxWorkers:1,fileParallelism:false,testTimeout:60000,hookTimeout:60000}});
