/**
 * 全量点击烟测（对真实 Tauri 窗口，走真实 IPC 与 SQLite）。
 *
 * 与 `tools/probe/cdp.mjs` 的分工：那个量「某一像素长什么样」，这里走
 * 「一个用户会走的完整路径」——点进去、填、保存、改、删、按 Esc、**重启/重载后还在**。
 *
 * ---- 怎么跑 ----
 *
 *   start.bat --force debug            # 必须 debug：只有 debug 构建读 MH_CDP_PORT
 *   node tools/e2e/smoke.mjs           # 端口默认 9222，可用 MH_E2E_PORT 改
 *   node tools/e2e/smoke.mjs --only=物价  # 只跑某一节（改一页时用，省时间）
 *
 * 它要的是**一个已经起来、开着调试端口的真窗口**，不自己编译、不自己起服务。
 * 退出码：0 全过 / 1 有断言红 / 2 环境不对（端口不通、连不上）。
 *
 * ---- 会写真实数据 ----
 *
 * 这不是只读测试：它真的往账本里建角色、记价、点速记。所以脚本**开头自动快照**
 * 一份库（`.runtime/e2e-db/`），结尾把还原命令打出来：
 *
 *   关掉窗口后：node tools/e2e/db.mjs restore <id> --yes
 *
 * 能自己收的都会收：带「E2E」前缀的角色与物价条目会删掉，测试里临时设的单价会清掉，
 * 字号会还原成跑之前那一档。收不了的是**速记流水的几笔**——账本里没有批量撤销，
 * 一条条删等于手动做收尾，所以交给快照还原。
 *
 * ---- 断言的口径 ----
 *
 * 每条都基于**页面自己渲染出来的**东西（innerText / DOM 数量 / aria-label），
 * 不看内部状态：状态对了但没画出来，对用户来说仍然是坏的。
 */

import { attach, sleep, SetupError } from './cdp.mjs';
import { createUi } from './ui.mjs';
import { createReporter } from './assert.mjs';
import { snapshot, dataDir } from './db.mjs';

/* ------------------------------ 启动 ------------------------------ */

const only = (process.argv.find((one) => one.startsWith('--only='))?.split('=')[1] ?? '').trim();
const want = (key) => !only || key.includes(only);

let cdp;
try {
    cdp = await attach();
} catch (error) {
    if (error instanceof SetupError) {
        console.error(`\n✗ ${error.message}`);
        if (error.hint) console.error(`\n${error.hint}\n`);
        process.exit(2);
    }
    throw error;
}

const ui = createUi(cdp);
const t = createReporter({ cdp });
const baseline = { chars: null, prices: null, quickPricedByTest: false };
let snap = null;

await ui.dismiss();

/* ============================ 0. 预检 ============================ */

t.section('0 预检 · 真窗口与数据目录');

const info = await cdp.appInfo();
t.check(
    'Tauri IPC 可达（不是浏览器里的假窗口）',
    !!info && !info.error,
    info?.error ?? `${info?.productName} ${info?.version}`,
);
t.info('运行环境', `${info?.webview ?? '?'} · 数据目录 ${info?.dataDir ?? dataDir()}`);

const href = await cdp.evaluate('location.href');
t.check('页面不是错误页', !href.startsWith('chrome-error'), href);

try {
    snap = snapshot(dataDir());
    t.info(
        '账本已快照',
        `${snap.dir}（${snap.files.map((f) => `${f.name} ${(f.bytes / 1024).toFixed(0)}KB`).join(' · ')}）`,
    );
} catch (error) {
    t.info('账本快照失败', `${error.message}（跑完可能要手动收拾测试数据）`);
}

/*
 * 对账：页面上的条数必须等于库里的行数。
 *
 * 对不上说明这一版界面**没读到数据**——热更新把 store 模块重算了一遍（模块级单例
 * 回到空数组，而 `loadRoster` 只在启动时跑）、读库失败、或者库刚被别的进程改过。
 * 这时任何一次保存都是「拿空表覆盖库」。2026-11-04 真栽过一次：一次
 * `characters_save([新角色])` 把 4 个角色顶掉了。
 *
 * 所以写第一个字之前先对账；对不上就停，连测试数据都不写。
 */
