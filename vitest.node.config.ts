import { defineConfig } from 'vitest/config';
export default defineConfig({test:{include:['test/acceptance-guard.test.ts'], maxWorkers:1, testTimeout:60000}});
