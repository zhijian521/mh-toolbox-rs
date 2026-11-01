#!/usr/bin/env node
/**
 * CDP 探针：一个常驻的小工具，替代「每轮审查现写一个 probe-xxx.mjs、用完删掉」。
 *
 * 它只做一件事：**把「怎么连、怎么保证看到的是这一版」这套前提钉死在代码里**，
 * 让人只写「量什么」。原先这些东西散在 `.workbuddy/memory` 与各次对谈里，
 * 每次重写都要重踩一遍。
 *
 * 三条前提（每条都踩过一次，写在这里就不必再想起来）：
 *
 * 1. **关缓存**。`Network.setCacheDisabled`。不关的话吃缓存的 `index.html`/旧 bundle，
 *    改完样式看不出变化，测出来的是上一次构建。
 * 2. **URL 带时间戳**。只改 hash 不会重新加载文档（hash 变化不触发导航），
 *    旧 bundle 会一直跑着。所以每次都是「新 URL + 查询串 `?t=…`」。
 * 3. **注入禁动效**。无焦点的 headless 页面合成器不推进动画，`getComputedStyle`
 *    会返回**上一拍**的值，量出来的位置像「写反了」，其实只是没跑完。
 *
 * 用法（`--root` 会自带一个静态服务，省掉另起 python http.server）：
 *
 *   node tools/probe/cdp.mjs --root dist --hash '#/settings' --eval "document.title"
 *   node tools/probe/cdp.mjs --root dist --hash '#/dev' --dark --shot .runtime/shots/dev-dark.png
 *   node tools/probe/cdp.mjs --url http://127.0.0.1:5173/ --eval "document.body.scrollHeight"
 *   node tools/probe/cdp.mjs --root dist --hash '#/tools/ghost' --inject .runtime/stub.js --shot shot.png
 *   node tools/probe/cdp.mjs --root dist --hash '#/tools' --hover .tool-card --shot hover.png
 *
 * 需要本机已经有一个开了调试端口的 Edge：
 *
 *   msedge --headless=new --remote-debugging-port=9337 --user-data-dir=<临时目录> about:blank
 *
 * 加 `--launch` 可以交给它自己起（退出时关闭）。
 */

import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { extname, join, normalize, resolve } from 'node:path';

const argv = process.argv.slice(2);
const arg = (name, fallback) => {
    const i = argv.indexOf(`--${name}`);
    return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : fallback;
};
const flag = (name) => argv.includes(`--${name}`);

const cdpPort = Number(arg('port', '9337'));
const root = arg('root', 'dist');
const hash = arg('hash', '');
const width = Number(arg('width', '1280'));
const height = Number(arg('height', '780'));
const scale = Number(arg('scale', '1'));
const theme = flag('dark') ? 'dark' : flag('light') ? 'light' : null;
const shot = arg('shot', '');
const evalExpr = arg('eval', '');
const launch = flag('launch');
const edgePath = arg('edge', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe');
const servePort = Number(arg('serve-port', '4180'));

/* ---------- 静态服务 ---------- */
const MIME = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.woff2': 'font/woff2',
    '.png': 'image/png',
    '.ico': 'image/x-icon',
    '.svg': 'image/svg+xml',
};

let server = null;
function serveRoot() {
    const base = resolve(root);
    server = createServer((req, res) => {
        const path = decodeURIComponent((req.url || '/').split('?')[0]);
        const file = join(base, normalize(path === '/' ? '/index.html' : path));
        if (!file.startsWith(base)) {
            res.writeHead(403).end();
            return;
        }
        try {
            const body = readFileSync(file);
            res.writeHead(200, {
                'content-type': MIME[extname(file)] || 'application/octet-stream',
            });
            res.end(body);
        } catch {
            res.writeHead(404).end('not found');
        }
    });
    return new Promise((ok) => server.listen(servePort, '127.0.0.1', () => ok(servePort)));
}

