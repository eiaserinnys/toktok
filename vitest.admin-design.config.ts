import {defineConfig} from 'vitest/config';
export default defineConfig({test:{include:['test/admin-design-route.test.ts'],maxWorkers:1,testTimeout:60000}});
