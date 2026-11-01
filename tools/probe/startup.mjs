/**
 * 启动耗时探针：量「双击图标 → 首屏画出来」这条链，分三段报数。
 *
 *   node tools/probe/startup.mjs --exe src-tauri/target/release/mh-toolbox-rs.exe
 *   node tools/probe/startup.mjs --exe <路径> --runs 5 --hash '#/settings'
 *
 * 为什么分三段，而不是只报一个「启动时间」：
 *
 *   1. **进程启动 → 导航开始**（`timeOrigin - t0`）：CreateProcess + 加载 exe + WebView2
 *      环境初始化。这一段由 Tauri 与 WebView2 决定，前端再快也压不动。
 *   2. **导航开始 → FCP**：解析 HTML、跑 JS、首次绘制。前端产物大小与启动期同步工作
 *      直接体现在这里。
 *   3. **FCP → 字体就位**：`font-display: swap` 让文字先用回退字体画出来，10MB 字体
 *      在后台下载解析完再重排一次。这一段不改前端产物大小就不会变，**但它决定
 *      「字什么时候长得对」**，是一段肉眼可见、却不被 FCP 覆盖的等待。
 *
 * 三段相加才有意义：只报 FCP 会漏掉字体那段，只报总和则不知道该往哪优化。
 *
 * 几个必须注意的点：
 *
 * - **先杀残留实例**。上一版进程活着时占着 `%LOCALAPPDATA%\com.zhijian.mhtoolbox.rs\EBWebView`，
 *   新进程会直接失败或等锁，量出来的数字毫无意义。
 * - **调试端口靠环境变量传**。发布构建的代码里不传 `--remote-debugging-port`，
 *   只有 `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS` 能生效。
 * - **`t0` 用 `Date.now()` 在 spawn 之前取**，而页面里的 `performance.timeOrigin` 是
 *   导航开始的 epoch 毫秒，两者相减才有第一段的真实值。拿 `performance.timing`
 *   算不出进程启动前的耗时——它根本不知道进程什么时候被创建。
 * - **重复跑时先冷却**。WebView2 的 profile 是热的（缓存、首次运行检查都过了），
 *   所以第 2 次以后必然更快；报「第一次」和「稳态」两个数，别拿稳态冒充冷启动。
 */

