/**
 * e2e 用的最小 CDP 客户端（`tools/e2e/cdp.mjs`，不是 `tools/probe/cdp.mjs`）。
 *
 * 两个同名文件是**故意的分工**：
 *   - `tools/probe/cdp.mjs` 是「打开一个页面、量一次、截图、退出」的静态探针，
 *     自带静态服务，跑在 headless Edge 上，不碰真应用；
 *   - 这一份只服务 `smoke.mjs`：连**已经开着的真窗口**，在同一份活文档上连续做
 *     几十步操作，所以只留连接、求值、真实鼠标、真实键盘、重载这几件事，
 *     不导航、不起服务、不碰 localStorage。
 *
 * ---- 三条「跑得久」才需要的护栏 ----
 *
 * 1. **连接重试**：`start.bat debug` 起来之后 CDP 端口要等一会儿才通，脚本紧跟
 *    着启动就跑时第一次 `fetch` 会 ECONNREFUSED。等一等比让人再敲一次便宜。
 * 2. **每个请求都有超时**：应用被关掉/卡死时，`send` 的 promise 会永远悬着，
 *    脚本既不报错也不退出——那比红更糟。
 * 3. **重载后等文档就绪**：`Page.reload` 是异步的，紧接着求值会撞上
 *    `Execution context was destroyed`。`reload()` 用 `performance.timeOrigin`
 *    的变化判断「新文档真的起来了」，比睡固定毫秒稳。
 */

const DEFAULT_PORT = Number(process.env.MH_E2E_PORT || 9222);

export const sleep = (ms) => new Promise((ok) => setTimeout(ok, ms));

/**
 * 环境问题（端口不通、没有窗口）与断言失败要分开：
 * 前者该退出码 2 并给一句「先启动」的提示，后者才是「应用有毛病」。
 */
export class SetupError extends Error {
    constructor(message, hint) {
        super(message);
        this.name = 'SetupError';
        this.hint = hint;
    }
}

