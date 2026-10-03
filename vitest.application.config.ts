import {defineConfig} from 'vitest/config';
import {cloudflareTest} from '@cloudflare/vitest-pool-workers';
export default defineConfig({plugins:[cloudflareTest({wrangler:{configPath:'./test/application-wrangler.jsonc'},remoteBindings:false})],test:{include:['test/application-recent-buffer.test.ts','test/application-public-connection.test.ts','test/application-runtime.test.ts','test/application-remaining.test.ts','test/application-recovery.test.ts'],maxWorkers:1,fileParallelism:false,testTimeout:60000,hookTimeout:60000}});
