import {defineConfig} from 'vitest/config';
import {cloudflareTest} from '@cloudflare/vitest-pool-workers';
export default defineConfig({
 plugins:[cloudflareTest({wrangler:{configPath:'./test/wrangler.jsonc'},remoteBindings:false})],
 test:{include:['test/foundation.test.ts','test/routing.test.ts','test/claims.test.ts','test/otp.test.ts'],maxWorkers:1,fileParallelism:false,testTimeout:60000,hookTimeout:60000}
});
