/**
 * 版本号一致性校验：**五处**必须相同，且必须是合法 semver。
 *
 *   package.json               npm 的 version
 *   package-lock.json          上面那个字段的副本（`version` 与 `packages[""]`）
 *   src-tauri/tauri.conf.json  打包时写进安装包的那个
 *   src-tauri/Cargo.toml       编进 exe 的那个
 *   src-tauri/Cargo.lock       上一次解析时记下来的那个
 *
 * 为什么要这条：几处版本号各写各的，升级时漏一处不会报错，只会**在发布后才发现**——
 * 安装包文件名是新的、窗口里显示的是旧的、`Cargo.toml` 又是另一个数。
 * 这不是提醒能解决的（「记得各处都改」这句话本身就是 bug），所以放进 `npm run check`。
 *
 * 为什么连 `*.lock` 也算进来：它们不是「构建输入」而是「上一次的读数」。两份 lock 都
 * 与清单对不上，说明有人手改了清单没走 `npm version` / `cargo build`，而下一次
 * `cargo build` 会**静默改写** `Cargo.lock`——那一步看起来像构建噪音，实际是在纠错。
 * 早先这里只核三个文件，`0.1.0rc1` 这种能一路通过，最后生成畸形的安装包文件名。
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

function read(relative) {
    const full = path.join(root, relative);
    if (!fs.existsSync(full)) {
        throw new Error(`缺文件：${relative}（先跑 npm install / cargo build）`);
    }
    return fs.readFileSync(full, 'utf8');
}

function readPackage() {
    return JSON.parse(read('package.json')).version;
}

/** 两处都要看：`npm version` 会一起改，手改 `package.json` 不会。 */
function readPackageLock() {
    const lock = JSON.parse(read('package-lock.json'));
    return [lock.version, lock.packages?.['']?.version];
}

function readTauriConf() {
    return JSON.parse(read('src-tauri/tauri.conf.json')).version;
}

/** Cargo.toml 只取 `[package]` 段里的第一个 `version = "…"`。 */
function readCargo() {
    const text = read('src-tauri/Cargo.toml');
    const pkgSection = text.split(/^\[/m).find((block) => block.startsWith('package]'));
    if (!pkgSection) throw new Error('Cargo.toml 里没找到 [package] 段');
    const match = pkgSection.match(/^version\s*=\s*"([^"]+)"/m);
    if (!match) throw new Error('Cargo.toml 的 [package] 段里没有 version');
    return match[1];
}

/** Cargo.lock 里按 `name` 找本仓自己的那一段，取紧跟其后的 version。 */
function readCargoLock() {
    const text = read('src-tauri/Cargo.lock');
    const block = text
        .split(/^\[\[package\]\]\s*$/m)
        .find((item) => /^name\s*=\s*"mh-toolbox-rs"\s*$/m.test(item));
    if (!block) throw new Error('Cargo.lock 里没有 mh-toolbox-rs 自己的 [[package]] 段');
    const match = block.match(/^version\s*=\s*"([^"]+)"/m);
    if (!match) throw new Error('Cargo.lock 的 mh-toolbox-rs 段里没有 version');
    return match[1];
}

let sources;
try {
    const [lockRoot, lockPackages] = readPackageLock();
    sources = [
        ['package.json', readPackage()],
        ['package-lock.json version', lockRoot],
        ['package-lock.json packages[""]', lockPackages],
        ['src-tauri/tauri.conf.json', readTauriConf()],
        ['src-tauri/Cargo.toml', readCargo()],
        ['src-tauri/Cargo.lock', readCargoLock()],
    ];
} catch (cause) {
    console.error(`版本号校验没跑起来：${cause.message}`);
    process.exit(1);
}

/* semver 2.0.0 的正式文法。Tauri 用它生成安装包文件名，`0.1.0rc1` 这种会变成
 * 「产品名_0.1.0rc1_x64-setup.exe」，升级器按 semver 比大小时直接判非法。 */
const SEMVER =
    /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;

const malformed = sources.filter(([, value]) => !SEMVER.test(String(value)));
if (malformed.length > 0) {
    console.error('版本号不是合法 semver（要 x.y.z，可带 -pre / +build）：');
    for (const [file, value] of malformed) console.error(`  ${String(value)}  ${file}`);
    process.exit(1);
}

const values = new Set(sources.map(([, value]) => value));
if (values.size === 1) {
    console.log(`版本号一致：${sources[0][1]}（${sources.length} 处）`);
    process.exit(0);
}

console.error('版本号不一致：');
for (const [file, value] of sources) console.error(`  ${String(value).padEnd(10)} ${file}`);
process.exit(1);
