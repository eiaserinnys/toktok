import {defineConfig} from 'vitest/config';
export default defineConfig({test:{include:['test/shared-ui-contract.test.js','test/shared-preview-ready.test.js'],maxWorkers:1,testTimeout:60000}});
