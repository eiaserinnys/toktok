import {defineConfig} from 'vitest/config';
export default defineConfig({test:{include:['test/shared-flow-board.test.js'],maxWorkers:1,testTimeout:60000}});
