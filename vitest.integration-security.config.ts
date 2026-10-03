import {defineConfig} from 'vitest/config';
export default defineConfig({test:{include:['test/integration-security.test.ts'],maxWorkers:1}});
