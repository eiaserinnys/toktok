import { defineConfig } from 'vitest/config';
import { cloudflareTest } from '@cloudflare/vitest-pool-workers';
import { createHash } from 'node:crypto';
export default defineConfig({
  plugins: [cloudflareTest({wrangler: {configPath: './wrangler.jsonc'}, remoteBindings: false,
    miniflare: {bindings: {PUBLIC_ORIGIN: 'http://localhost:8787', CREATOR_CREDENTIALS_JSON: JSON.stringify(Array.from({length:32},(_,i)=>({creator_id:`test-creator-${i}`,token_sha256:createHash('sha256').update(i===0?'local-fixture-creator':`local-fixture-creator-${i}`).digest('hex'),enabled:true})))}}
  })],
  test: {include:['test/foundation.test.ts'], maxWorkers:1, fileParallelism:false, testTimeout:60000, hookTimeout:60000}
});
