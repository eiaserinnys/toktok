import {defineConfig} from 'vitest/config';
export default defineConfig({test:{include:['test/public-browser-adapter.test.ts','test/public-demo-session.test.js'],maxWorkers:1,testTimeout:60000}});
