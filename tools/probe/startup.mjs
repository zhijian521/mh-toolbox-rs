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
 *   3. **导航开始 → 字体资源完成**：记录字体请求的 responseEnd；解析和实际应用另以
 *      采样时的 FontFaceSet 状态确认。它可能早于 FCP，不代表精确的字体应用时刻。
 *
 * 前两段相加为进程到 FCP；第三项与绘制并行，不能再相加。`--out <文件>` 保留原始采样。
 *
 * 几个必须注意的点：
 *
 * - **先正常退出现有实例**。探针拒绝与已有应用同时测量，只结束自己启动的进程树。
 * - **调试端口靠环境变量传**。发布构建的代码里不传 `--remote-debugging-port`，
 *   只有 `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS` 能生效。
 * - **`t0` 用 `Date.now()` 在 spawn 之前取**，而页面里的 `performance.timeOrigin` 是
 *   导航开始的 epoch 毫秒，两者相减才有第一段的真实值。拿 `performance.timing`
 *   算不出进程启动前的耗时——它根本不知道进程什么时候被创建。
 * - **首次采样不等于系统冷启动**。报告保留每轮原始数据并取有效样本中位数；新建 profile
 *   仍可能命中系统文件缓存，不能用单次结果声称冷启动提速。
 */

import { spawn, execFileSync } from 'node:child_process';
import { existsSync, writeFileSync } from 'node:fs';
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
const output = arg('out', '');
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
        fontReady: document.fonts.status === 'loaded' &&
            [...document.fonts].some((face) => face.status === 'loaded'),
        fontFamily: getComputedStyle(document.documentElement).getPropertyValue('--font-ui').trim(),
        pageReady: !!document.querySelector('main.app .page-content') &&
            !document.querySelector('.app-startup'),
        href: location.href,
        nodes: document.querySelectorAll('*').length,
    };
})()`;

function assertNoInstance() {
    if (process.platform !== 'win32') return;
    const list = execFileSync(
        'tasklist.exe',
        ['/FI', 'IMAGENAME eq mh-toolbox-rs.exe', '/FO', 'CSV', '/NH'],
        { encoding: 'utf8' },
    );
    if (list.toLowerCase().includes('"mh-toolbox-rs.exe"')) {
        throw new Error('已有应用实例正在运行，请先正常退出再测量');
    }
}

function stopChild(child) {
    if (child.exitCode !== null) return;
    try {
        if (process.platform === 'win32') {
            execFileSync('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], {
                stdio: 'ignore',
            });
        } else child.kill();
    } catch {
        /* 进程已退出时无需清理。 */
    }
}

async function once(index) {
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

    let cdp;
    try {
        const target = await findTarget(t0 + 30000);
        if (!target) {
            throw new Error('30s 内没等到 WebView2 的调试端口');
        }
        const tTarget = Date.now();

        cdp = connect(target.webSocketDebuggerUrl);
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
        return {
            run: index,
            '进程→导航': m.timeOrigin ? Math.round(m.timeOrigin - t0) : null,
            '导航→FCP': m.fcp ? Math.round(m.fcp) : null,
            '导航→FP': m.fp ? Math.round(m.fp) : null,
            '导航→字体资源完成': m.fontEnd ? Math.round(m.fontEnd) : null,
            '导航→load': m.load ? Math.round(m.load) : null,
            调试端口出现: tTarget - t0,
            字体字节: m.fontBytes,
            资源总字节: m.resBytes,
            请求数: m.resCount,
            节点数: m.nodes,
            字体已生效: m.fontReady,
            字体族: m.fontFamily,
            页面已就绪: m.pageReady,
            href: m.href,
        };
    } finally {
        cdp?.ws.close();
        stopChild(child);
        await sleep(300);
    }
}

assertNoInstance();
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
const total = (row) =>
    row['进程→导航'] !== null && row['导航→FCP'] !== null
        ? row['进程→导航'] + row['导航→FCP']
        : null;
const valid = rows
    .map(total)
    .filter((value) => value !== null)
    .sort((a, b) => a - b);
const median = valid.length
    ? (valid[Math.floor((valid.length - 1) / 2)] + valid[Math.floor(valid.length / 2)]) / 2
    : null;
console.log(`\n首次采样：进程→FCP ${total(first) === null ? '缺失' : `≈ ${total(first)}ms`}`);
console.log(`有效采样中位数：进程→FCP ${median === null ? '缺失' : `≈ ${median}ms`}`);
if (output) {
    writeFileSync(
        resolve(output),
        JSON.stringify({ exe, rows, medianProcessToFcp: median }, null, 2),
    );
}
