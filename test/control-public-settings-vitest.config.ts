import {defineConfig} from 'vitest/config';
export default defineConfig({test:{include:['test/control-public-settings.test.ts'],fileParallelism:false,maxWorkers:1,testTimeout:60000}});