const dbCount = (command) =>
    cdp.evaluate(
        `window.__TAURI_INTERNALS__.invoke(${JSON.stringify(command)})
            .then((v) => (Array.isArray(v) ? v.length : -1), () => -1)`,
    );

await ui.goto('角色');
const charsOnPage = await ui.count('.roster .char');
const charsInDb = await dbCount('characters_load');
t.check(
    '对账：名册页面条数 = 库里行数',
    charsOnPage === charsInDb,
    `页面 ${charsOnPage} / 库 ${charsInDb}`,
);

await ui.goto('物价');
const pricesOnPage = await ui.count('article.price-card');
const pricesInDb = await dbCount('prices_load');
t.check(
    '对账：物价页面条数 = 库里行数',
    pricesOnPage === pricesInDb,
    `页面 ${pricesOnPage} / 库 ${pricesInDb}`,
);

if (charsOnPage !== charsInDb || pricesOnPage !== pricesInDb) {
    t.info('已中止', '页面和库对不上：先在窗口里 Ctrl+R 重载一次再跑，别拿空表去覆盖库');
    await t.summary();
    cdp.close();
    process.exit(5);
}

/* ============================ 1. 导航 ============================ */

const NAV = [
    ['总览', '#/overview', 'placeholder'],
    ['收益', '#/income', 'page'],
    ['物价', '#/prices', 'page'],
    ['角色', '#/characters', 'page'],
    ['账号', '#/accounts', 'placeholder'],
    ['目标', '#/goals', 'placeholder'],
    ['工具', '#/tools', 'page'],
    ['设置', '#/settings', 'page'],
];

if (want('导航')) {
    t.section('1 导航 · 左栏八项逐一进入');
    for (const [label, expected, kind] of NAV) {
        await t.step(`进入「${label}」`, async () => {
            await ui.gotoReady(label);
            const state = {
                href: await ui.hash(),
                title: await ui.title(),
                body: await ui.text(),
            };
            if (state.href !== expected) throw new Error(`地址是 ${state.href}，期望 ${expected}`);
            if (state.title !== label)
                throw new Error(`标题是「${state.title}」，期望「${label}」`);
            if (!state.body.length) throw new Error('正文是空的');
            if (kind === 'placeholder' && !state.body.includes('还没开始')) {
                throw new Error(`占位页没说「还没开始」：${state.body.slice(0, 40)}`);
            }
            t.pass(`进入「${label}」`, `${state.href} · ${state.body.length} 字`);
        });
    }
}

/* ============================ 2. 角色 ============================ */

const CONFIRM_DELETE = 'button';