/** 连上真窗口。连不上时抛 `SetupError`，调用方据此走「环境问题」那条路。 */
export async function attach({ port = DEFAULT_PORT, timeout = 15000 } = {}) {
    const deadline = Date.now() + timeout;
    let page = null;
    let lastError = null;

    while (Date.now() < deadline) {
        try {
            const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
            page = list.find((t) => t.type === 'page' && !t.url.startsWith('devtools://')) ?? null;
            if (page) break;
        } catch (error) {
            lastError = error;
        }
        await sleep(300);
    }

    if (!page) {
        throw new SetupError(
            `${port} 端口上没有可连的窗口${lastError ? `（${lastError.message}）` : ''}`,
            `先起一个开着调试端口的窗口：start.bat --force debug\n` +
                `（调试端口只有 debug 构建才有；端口可用 MH_E2E_PORT 改）`,
        );
    }

    const ws = new WebSocket(page.webSocketDebuggerUrl);
    let id = 0;
    let alive = true;
    const pending = new Map();

    /**
     * 页面侧的报错全收在这里。
     *
     * 不收集不行：懒加载的 chunk 404、Vue 渲染异常都**不会**让界面上出现红字，
     * 它们只进控制台。而这次测试的全部价值就在「用户看不出问题的地方有没有问题」。
     */
    const errors = [];

    ws.addEventListener('message', (event) => {
        const msg = JSON.parse(event.data);
        if (msg.id && pending.has(msg.id)) {
            const { ok, fail } = pending.get(msg.id);
            pending.delete(msg.id);
            if (msg.error) fail(new Error(msg.error.message));
            else ok(msg.result);
            return;
        }
        if (msg.method === 'Runtime.exceptionThrown') {
            const d = msg.params.exceptionDetails;
            const where = d.url ? ` @ ${d.url}:${d.lineNumber + 1}` : '';
            errors.push(`异常：${d.exception?.description ?? d.text}${where}`);
        }
        if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
            const text = msg.params.args
                .map((a) => a.value ?? a.description ?? a.type)
                .join(' ')
                .slice(0, 300);
            errors.push(`console.error：${text}`);
        }
        if (msg.method === 'Log.entryAdded' && msg.params.entry.level === 'error') {
            errors.push(`网络/浏览器：${msg.params.entry.text} ${msg.params.entry.url ?? ''}`);
        }
    });

    ws.addEventListener('close', () => {
        alive = false;
        for (const [, one] of pending) one.fail(new SetupError('连接断了（应用退出了？）'));
        pending.clear();
    });

    await new Promise((ok, fail) => {
        ws.addEventListener('open', () => ok());
        ws.addEventListener('error', () => fail(new SetupError('连不上 CDP', '窗口起来了吗？')));
    });

    const send = (method, params = {}, { timeout: ms = 20000 } = {}) =>
        new Promise((ok, fail) => {
            if (!alive) {
                fail(new SetupError(`连接已断开：${method}`));
                return;
            }
            id += 1;
            const timer = setTimeout(() => {
                pending.delete(id);
                fail(new Error(`CDP 超时 ${ms}ms：${method}（窗口卡住了？）`));
            }, ms);
            pending.set(id, {
                ok: (value) => {
                    clearTimeout(timer);
                    ok(value);
                },
                fail: (error) => {
                    clearTimeout(timer);
                    fail(error);
                },
            });
            ws.send(JSON.stringify({ id, method, params }));
        });

    await send('Page.enable');
    await send('Runtime.enable');
    await send('Log.enable');

    /** 求值并返回值本身（不是 RemoteObject 包装）。 */
    const evaluate = async (expression, options = {}) => {
        const res = await send(
            'Runtime.evaluate',
            { expression, returnByValue: true, awaitPromise: true },
            options,
        );
        if (res.exceptionDetails) {
            throw new Error(
                `页面内报错：${res.exceptionDetails.text} ${res.result?.description ?? ''}`,
            );
        }
        return res.result?.value;
    };

    /**
     * 轮询一句表达式，直到它为真或超时。**超时返回 `false` 而不是抛错**：
     * 调用方可能只想「尽力等一下」（等某一页画出来），真正的判据交给自己写。
     * 导航期间求值会抛 `Execution context was destroyed`，这里一并吞掉重试。
     */
    const waitFor = async (expression, { timeout: ms = 8000, interval = 150 } = {}) => {
        const deadline = Date.now() + ms;
        for (;;) {
            try {
                if (await evaluate(expression)) return true;
            } catch {
                /* 文档正在换：下一轮再看。 */
            }
            if (Date.now() >= deadline) return false;
            await sleep(interval);
        }
    };

    /**
     * 取元素中心点（视口坐标），**并确认那一点真的能命中它**。
     *
     * 两条都必须有，各堵一种「假通过」：
     *   ① 元素在滚动容器里靠下、超出视口 → `getBoundingClientRect` 给出屏幕外坐标，
     *      鼠标事件发出去落在窗口外边，什么都不会发生，但脚本以为点过了；
     *   ② 元素被浮层/兄弟节点盖住 → 坐标是对的，可事件落在盖住它的那个元素上。
     * 所以先 `scrollIntoView` 再取框，取完用 `elementFromPoint` 反查一次。
     */
    const boxOf = async (selector) => {
        const scrolled = await evaluate(`(() => {
            const el = document.querySelector(${JSON.stringify(selector)});
            if (!el) return false;
            el.scrollIntoView({ block: 'center', inline: 'center' });
            return true;
        })()`);
        if (!scrolled) throw new Error(`点不到：${selector}（元素不存在）`);
        await sleep(180);

        const info = await evaluate(`(() => {
            const el = document.querySelector(${JSON.stringify(selector)});
            if (!el) return { why: '消失' };
            const r = el.getBoundingClientRect();
            if (!r.width || !r.height) return { why: '尺寸为 0' };
            const cx = r.x + r.width / 2;
            const cy = r.y + r.height / 2;
            if (cx < 0 || cy < 0 || cx > innerWidth || cy > innerHeight) {
                return { why: '在视口外 ' + Math.round(cx) + ',' + Math.round(cy) };
            }
            const hit = document.elementFromPoint(cx, cy);
            const covered = !(hit && (hit === el || el.contains(hit)));
            return { x: cx, y: cy, covered, by: hit?.className?.toString?.().slice(0, 40) };
        })()`);
        if (info.why) throw new Error(`点不到：${selector}（${info.why}）`);
        if (info.covered) throw new Error(`被遮挡：${selector}（命中 ${info.by}）`);
        return info;
    };

    /**
     * 真实鼠标点击：press + release，走完整事件流。
     *
     * **不用 `el.click()`**：那直接派发一个合成 click，绕过了命中测试——
     * 元素被浮层盖住、被 `pointer-events: none` 关掉、在屏幕外，它照样"成功"，
     * 于是测试全绿而人点不动。这里先发 `mouseMoved` 再按下抬起，浏览器自己
     * 决定事件落在谁身上。
     */
    const click = async (selector, { count = 1, gap = 120, button = 'left' } = {}) => {
        const box = await boxOf(selector);
        const held = button === 'right' ? 2 : 1;
        await send('Input.dispatchMouseEvent', {
            type: 'mouseMoved',
            x: box.x,
            y: box.y,
            button: 'none',
            buttons: 0,
        });
        for (let i = 0; i < count; i += 1) {
            await send('Input.dispatchMouseEvent', {
                type: 'mousePressed',
                x: box.x,
                y: box.y,
                button,
                buttons: held,
                clickCount: 1,
            });
            await send('Input.dispatchMouseEvent', {
                type: 'mouseReleased',
                x: box.x,
                y: box.y,
                button,
                buttons: 0,
                clickCount: 1,
            });
        }
        await sleep(gap);
    };

    /** 真实键盘输入：先聚焦并全选，再 insertText（会触发 input 事件，Vue 能收到）。 */
    const type = async (selector, value) => {
        await click(selector);
        await evaluate(`(() => {
            const el = document.querySelector(${JSON.stringify(selector)});
            el.focus();
            el.select?.();
        })()`);
        // 清空：全选后打一个字符会替换选中内容，但空串的 insertText 不删东西。
        await send('Input.dispatchKeyEvent', {
            type: 'keyDown',
            key: 'Backspace',
            windowsVirtualKeyCode: 8,
        });
        await send('Input.dispatchKeyEvent', {
            type: 'keyUp',
            key: 'Backspace',
            windowsVirtualKeyCode: 8,
        });
        if (value) await send('Input.insertText', { text: value });
        await sleep(120);
    };

    /** 单键：只发 keyDown + keyUp，不带任何文本（用于 Esc / Tab / 方向键）。 */
    const key = async (name) => {
        const map = {
            Escape: 27,
            Enter: 13,
            Tab: 9,
            Backspace: 8,
            Delete: 46,
            ArrowDown: 40,
            ArrowUp: 38,
            ArrowLeft: 37,
            ArrowRight: 39,
        };
        const vk = map[name];
        if (!vk) throw new Error(`没登记的按键：${name}`);
        for (const type of ['rawKeyDown', 'keyUp']) {
            await send('Input.dispatchKeyEvent', {
                type,
                key: name,
                windowsVirtualKeyCode: vk,
                nativeVirtualKeyCode: vk,
                code: name,
            });
        }
        await sleep(150);
    };

    /**
     * 重载页面并等新文档就绪。
     *
     * 判据是 `performance.timeOrigin` 变了**且**应用外壳已经画出来——只等
     * `readyState` 会在「HTML 到了、Vue 还没挂载」那一瞬返回，接着求值全是 undefined。
     * 导航窗口期求值必然抛错，交给 `waitFor` 吞。
     */
    const reload = async ({ waitFor: selector = '.rail-nav', timeout: ms = 25000 } = {}) => {
        const before = await evaluate('performance.timeOrigin');
        await send('Page.reload', { ignoreCache: true });
        const done = await waitFor(
            `performance.timeOrigin !== ${JSON.stringify(before)} &&
             !!document.querySelector(${JSON.stringify(selector)})`,
            { timeout: ms, interval: 200 },
        );
        if (!done) throw new Error(`重载后 ${ms}ms 内没画出来（${selector}）`);
        await sleep(250);
    };

    const shot = async (file) => {
        const { data } = await send('Page.captureScreenshot', { format: 'png' });
        const { writeFileSync, mkdirSync } = await import('node:fs');
        const { resolve, dirname } = await import('node:path');
        mkdirSync(dirname(resolve(file)), { recursive: true });
        writeFileSync(resolve(file), Buffer.from(data, 'base64'));
        return resolve(file);
    };

    /** 应用与数据目录的信息（走真 IPC，顺带证明通道是通的）。 */
    const appInfo = () =>
        evaluate(
            `window.__TAURI_INTERNALS__?.invoke('app_info').then((v) => v, (e) => ({ error: String(e) })) ?? null`,
        );

    return {
        send,
        evaluate,
        waitFor,
        click,
        type,
        key,
        reload,
        shot,
        appInfo,
        errors,
        clearErrors: () => errors.splice(0, errors.length),
        close: () => {
            alive = false;
            ws.close();
        },
    };
}
