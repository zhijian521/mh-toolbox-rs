/**
 * 提交信息校验：前缀白名单 + 一行摘要。
 *
 * 从标准输入读 `git log --format=%s` 的输出，脚本自己不启动子进程——本机沙箱对
 * 带管道的子进程不稳定（见 AGENTS.md），把 git 放在管道左侧由 shell 执行更可靠。
 *
 * 用法：
 *   npm run lint:commits                                 最近 20 条
 *   git log --no-merges --format=%s origin/main..HEAD | node scripts/check-commits.mjs
 *
 * 只看摘要，不看正文：正文写的是「为什么」，不该受格式约束。
 */

const TYPES = [
    'feat',
    'fix',
    'docs',
    'style',
    'refactor',
    'perf',
    'test',
    'build',
    'ci',
    'chore',
    'revert',
];
/** `type` 或 `type(scope)`，冒号后必须有一个空格和非空内容。 */
const PATTERN = new RegExp('^(?:' + TYPES.join('|') + ')(?:\\([^()]+\\))?: \\S');

/** @returns {Promise<string>} */
async function readStdin() {
    const chunks = [];
    for await (const chunk of process.stdin) chunks.push(chunk);
    return Buffer.concat(chunks).toString('utf8');
}

const subjects = (await readStdin())
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('Merge '));

if (!subjects.length) {
    console.log('没有需要校验的提交。');
} else {
    const invalid = subjects.filter((subject) => !PATTERN.test(subject));
    if (invalid.length) {
        console.error('以下提交信息不符合约定（' + TYPES.join(' / ') + '，可带 scope）：');
        invalid.forEach((subject) => console.error('  ' + subject));
        console.error('\n正确示例：refactor(侧栏): 底部工具条抽成 SlotButton');
        process.exitCode = 1;
    } else {
        console.log('提交信息校验通过（' + subjects.length + ' 条）。');
    }
}