import { spawn, execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const argv = process.argv.slice(2);
const arg = (name, fallback) => {
    const i = argv.indexOf(`--${name}`);
    return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : fallback;
};

const exe = resolve(arg('exe', resolve('src-tauri', 'target', 'release', 'mh-toolbox-rs.exe')));
const runs = Number(arg('runs', '3'));
const hash = arg('hash', '');
const cdpPort = arg('port', '9224');
const settleMs = Number(arg('settle', '1500'));
/**
 * 追加给 WebView2 的参数，逗号分隔。
 *
 * 走 `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS` 而不是改 Rust 再重编，是为了让 A/B
 * 落在**同一个 exe** 上：换二进制会让「启动变快」混进链接布局变化的干扰，
 * 而且每次重编 2 分钟，方案对照根本做不动。
 */
const extraArgs = arg('browser-args', '');

if (!existsSync(exe)) {
    console.error(`找不到可执行文件：${exe}`);
    process.exit(1);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** 端口上出现的页面目标。Tauri 的窗口在 WebView2 里就是一个 page target。 */
async function findTarget(deadline) {
    while (Date.now() < deadline) {
        try {
            const res = await fetch(`http://127.0.0.1:${cdpPort}/json/list`, {
                signal: AbortSignal.timeout(500),
            });
            const list = await res.json();
            const page = list.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
            if (page) return page;
        } catch {
            /* 端口还没起来，继续等 */
        }
        await sleep(20);
    }
    return null;
}

function connect(wsUrl) {
    const ws = new WebSocket(wsUrl);
    const pending = new Map();
    let seq = 0;
    ws.addEventListener('message', (ev) => {
        const msg = JSON.parse(ev.data);
        const slot = pending.get(msg.id);
        if (slot) {
            pending.delete(msg.id);
            slot(msg);
        }
    });
    const open = new Promise((res, rej) => {
        ws.addEventListener('open', res, { once: true });
        ws.addEventListener('error', rej, { once: true });
    });
    const send = (method, params = {}) =>
        new Promise((res) => {
            const id = ++seq;
            pending.set(id, res);
            ws.send(JSON.stringify({ id, method, params }));
        });
    return { ws, open, send };
}

/** 页面侧的采样：一次 evaluate 拿全，避免多次往返把时间戳打散。 */
const PROBE = `(() => {
    const nav = performance.getEntriesByType('navigation')[0];
    const paint = performance.getEntriesByType('paint');
    const at = (name) => paint.find((p) => p.name === name)?.startTime ?? null;
    const res = performance.getEntriesByType('resource');
    const font = res.find((r) => r.name.endsWith('.woff2'));
    return {
        timeOrigin: performance.timeOrigin,
        fcp: at('first-contentful-paint'),
        fp: at('first-paint'),
        dcl: nav?.domContentLoadedEventEnd ?? null,
        load: nav?.loadEventEnd ?? null,
        fontEnd: font ? font.responseEnd : null,
        fontBytes: font ? font.decodedBodySize : 0,
        resCount: res.length,
        resBytes: res.reduce((s, r) => s + (r.decodedBodySize || 0), 0),
        fontReady: document.fonts.check('12px "LXGW WenKai Screen"'),
        href: location.href,
        nodes: document.querySelectorAll('*').length,
    };
})()`;

function killLeftovers() {
    try {
        execSync('taskkill /F /IM mh-toolbox-rs.exe', { stdio: 'ignore' });
    } catch {
        /* 没有残留就是好事 */
    }
}

async function once(index) {
    killLeftovers();
    await sleep(300);

    const url = `http://localhost/index.html${hash}`;
    const spawnArgs = hash ? [url] : [];
    const t0 = Date.now();
    const browserArgs = [`--remote-debugging-port=${cdpPort}`, extraArgs].filter(Boolean).join(' ');
    const child = spawn(exe, spawnArgs, {
        env: {
            ...process.env,
            WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: browserArgs,
        },
        stdio: 'ignore',
        detached: false,
    });

    const target = await findTarget(t0 + 30000);
    if (!target) {
        child.kill();
        throw new Error('30s 内没等到 WebView2 的调试端口');
    }
    const tTarget = Date.now();

    const cdp = connect(target.webSocketDebuggerUrl);
    await cdp.open;
    await cdp.send('Runtime.enable');
    // 字体是异步的：先等 `document.fonts.ready`，否则量到的是「回退字体已就位」。
    await cdp.send('Runtime.evaluate', {
        expression: 'document.fonts.ready.then(() => true)',
        awaitPromise: true,
        returnByValue: true,
    });
    await sleep(settleMs);
    const out = await cdp.send('Runtime.evaluate', {
        expression: PROBE,
        returnByValue: true,
    });
    const m = out.result?.result?.value ?? {};
    cdp.ws.close();
    child.kill();
    await sleep(300);

    return {
        run: index,
        '进程→导航': m.timeOrigin ? Math.round(m.timeOrigin - t0) : null,
        '导航→FCP': m.fcp ? Math.round(m.fcp) : null,
        '导航→FP': m.fp ? Math.round(m.fp) : null,
        '导航→字体就位': m.fontEnd ? Math.round(m.fontEnd) : null,
        '导航→load': m.load ? Math.round(m.load) : null,
        调试端口出现: tTarget - t0,
        字体字节: m.fontBytes,
        资源总字节: m.resBytes,
        请求数: m.resCount,
        节点数: m.nodes,
        字体已生效: m.fontReady,
        href: m.href,
    };
}

const rows = [];
for (let i = 1; i <= runs; i++) {
    process.stdout.write(`第 ${i} 次…\n`);
    try {
        rows.push(await once(i));
    } catch (err) {
        console.error(`第 ${i} 次失败：${err.message}`);
    }
}

if (!rows.length) process.exit(1);

const cols = Object.keys(rows[0]);
const width = (c) => Math.max(String(c).length, ...rows.map((r) => String(r[c] ?? '').length));
const pad = (s, w) => String(s) + ' '.repeat(Math.max(0, w - String(s).length));
console.log('\n' + cols.map((c) => pad(c, width(c))).join('  '));
console.log(cols.map((c) => '-'.repeat(width(c))).join('  '));
for (const r of rows) console.log(cols.map((c) => pad(r[c] ?? '', width(c))).join('  '));

const first = rows[0];
const steady = rows.length > 1 ? rows[rows.length - 1] : null;
console.log(`\n首次启动：进程→FCP ≈ ${(first['进程→导航'] ?? 0) + (first['导航→FCP'] ?? 0)}ms`);
if (steady && rows.length > 1) {
    console.log(`稳态启动：进程→FCP ≈ ${(steady['进程→导航'] ?? 0) + (steady['导航→FCP'] ?? 0)}ms`);
}
