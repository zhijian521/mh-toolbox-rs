import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { recommendTests, statusPaths } from './test-impact.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const args = process.argv.slice(2);
const help = '用法：npm run test:recommend [-- --base=HEAD~1]。仅打印建议，不运行测试。';
try {
    if (args.length === 1 && args[0] === '--help') {
        console.log(help);
    } else {
        if (args.length > 1 || (args[0] && !args[0].startsWith('--base='))) throw new Error(help);
        const git = (options) => execFileSync('git', options, { cwd: root, encoding: 'utf8' });
        const paths = statusPaths(git(['status', '--porcelain=v1', '-z', '--untracked-files=all']));
        if (args.length) {
            const ref = args[0].slice('--base='.length);
            if (!ref || ref.startsWith('-')) throw new Error('请提供有效的 Git 基准引用。');
            const base = git(['rev-parse', '--verify', `${ref}^{commit}`]).trim();
            paths.push(
                ...git(['diff', '--name-only', '-z', '--no-renames', base, '--'])
                    .split('\0')
                    .filter(Boolean),
            );
        }
        const result = recommendTests(paths);
        console.log(`仅推荐，不执行；共 ${result.files.length} 个变动文件。`);
        if (result.scopes.length) console.log(`npm run test:scope -- ${result.scopes.join(',')}`);
        for (const page of result.smoke) console.log(`npm run e2e -- --only=${page}`);
        for (const module of result.rust)
            console.log(`npm run test:rust${module ? ` -- ${module}` : ''}`);
        for (const note of result.notes) console.log(`提示：${note}`);
        for (const path of result.unknown) console.log(`需人工判断：${path}`);
        if (!result.scopes.length && !result.smoke.length && !result.rust.length) {
            console.log('没有按路径匹配的测试建议；文档不推荐测试，配置与未知路径请人工判断。');
        }
    }
} catch (error) {
    console.error(error.message);
    process.exitCode = 1;
}