/* ---------- CDP ---------- */
async function targetUrl() {
    const res = await fetch(`http://127.0.0.1:${cdpPort}/json/list`);
    const list = await res.json();
    const page = list.find((t) => t.type === 'page');
    if (!page) throw new Error('调试端口里没有可用的 page target');
    return page.webSocketDebuggerUrl;
}

function connect(wsUrl) {
    const ws = new WebSocket(wsUrl);
    let id = 0;
    const pending = new Map();
    const listeners = new Set();

    ws.addEventListener('message', (event) => {
        const msg = JSON.parse(event.data);
        if (msg.id && pending.has(msg.id)) {
            const { resolve: ok, reject } = pending.get(msg.id);
            pending.delete(msg.id);
            if (msg.error) reject(new Error(msg.error.message));
            else ok(msg.result);
        } else if (msg.method) {
            for (const fn of listeners) fn(msg);
        }
    });

    const ready = new Promise((ok, fail) => {
        ws.addEventListener('open', () => ok());
        ws.addEventListener('error', () => fail(new Error('连不上 CDP 端口')));
    });

    const send = (method, params = {}) =>
        new Promise((ok, reject) => {
            id += 1;
            pending.set(id, { resolve: ok, reject });
            ws.send(JSON.stringify({ id, method, params }));
        });

    const once = (method) =>
        new Promise((ok) => {
            const fn = (msg) => {
                if (msg.method === method) {
                    listeners.delete(fn);
                    ok(msg.params);
                }
            };
            listeners.add(fn);
        });

    return { ws, ready, send, once };
}

/* ---------- 主流程 ---------- */
const sleep = (ms) => new Promise((ok) => setTimeout(ok, ms));

