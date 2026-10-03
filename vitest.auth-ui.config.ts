import {defineConfig} from 'vitest/config';
export default defineConfig({test:{include:['test/shared-auth-ui.test.js'],maxWorkers:1,testTimeout:60000}});
