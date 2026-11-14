import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

if (process.platform !== 'win32' || process.arch !== 'x64') {
    throw new Error('当前安装包仅支持 Windows x64 构建');
}
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tauri = path.join(root, 'src-tauri');
const config = JSON.parse(fs.readFileSync(path.join(tauri, 'tauri.conf.json'), 'utf8'));
const target = path.resolve(process.env.CARGO_TARGET_DIR || path.join(tauri, 'target'), 'release');
const resources = {};
for (const pattern of config.bundle.resources) {
    for (const file of fs.globSync(pattern, { cwd: tauri })) {
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
    .find((dir) => fs.existsSync(path.join(dir, 'msvcp140_1.dll')));
if (!redist) throw new Error('未找到 Visual Studio x64 VC++ 可再分发运行库');
for (const file of fs.readdirSync(redist).filter((name) => name.endsWith('.dll'))) {
    resources[path.join(redist, file)] = file;
}
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