if (want('角色')) {
    t.section('2 角色 · 新建 → 重载 → 编辑 → Esc → 删除');

    await t.step('清掉上次遗留的 E2E 角色', async () => {
        await ui.goto('角色');
        let purged = 0;
        for (let i = 0; i < 8; i += 1) {
            try {
                await ui.clickIn('.roster .char', 'E2E', { label: '删除这个角色' });
            } catch {
                break;
            }
            await sleep(350);
            await ui.clickText(CONFIRM_DELETE, '删除', { exact: true });
            await sleep(600);
            purged += 1;
        }
        t.info('清理结果', `清掉 ${purged} 个遗留角色`);
    });

    baseline.chars = await ui.count('.roster .char');
    t.info('名册现有角色', `${baseline.chars} 个`);

    await t.step('新建：点「新角色」并填字段', async () => {
        await ui.clickLabel('新建角色');
        if (!(await ui.waitFor(`!!document.querySelector('.editor')`, { timeout: 3000 }))) {
            throw new Error('编辑器没打开');
        }
        t.pass('点「新建角色」打开编辑器');

        const focused = await cdp.evaluate(
            `document.activeElement?.getAttribute('aria-label') ?? document.activeElement?.tagName`,
        );
        t.check('焦点一开始就在名字格里', focused === '角色名', `实际：${focused}`);

        await ui.fill('角色名', 'E2E测试角色');
        await ui.fill('区服', '测试区 · 测服');
        const typed = await cdp.evaluate(
            `document.querySelector('input[aria-label="角色名"]').value`,
        );
        t.check('名字格收到了文字', typed === 'E2E测试角色', `实际：${typed}`);

        await ui.clickText('.editor-tabs button', '师门');
        await sleep(300);
        const paneShown = await cdp.evaluate(`(() => {
            const pane = document.querySelector('#editor-pane-skills');
            return !!pane && pane.offsetParent !== null;
        })()`);
        t.check('切到「师门」分区', paneShown);

        await ui.clickLabel('保存这个角色');
        await sleep(600);
        t.check('保存后编辑器收起', !(await ui.exists('.editor')));

        const after = await ui.count('.roster .char');
        t.check('名册多出一格', after === baseline.chars + 1, `${baseline.chars} → ${after}`);
        t.check('新角色画在页面上', (await ui.text()).includes('E2E测试角色'));
    });

    /* 重载：这一条是整个测试最要紧的——前面的绿都可能是内存里的绿。 */
    await t.step('重载页面后角色还在（真的落库了）', async () => {
        await ui.reload();
        const drawn = await ui.waitText('E2E测试角色', { timeout: 8000 });
        t.check('重载后角色仍在名册上', drawn);
        t.info('重载后地址', await ui.hash());
    });

    await t.step('编辑：改个名字再存', async () => {
        await ui.clickIn('.roster .char', 'E2E测试角色', { label: '编辑这个角色' });
        if (!(await ui.waitFor(`!!document.querySelector('.editor')`, { timeout: 3000 }))) {
            throw new Error('编辑态没打开');
        }
        t.pass('编辑态打开');
        await ui.fill('角色名', 'E2E改名后');
        await ui.clickLabel('保存这个角色');
        await sleep(600);
        t.check('改名生效', (await ui.text()).includes('E2E改名后'));
    });

    await t.step('Esc 只关编辑器，不穿透到别的层', async () => {
        await ui.clickLabel('新建角色');
        await sleep(350);
        await cdp.key('Escape');
        await sleep(300);
        t.check('Esc 关掉编辑器', !(await ui.exists('.editor')));
        t.check('没有残留遮罩', !(await ui.exists('.editor-mask')));
    });

    await t.step('删除：先 Esc 取消，再确认删掉', async () => {
        await ui.clickIn('.roster .char', 'E2E改名后', { label: '删除这个角色' });
        await sleep(400);
        t.check('删除前弹确认窗', await ui.exists('[role="dialog"]'));

        await cdp.key('Escape');
        await sleep(300);
        t.check('Esc 取消，角色还在', (await ui.text()).includes('E2E改名后'));

        await ui.clickIn('.roster .char', 'E2E改名后', { label: '删除这个角色' });
        await sleep(350);
        await ui.clickText(CONFIRM_DELETE, '删除', { exact: true });
        await sleep(700);
        const back = await ui.count('.roster .char');
        t.check(
            '确认后角色被删掉',
            back === baseline.chars,
            `期望 ${baseline.chars}，实际 ${back}`,
        );
    });

    await t.step('重载后确认删除也进了库', async () => {
        await ui.goto('角色');
        await ui.reload();
        t.check('重载后没有残留的 E2E 角色', !(await ui.text()).includes('E2E改名后'));
    });
}

/* ============================ 3. 物价 ============================ */

