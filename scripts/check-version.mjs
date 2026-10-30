/**
 * 版本号一致性校验：`package.json` / `tauri.conf.json` / `src-tauri/Cargo.toml` 必须相同。
 *
 * 为什么要这条：三处版本号各写各的，升级时漏一处不会报错，只会**在发布后才发现**——
 * 安装包文件名是新的、窗口里显示的是旧的、`Cargo.toml` 又是另一个数。
 * 这不是提醒能解决的（「记得三处都改」这句话本身就是 bug），所以放进 `npm run check`。
 *
 * 前端不参与：`useAppInfo` 在真窗口里读 Rust 返回的版本，浏览器预览时退回
 * `package.json`，两边都不会写死数字。
 *
 * 用法：node scripts/check-version.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function readPackage() {
    const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
    return pkg.version;
}

function readTauriConf() {
    const conf = JSON.parse(fs.readFileSync(path.join(root, 'src-tauri/tauri.conf.json'), 'utf8'));
    return conf.version;
}

/** Cargo.toml 只取 `[package]` 段里的第一个 `version = "…"`。 */
function readCargo() {
    const text = fs.readFileSync(path.join(root, 'src-tauri/Cargo.toml'), 'utf8');
    const pkgSection = text.split(/^\[/m).find((block) => block.startsWith('package]'));
    if (!pkgSection) throw new Error('Cargo.toml 里没找到 [package] 段');
    const match = pkgSection.match(/^version\s*=\s*"([^"]+)"/m);
    if (!match) throw new Error('Cargo.toml 的 [package] 段里没有 version');
    return match[1];
}

const sources = [
    ['package.json', readPackage()],
    ['src-tauri/tauri.conf.json', readTauriConf()],
    ['src-tauri/Cargo.toml', readCargo()],
];

const values = new Set(sources.map(([, value]) => value));
if (values.size === 1) {
    console.log(`版本号一致：${sources[0][1]}`);
    process.exit(0);
}

console.error('版本号不一致：');
for (const [file, value] of sources) console.error(`  ${value.padEnd(10)} ${file}`);
process.exit(1);
