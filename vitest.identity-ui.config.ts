import {defineConfig} from 'vitest/config';
export default defineConfig({test:{include:['test/shared-account*.test.js','test/shared-claim*.test.js','test/shared-newroom*.test.js'],maxWorkers:1,testTimeout:60000}});