if (want('物价')) {
    t.section('3 物价 · 新建 → 记价 → 重载 → 历史 → 删除');

    await t.step('清掉上次遗留的 E2E 物品', async () => {
        await ui.goto('物价');
        let purged = 0;
        for (let i = 0; i < 8; i += 1) {
            try {
                await ui.clickIn('article.price-card', 'E2E', { text: '删' });
            } catch {
                break;
            }
            await sleep(350);
            await ui.clickText(CONFIRM_DELETE, '删除', { exact: true });
            await sleep(650);
            purged += 1;
        }
        t.info('清理结果', `清掉 ${purged} 个遗留物品`);
    });

    baseline.prices = await ui.count('article.price-card');
    t.info('物价现有物品', `${baseline.prices} 件`);

    await t.step('新建物品并定初始价 3.5 万', async () => {
        await ui.clickLabel('新建一件物品');
        const open = await cdp.waitFor(`!!document.querySelector('input[aria-label="物品名称"]')`, {
            timeout: 3000,
        });
        if (!open) throw new Error('物品对话框没打开');
        t.pass('点「新增」打开物品对话框');

        await ui.fill('物品名称', 'E2E测试物品');
        await ui.fillSel('input[aria-label="初始价（可空），以万为单位"]', '3.5');
        await ui.clickText('button', '保存', { exact: true });
        await sleep(700);

        const body = await ui.text();
        t.check('新物品出现在列表', body.includes('E2E测试物品'));
        t.check('新物品带价格 3.5 万', /E2E测试物品[\s\S]{0,80}3\.5[\s\S]{0,10}万/.test(body));
    });

    await t.step('点卡片主体记一笔价 7.25 万', async () => {
        await ui.markFirst(`() => {
            const card = [...document.querySelectorAll('article.price-card')]
                .find((c) => (c.textContent || '').includes('E2E测试物品'));
            return card?.querySelector('.card-main') ?? null;
        }`);
        await cdp.click('[data-e2e="1"]');
        const asked = await cdp.waitFor(
            `!!document.querySelector('input[aria-label="这一笔多少钱，以万为单位"]')`,
            { timeout: 3000 },
        );
        if (!asked) throw new Error('记价窗没弹出');
        t.pass('点卡片主体弹出记价窗');

        await ui.fillSel('input[aria-label="这一笔多少钱，以万为单位"]', '7.25');
        await ui.clickLabel('记下这一笔价');
        await sleep(700);
        t.check('记价后卡片显示 7.25', (await ui.text()).includes('7.25'));
    });

    await t.step('重载后价格还在（真的落库了）', async () => {
        await ui.reload();
        await ui.waitText('E2E测试物品', { timeout: 8000 });
        t.check('重载后 7.25 仍在卡片上', (await ui.text()).includes('7.25'));
    });

    await t.step('卡片上的历史入口能开窗', async () => {
        await ui.markFirst(`() => {
            const card = [...document.querySelectorAll('article.price-card')]
                .find((c) => (c.textContent || '').includes('E2E测试物品'));
            return card?.querySelector('[data-role="history"]') ?? null;
        }`);
        await cdp.click('[data-e2e="1"]');
        const opened = await cdp.waitFor(`!!document.querySelector('[role="dialog"]')`, {
            timeout: 3000,
        });
        if (!opened) throw new Error('历史窗没打开');
        const labels = await cdp.evaluate(
            `[...document.querySelectorAll('[role="dialog"] [aria-label]')].map((e) => e.getAttribute('aria-label'))`,
        );
        t.check(
            '历史窗里有「删除这件物品」',
            labels.includes('删除这件物品'),
            labels.slice(0, 5).join(' / '),
        );
        await cdp.key('Escape');
        await sleep(350);
        t.check('Esc 关掉历史窗', !(await ui.exists('[role="dialog"]')));
    });

    await t.step('删除物品并回到原来的数量', async () => {
        await ui.clickIn('article.price-card', 'E2E测试物品', { text: '删' });
        await sleep(400);
        await ui.clickText(CONFIRM_DELETE, '删除', { exact: true });
        await sleep(700);
        const body = await ui.text();
        t.check('列表里没有它了', !body.includes('E2E测试物品'));
        const now = await ui.count('article.price-card');
        t.check(
            '物价数量回到测试前',
            now === baseline.prices,
            `期望 ${baseline.prices}，实际 ${now}`,
        );
    });
}

/* ============================ 4. 收益 ============================ */

/**
 * 今日笔数：从「历史收益」窗里读。
 *
 * 不从页面上的「统计范围 · N 笔」读：那个 N 跟着用户选的区间走，
 * 万一停在「近 7 天」，新记的这几笔也会一起变，看不出是不是自己记的。
 * 历史窗默认看今天，口径确定。
 */
const todayCount = async () => {
    await ui.goto('收益');
    await ui.clickLabel('查看历史收益，按角色与按天');
    const opened = await cdp.waitFor(`!!document.querySelector('[role="dialog"] .filters')`, {
        timeout: 4000,
    });
    if (!opened) throw new Error('历史收益窗没打开');
    const raw = await cdp.evaluate(
        `document.querySelector('[role="dialog"] .filters .sum .dim')?.innerText ?? ''`,
    );
    const value = Number((raw.match(/(\d+)/) ?? [])[1]);
    await cdp.key('Escape');
    await sleep(250);
    if (!Number.isFinite(value)) throw new Error(`读不到今日笔数（原文「${raw}」）`);
    return value;
};

