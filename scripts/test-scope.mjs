import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { collectTests, selectTests, TEST_SCOPES } from './test-scopes.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const [scope, ...options] = process.argv.slice(2);

try {
    if (scope === '--list') {
        console.log(Object.keys(TEST_SCOPES).join('\n'));
    } else {
        const scopes = (scope ?? '').split(',').filter(Boolean);
        const files = selectTests(scopes, collectTests(root));
        console.log(`测试分区：${scopes.join('、')}（${files.length} 个文件）`);
        const vitest = fileURLToPath(new URL('../node_modules/vitest/vitest.mjs', import.meta.url));
        const result = spawnSync(process.execPath, [vitest, 'run', ...files, ...options], {
            cwd: root,
            stdio: 'inherit',
        });
        if (result.error) throw result.error;
        process.exitCode = result.status ?? 1;
    }
} catch (error) {
    console.error(error.message);
    process.exitCode = 1;
}
