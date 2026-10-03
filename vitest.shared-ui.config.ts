import {defineConfig} from 'vitest/config';
export default defineConfig({test:{include:['test/shared-design-review.test.js','test/shared-ui-contract.test.js','test/shared-preview-ready.test.js','test/shared-common-header.test.js'],maxWorkers:1,testTimeout:60000}});