/**
 * 删掉今天最后写进去的 n 条某物品流水。
 *
 * 历史窗的行是 `createdAt` 倒序，所以「最新的那条同物品记录」**一定**是刚记的——
 * 用户自己的同类记录只可能更早。这也是这笔账能自己收尾的原因：删的是位置，
 * 不是猜内容。
 */
const dropNewest = async (itemName, n) => {
    await ui.goto('收益');
    await ui.clickLabel('查看历史收益，按角色与按天');
    const opened = await cdp.waitFor(`!!document.querySelector('[role="dialog"] .log tbody tr')`, {
        timeout: 4000,
    });
    if (!opened) throw new Error('历史收益窗里没有流水行');

    let removed = 0;
    for (let i = 0; i < n; i += 1) {
        const found = await ui.markFirst(`() => {
            const row = [...document.querySelectorAll('[role="dialog"] .log tbody tr')]
                .find((r) => (r.querySelector('.item-name')?.textContent || '').includes(${JSON.stringify(itemName)}));
            return row?.querySelector('[aria-label="删这一条"]') ?? null;
        }`);
        if (!found) break;
        await cdp.click('[data-e2e="1"]');
        await sleep(350);
        await ui.clickText('button', '删除', { exact: true });
        await sleep(550);
        removed += 1;
    }
    await cdp.key('Escape');
    await sleep(250);
    return removed;
};

if (want('收益')) {
    t.section('4 收益 · 速记、连点、重载后仍在');

    const QUICK = '60武器';
    let before = null;

    await t.step('记录测试前的今日笔数', async () => {
        before = await todayCount();
        t.info('今天已有', `${before} 笔`);
    });

    await t.step(`点「${QUICK}」记一笔（没定价会先问单价）`, async () => {
        const label = await cdp.evaluate(`(() => {
            const el = [...document.querySelectorAll('[aria-label]')]
                .find((e) => e.getAttribute('aria-label').startsWith(${JSON.stringify(`${QUICK}，`)}));
            return el?.getAttribute('aria-label') ?? null;
        })()`);
        if (!label) throw new Error(`速记格里没有「${QUICK}」`);
        t.info('该格当前状态', label);

        /* 单价是**用户的数据**：有价就直接记，没价才弹窗。测试两种都要能走通，
         * 且不能因为「用户恰好没定价」而红；跑完把临时设的价清掉。 */
        const hadPrice = label.includes('单价');
        await ui.clickLabelPrefix(`${QUICK}，`);

        const asked = await cdp.waitFor(`!!document.querySelector('input[aria-label="单价"]')`, {
            timeout: 2500,
        });
        if (asked) {
            await ui.fillSel('input[aria-label="单价"]', '5');
            await ui.clickLabel('记下这一条');
            await sleep(700);
            t.pass('没定价时先问单价，填完直接记一条');
        } else {
            t.pass('已有单价，点一下直接记一条');
        }
        t.info('单价来源', hadPrice ? '用户原本就有（跑完不动它）' : '测试临时设的（跑完清掉）');

        const after = await todayCount();
        t.check('记一笔后今日笔数 +1', after === before + 1, `${before} → ${after}`);
        baseline.quickPricedByTest = !hadPrice;
    });

    await t.step('连点两次：两笔都要落到库里（写队列）', async () => {
        const one = await todayCount();
        await ui.clickLabelPrefix(`${QUICK}，`);
        await ui.clickLabelPrefix(`${QUICK}，`);
        await sleep(900);
        const two = await todayCount();
        t.check('连点两下多出两笔', two === one + 2, `${one} → ${two}`);
    });

    await t.step('重载后这两笔仍在（异步写不是假的）', async () => {
        await ui.goto('收益');
        await ui.reload();
        const still = await todayCount();
        t.check('重载后笔数没回落', still === before + 3, `期望 ${before + 3}，实际 ${still}`);
    });

    await t.step('把测试临时设的单价清掉', async () => {
        if (!baseline.quickPricedByTest) {
            t.info('无需清理', '单价是用户自己的');
            return;
        }
        await ui.goto('收益');
        await ui.markFirst(`() => [...document.querySelectorAll('[aria-label]')]
            .find((e) => e.getAttribute('aria-label').startsWith(${JSON.stringify(`${QUICK}，`)}))`);
        await cdp.click('[data-e2e="1"]', { button: 'right' });
        const asked = await cdp.waitFor(
            `!!document.querySelector('[aria-label="清除这件物品的单价"]')`,
            {
                timeout: 2500,
            },
        );
        if (!asked) throw new Error('右键没弹出改价窗');
        await ui.clickLabel('清除这件物品的单价');
        await sleep(400);
        const label = await cdp.evaluate(`(() => {
            const el = [...document.querySelectorAll('[aria-label]')]
                .find((e) => e.getAttribute('aria-label').startsWith(${JSON.stringify(`${QUICK}，`)}));
            return el?.getAttribute('aria-label') ?? '';
        })()`);
        t.check('单价已清回「未设价」', label.includes('未设价'), label);
    });

    t.info('本次写入的流水', `3 笔「${QUICK}」，下面删掉`);

    await t.step('把自己写进去的流水删干净', async () => {
        const removed = await dropNewest(QUICK, 3);
        t.check('删掉 3 条', removed === 3, `实际删了 ${removed} 条`);
        const now = await todayCount();
        t.check('今日笔数回到测试前', now === before, `期望 ${before}，实际 ${now}`);
    });
}

