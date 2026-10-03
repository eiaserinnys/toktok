import {defineConfig} from 'vitest/config';
export default defineConfig({test:{include:['test/public-demo-client.test.js','test/public-browser-adapter.test.ts','test/public-demo-session.test.js','test/public-ui-verifier.test.js'],maxWorkers:1,testTimeout:60000}});
