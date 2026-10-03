import {defineConfig} from 'vitest/config';
export default defineConfig({test:{include:['test/shared-settings-*.test.js','test/shared-lobby.test.js'],maxWorkers:1,testTimeout:60000}});