/* ============================ 5. 设置 ============================ */

if (want('设置')) {
    t.section('5 设置 · 主题、字号、导入与清除的确认窗');

    await t.step('主题切浅色再切回深色', async () => {
        await ui.goto('设置');
        const original = await cdp.evaluate(
            `document.documentElement.classList.contains('dark') ? 'dark' : 'light'`,
        );
        await ui.clickText('button.bevel-pill', '浅色');
        await sleep(400);
        t.check(
            '切到浅色',
            (await cdp.evaluate(
                `document.documentElement.classList.contains('dark') ? 'dark' : 'light'`,
            )) === 'light',
        );
        await ui.clickText('button.bevel-pill', '深色');
        await sleep(400);
        t.check(
            '切回深色',
            (await cdp.evaluate(
                `document.documentElement.classList.contains('dark') ? 'dark' : 'light'`,
            )) === 'dark',
        );
        t.info('测试前主题', original);
    });

    /*
     * 字号：三档的因子是 0.92 / 1 / 1.1（`use-font-scale.ts`）。
     * 先读当前值——用户自己可能就停在「较大」，直接断言「点较大后变了」会假红。
     */
    await t.step('字号三档都能切，并还原成测试前那一档', async () => {
        const readScale = () =>
            cdp.evaluate(
                `getComputedStyle(document.documentElement).getPropertyValue('--fs-scale').trim()`,
            );
        const original = await readScale();
        const pick = async (label, expect) => {
            await ui.clickText('button.step-opt', label);
            await sleep(400);
            const now = await readScale();
            t.check(`点「${label}」→ 缩放 ${expect}`, now === expect, `实际：${now}`);
        };

        await pick('默认', '1');
        await pick('较大', '1.1');
        await pick('较小', '0.92');

        const back = { 0.92: '较小', 1: '默认', 1.1: '较大' }[original] ?? '默认';
        await ui.clickText('button.step-opt', back);
        await sleep(400);
        t.check('字号还原', (await readScale()) === original, `还原到「${back}」`);
    });

    await t.step('数据卡三枚按钮都在', async () => {
        const labels = await cdp.evaluate(
            `[...document.querySelectorAll('[aria-label]')].map((e) => e.getAttribute('aria-label'))`,
        );
        for (const need of ['导出账本到文件', '从备份文件导入账本', '清空所有角色与物价']) {
            t.check(`按钮「${need}」在`, labels.includes(need));
        }
    });

    /* 清除：只验证「先问一句」这一层，取消掉不动真数据。 */
    await t.step('清除先弹确认窗，Esc 能取消', async () => {
        await ui.clickLabel('清空所有角色与物价');
        const asked = await cdp.waitFor(`!!document.querySelector('[role="dialog"]')`, {
            timeout: 3000,
        });
        if (!asked) throw new Error('清除没有二次确认');
        t.pass('清除前有确认窗');
        await cdp.key('Escape');
        await sleep(350);
        t.check('Esc 取消后没有残留窗', !(await ui.exists('[role="dialog"]')));
        t.check('取消后页面还在', (await ui.text()).length > 50);
    });

    /*
     * 导入放最后一节：它问完会开**系统文件对话框**。确认窗若坏了，系统窗会把
     * WebView 挡住、后面每一步都连坐——所以这一步不放在中间。
     */
    await t.step('导入先弹确认窗（确认后才轮到系统选文件）', async () => {
        await ui.clickLabel('从备份文件导入账本');
        const asked = await cdp.waitFor(`!!document.querySelector('[role="dialog"]')`, {
            timeout: 3000,
        });
        if (!asked) throw new Error('导入没有二次确认（会直接弹出系统文件窗）');
        t.pass('导入前有确认窗');
        await cdp.key('Escape');
        await sleep(350);
        t.check('Esc 取消后没有残留窗', !(await ui.exists('[role="dialog"]')));
    });
}

