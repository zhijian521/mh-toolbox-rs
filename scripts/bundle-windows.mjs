import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { assertX64Binary, REQUIRED_CRT, validateWindowsResources } from './windows-runtime.mjs';

if (process.platform !== 'win32' || process.arch !== 'x64') {
    throw new Error('当前安装包仅支持 Windows x64 构建');
}
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tauri = path.join(root, 'src-tauri');
const config = JSON.parse(fs.readFileSync(path.join(tauri, 'tauri.conf.json'), 'utf8'));
const target = path.resolve(process.env.CARGO_TARGET_DIR || path.join(tauri, 'target'), 'release');
const resources = {};
for (const pattern of config.bundle.resources) {
    const files = fs.globSync(pattern, { cwd: tauri });
    if (files.length === 0) throw new Error(`安装资源未匹配任何文件：${pattern}`);
    for (const file of files) {
        resources[path.resolve(tauri, file)] = file
            .replaceAll('\\', '/')
            .replaceAll('../', '_up_/');
    }
}

// ONNX 静态库仍依赖 DirectML 和 VC++ DLL；安装目录必须自行带齐。
const directML = path.join(target, 'DirectML.dll');
if (!fs.existsSync(directML)) throw new Error('缺少 DirectML.dll，请先完成 Rust 发布构建');
resources[directML] = 'DirectML.dll';
const redists = [];
if (process.env.VCToolsRedistDir) {
    redists.push(
        ...fs
            .globSync('x64/Microsoft.VC*.CRT', { cwd: process.env.VCToolsRedistDir })
            .map((file) => path.join(process.env.VCToolsRedistDir, file)),
    );
}
for (const base of new Set(
    [process.env.ProgramFiles, process.env['ProgramFiles(x86)']].filter(Boolean),
)) {
    redists.push(
        ...fs
            .globSync('Microsoft Visual Studio/*/*/VC/Redist/MSVC/*/x64/Microsoft.VC*.CRT', {
                cwd: base,
            })
            .map((file) => path.join(base, file)),
    );
}
const redist = redists
    .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }))
    .find((dir) => REQUIRED_CRT.every((name) => fs.existsSync(path.join(dir, name))));
if (!redist) throw new Error('未找到 Visual Studio x64 VC++ 可再分发运行库');
// Tauri 的资源相对路径处理不支持跨盘来源，先落到同盘构建目录再封装。
const stagedRedist = path.join(target, 'bundle-resources', 'crt');
fs.mkdirSync(stagedRedist, { recursive: true });
for (const file of fs.readdirSync(redist).filter((name) => name.endsWith('.dll'))) {
    const staged = path.join(stagedRedist, file);
    fs.copyFileSync(path.join(redist, file), staged);
    resources[staged] = file;
}
assertX64Binary(path.join(target, 'mh-toolbox-rs.exe'));
validateWindowsResources(resources);
console.log(
    `安装包附带 DirectML 与 ${Object.keys(resources).filter((file) => file.endsWith('.dll')).length - 1} 个 VC++ 运行库文件`,
);
execFileSync(
    process.execPath,
    [
        path.join(root, 'node_modules/@tauri-apps/cli/tauri.js'),
        'bundle',
        '--ci',
        '--bundles',
        'nsis',
        '--config',
        JSON.stringify({ bundle: { resources } }),
    ],
    { cwd: root, stdio: 'inherit' },
);