async function main() {
    let child = null;
    if (launch) {
        child = spawn(
            edgePath,
            [
                '--headless=new',
                `--remote-debugging-port=${cdpPort}`,
                `--user-data-dir=${resolve('.runtime', 'probe-profile')}`,
                '--no-first-run',
                '--no-default-browser-check',
                'about:blank',
            ],
            { stdio: 'ignore', detached: false },
        );
        await sleep(3000);
    }

    let url = arg('url', '');
    if (!url) {
        const port = await serveRoot();
        // 时间戳放在 hash 之前：只改 hash 不会重新加载文档，旧 bundle 会继续跑。
        url = `http://127.0.0.1:${port}/?t=${Date.now()}${hash}`;
    }

    const cdp = connect(await targetUrl());
    await cdp.ready;
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    await cdp.send('Network.enable');
    await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });

    // `--inject <file>`：在**新文档执行任何脚本之前**注入一段 JS。
    //
    // 为什么必须有「在文档之前」这个时点：有些判断在模块顶层就定型了。
    // 例如 `services/desktop.ts` 的 `hasTauri` 是模块求值时算的一次常量，
    // 用 `--eval` 事后补一个 `window.__TAURI_INTERNALS__` 已经晚了——页面早就
    // 按「浏览器预览」渲染完。要预览需要宿主（Tauri IPC）才能出的界面，
    // 只能在文档开始前把 IPC 桩好。
    const injectFile = arg('inject', '');
    if (injectFile) {
        await cdp.send('Page.addScriptToEvaluateOnNewDocument', {
            source: readFileSync(resolve(injectFile), 'utf8'),
        });
    }

    // 真窗口（Tauri）要量「最大化后变宽了多少」时不能设视口覆盖，否则宽度被钉死，
    // 窗口怎么动都量不出差别。那种场合传 `--no-metrics`。
    if (!flag('no-metrics')) {
        await cdp.send('Emulation.setDeviceMetricsOverride', {
            width,
            height,
            deviceScaleFactor: scale,
            mobile: false,
        });
    }
    // 主题：**每轮都显式设一次**，不只是 `--dark` 时才设。
    // `setEmulatedMedia` 的覆盖会留在这个 target 上，下一轮不带参数也不会自动还原——
    // 于是「上一轮截的是深色，这一轮什么都没传，也还是深色」，很容易被当成主题写反了。
    await cdp.send('Emulation.setEmulatedMedia', {
        media: 'screen',
        features: theme ? [{ name: 'prefers-color-scheme', value: theme }] : [],
    });

    const loaded = cdp.once('Page.loadEventFired');
    await cdp.send('Page.navigate', { url });
    // 只改 hash 属于**同文档导航**，不会触发 `loadEventFired`——等下去会一直挂着。
    // 超时兜底：5 秒还没事件就当文档已经能用（页面本来就活着）。
    await Promise.race([loaded, sleep(5000)]);
    await sleep(300);

    // `--fresh`：清掉本站的 localStorage 再刷一次，用来验「第一次打开」的状态。
    // 不清的话，上一轮留在 profile 里的 `mh-theme: dark` 会一直生效——
    // 这时候传 `--light` 也没用（那是**用户选过的主题**，不该被媒体查询覆盖），
    // 很容易误判成「主题切换写反了」。
    if (flag('fresh')) {
        await cdp.send('Runtime.evaluate', {
            expression: 'localStorage.clear(); sessionStorage.clear();',
        });
        const reloaded = cdp.once('Page.loadEventFired');
        await cdp.send('Page.reload', { ignoreCache: true });
        await Promise.race([reloaded, sleep(5000)]);
        await sleep(300);
    }

    // 禁动效：headless 无焦点时合成器不推进动画，量到的是上一拍的值。
    await cdp.send('Runtime.evaluate', {
        expression: `(() => {
            const style = document.createElement('style');
            style.textContent = '*{transition:none!important;animation:none!important}';
            document.head.append(style);
        })()`,
    });

    const out = { url, width, height, theme };

    // `--hover` / `--active`：把某个元素的伪类**真的**挂上（`CSS.forcePseudoState`），
    // 而不是往页面里注一份「看起来像悬停」的样式——后者验的是我抄的那份 CSS，
    // 不是产品里那份。
    //
    // 放在 eval 之前：这样 `--eval` 量的就是悬停/按下那一刻的几何与计算样式。
    // 两态都不参与媒体查询与布局流，所以必须在截图前挂、且不能用鼠标移动代替
    // （headless 里没有真实指针，`dispatchMouseEvent` 也只走到 hover 这一层）。
    const hoverSel = arg('hover', '');
    const activeSel = arg('active', '');
    if (hoverSel || activeSel) {
        await cdp.send('DOM.enable');
        await cdp.send('CSS.enable');
        const { root } = await cdp.send('DOM.getDocument', { depth: -1 });
        const force = async (selector, classes) => {
            const { nodeId } = await cdp.send('DOM.querySelector', {
                nodeId: root.nodeId,
                selector,
            });
            if (!nodeId) throw new Error(`找不到元素：${selector}`);
            await cdp.send('CSS.forcePseudoState', { nodeId, forcedPseudoClasses: classes });
        };
        // 按下时把 hover 一起挂上：真实指针按下去那一刻必然是悬停着的，
        // 只挂 active 会漏掉 `:hover` 里那些颜色与阴影的叠加。
        if (hoverSel) await force(hoverSel, ['hover']);
        if (activeSel) await force(activeSel, ['hover', 'active']);
    }

    if (evalExpr) {
        const result = await cdp.send('Runtime.evaluate', {
            expression: evalExpr,
            returnByValue: true,
            awaitPromise: true,
        });
        out.value = result.result?.value;
        if (result.exceptionDetails) out.error = result.exceptionDetails.text;
    }

    if (shot) {
        const { data } = await cdp.send('Page.captureScreenshot', { format: 'png' });
        mkdirSync(resolve(shot, '..'), { recursive: true });
        writeFileSync(resolve(shot), Buffer.from(data, 'base64'));
        out.shot = resolve(shot);
    }

    console.log(JSON.stringify(out, null, 2));

    cdp.ws.close();
    server?.close();
    child?.kill();
}

main().catch((error) => {
    console.error(`探针失败：${error.message}`);
    console.error(
        `检查 ${cdpPort} 端口：curl --noproxy '*' http://127.0.0.1:${cdpPort}/json/version`,
    );
    server?.close();
    process.exitCode = 1;
});