/* ============================ 6. 工具 ============================ */

if (want('工具')) {
    t.section('6 工具 · 捉鬼助手进出、开发页懒加载');

    await t.step('进工具页并打开捉鬼助手', async () => {
        await ui.goto('工具');
        const entry = await ui.count('button, a');
        t.check('工具页有可点入口', entry > 0, `${entry} 个`);
        await ui.clickText('button, a', '捉鬼');
        if (!(await cdp.waitFor(`location.hash.includes('ghost')`, { timeout: 5000 }))) {
            throw new Error(`点了捉鬼助手，地址还是 ${await ui.hash()}`);
        }
        t.pass('进入捉鬼助手', await ui.hash());
        t.check('捉鬼页画出来了', (await cdp.evaluate('document.body.innerText.length')) > 50);
    });

    await t.step('从捉鬼页回到工具列表', async () => {
        await ui.clickLabel('返回工具列表');
        const back = await cdp.waitFor(`location.hash === '#/tools'`, { timeout: 5000 });
        t.check('回到工具列表', back, await ui.hash());
    });

    /* `/dev` 只能靠左栏牌记三连击进，这里直接改地址——要验的是**懒加载的 chunk 到不到**。 */
    await t.step('开发页（#/dev）懒加载能渲染', async () => {
        await cdp.evaluate(`location.hash = '#/dev'`);
        const ok = await cdp.waitFor(
            `document.querySelector('.page-title')?.textContent?.trim() === '开发帮助'`,
            { timeout: 6000 },
        );
        if (!ok) throw new Error(`开发页没渲染：${await ui.title()}`);
        const cards = await ui.count('.ledger-section');
        t.check('开发页的卡片都在', cards >= 7, `${cards} 张`);
    });
}

/* ============================ 7. 收尾 ============================ */

if (want('收尾') || want('角色') || want('物价')) {
    t.section('7 收尾 · 数量核对');

    if (baseline.chars !== null) {
        await t.step('角色名册回到测试前的数量', async () => {
            await ui.goto('角色');
            const now = await ui.count('.roster .char');
            t.check('角色数量一致', now === baseline.chars, `期望 ${baseline.chars}，实际 ${now}`);
        });
    }

    if (baseline.prices !== null) {
        await t.step('物价列表回到测试前的数量', async () => {
            await ui.goto('物价');
            const now = await ui.count('article.price-card');
            t.check(
                '物价数量一致',
                now === baseline.prices,
                `期望 ${baseline.prices}，实际 ${now}`,
            );
        });
    }

    await t.step('停在设置页，方便接着人工点测', async () => {
        await ui.goto('设置');
        t.pass('已回到设置页', await ui.hash());
    });
}

await cdp.shot('.runtime/e2e-shots/final.png');

/* ------------------------------ 汇总 ------------------------------ */

const code = await t.summary();
if (snap) {
    console.log(`\n账本快照：${snap.dir}`);
    console.log(`跑完想清掉测试数据：node tools/e2e/db.mjs restore ${snap.id} --yes（先关窗口）`);
}
cdp.close();
process.exitCode = code;
