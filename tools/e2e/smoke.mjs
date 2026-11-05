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

import {
    existsSync,
    mkdirSync,
    readFileSync,
    readdirSync,
    rmSync,
    statSync,
    writeFileSync,
} from 'node:fs';
import { join, resolve } from 'node:path';
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
/* 调试端口只存在于 debug 构建，能连上来基本就说明是 debug；这条断言是把「基本」变成判据：
 * 后面「数据」那一节要往数据目录写测试钩子，发布版里没有那段代码——真在发布版上跑，
 * 点「导出」会弹出系统对话框等一个不会有人来点的人。 */
t.check('这是 debug 构建（测试钩子可用）', info?.debug === true, `debug=${info?.debug}`);

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
    ['总览', '#/overview', 'page'],
    ['收益', '#/income', 'page'],
    ['物价', '#/prices', 'page'],
    ['角色', '#/characters', 'page'],
    ['账号', '#/accounts', 'page'],
    ['目标', '#/goals', 'placeholder'],
    ['工具', '#/tools', 'page'],
    ['设置', '#/settings', 'page'],
];

if (want('导航')) {
    t.section('1 导航与首页 · 左栏八项 + 总览三块');
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

    /* 总览页的骨架（2026-11-05 新建）。
     *
     * 三条都数**块**而不是读文字：这一页的价值全在「三块同时在」，少一块就是掉了功能。
     * 角色卡的数量与库里对账——不多不少，才算真的把名册接上了。 */
    await t.step('总览页：三块内容都在', async () => {
        await ui.gotoReady('总览');
        const shape = await cdp.evaluate(`(() => ({
            stats: document.querySelectorAll('.stats .stat').length,
            subs: document.querySelectorAll('.stats .stat .sub').length,
            deltas: document.querySelectorAll('.stats .stat .delta').length,
            slots: document.querySelectorAll('.bars .slot').length,
            chars: document.querySelectorAll('.chars .char').length,
        }))()`);

        t.check('今天那一排是四格', shape.stats === 4, `实际 ${shape.stats}`);
        /* 每格都要有副文与「较昨日」——空账时它们落成「—」，但两层都得在，
         * 少一层就是改版漏了一半。 */
        t.check('四格都有副文', shape.subs === 4, `实际 ${shape.subs}`);
        t.check('四格都有较昨日', shape.deltas === 4, `实际 ${shape.deltas}`);
        /* 七格是「七天」的骨架：没记账的那天也占一格，否则横轴对不上日期。 */
        t.check('近七天有七格（空的也占位）', shape.slots === 7, `实际 ${shape.slots}`);
        t.check(
            '各号近况的卡片数 = 库里的角色数',
            shape.chars === charsInDb,
            `页面 ${shape.chars} / 库 ${charsInDb}`,
        );
    });

    /* 默认落地页：`#/` 会重定向到 `DEFAULT_PATH`。2026-11-05 从设置页改成了总览，
     * 这条断言盯的就是那个改动——回退回去会立刻红。 */
    await t.step('打开应用落在总览（不是设置页）', async () => {
        await cdp.evaluate(`location.hash = '#/'`);
        await sleep(500);
        const landed = await ui.hash();
        t.check('默认页是总览', landed === '#/overview', `实际 ${landed}`);
    });
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

    /* ---- 召唤兽：概览牌 + 详情档案（2026-11-05） ----
     * 这一节以前一条断言都没有：卡上只画「名字 · 等级 · 参战」，而这三个数在名册里
     * 从来没被验过——练到哪一步、资质多少，全都只在编辑弹窗里能看见。
     * 现在卡上是一块**兽牌**（五格战斗属性 + 技能名），点开是一张 600 宽的**详情档案**
     * （资质六票 / 属性八行 / 技能 12 格 / 内丹 8 格）。两条路径都进断言。
     *
     * 只填 4 个字段（名 / 等级 / 参战 / 技能）就够验完整条链：五格属性靠的是
     * `attrs` 数组，它空着时该画五枚淡「—」，那也是一种要被验的状态。 */
    await t.step('召唤兽：加一只 → 概览牌 → 详情窗 → Esc', async () => {
        await ui.clickIn('.roster .char', 'E2E改名后', { label: '编辑这个角色' });
        if (!(await ui.waitFor(`!!document.querySelector('.editor')`, { timeout: 3000 }))) {
            throw new Error('编辑态没打开');
        }
        await ui.clickText('.editor-tabs button', '召唤兽');
        await sleep(300);
        await ui.clickLabel('加一只召唤兽');
        await sleep(250);

        /* 选择器必须带 `.pet-block`：`等级` 这个 aria-label 在编辑器里不止一处
         * （角色自己也有一格），`ui.fill()` 只取文档里第一个匹配。 */
        await ui.fillSel('.pet-block input[aria-label="召唤兽名称"]', 'E2E兽');
        await ui.fillSel('.pet-block input[aria-label="等级"]', '120');
        await ui.fillSel('.pet-block input[aria-label="参战等级"]', '145');
        // 技能是 textarea + `@change`（失焦才解析），所以下面那一记点击同时起「失焦」作用。
        await ui.fillSel(
            '.pet-block textarea[aria-label="已学技能，顿号或逗号分隔"]',
            '连击、必杀',
        );

        await ui.clickLabel('保存这个角色');
        await sleep(600);
        t.check('保存后编辑器收起', !(await ui.exists('.editor')));

        /* 切页签必须**指到这张卡**：名册里并排两三张卡，每张都有自己的六个页签，
         * `ui.clickText('.char .step-opt', '召唤兽')` 会点中第一张卡的那个，
         * 而剩下的卡还停在「属性」——它的兽牌在 DOM 里但 `display:none`，
         * 于是「尺寸为 0，点不到」。（第一次跑就是这么红的。） */
        await ui.clickIn('.roster .char', 'E2E改名后', { text: '召唤兽' });
        await sleep(320);

        /* 同理，所有计数都限定在**这张卡**里：`v-show` 让隐藏页签的内容仍然在 DOM 里，
         * 文档级 `.char .plate` 会把别人的兽也算进来（实测 8 块 / 40 格）。 */
        const inCard = (expr) =>
            cdp.evaluate(`(() => {
                const card = [...document.querySelectorAll('.roster .char')]
                    .find((c) => (c.textContent || '').includes('E2E改名后'));
                return card ? ${expr} : null;
            })()`);

        const plates = await inCard(`card.querySelectorAll('.plate').length`);
        t.check('卡上画出兽牌', plates === 1, `实际 ${plates} 块`);

        const visible = await inCard(
            `[...card.querySelectorAll('.plate')].filter((p) => p.offsetParent !== null).length`,
        );
        t.check('兽牌在可见的页签里', visible === 1, `实际 ${visible} 块可见`);

        const stats = await inCard(`card.querySelectorAll('.plate .s').length`);
        t.check('一块牌五格战斗属性', stats === 5, `实际 ${stats} 格`);

        const names = await inCard(
            `(card.querySelector('.plate .skill-line .names')?.textContent || '')`,
        );
        t.check(
            '技能行列出已学的名字',
            names.includes('连击') && names.includes('必杀'),
            `实际：${names}`,
        );

        // 参战 145 对一个人物等级很低的角色：签要转朱并报差额。
        const short = await inCard(`!!card.querySelector('.plate .join.short')`);
        t.check('参战不够时签转朱', short);

        await ui.clickIn('.roster .char', 'E2E兽', { label: '查看 E2E兽 的详情' });
        if (!(await ui.waitFor(`!!document.querySelector('[role="dialog"]')`, { timeout: 3000 }))) {
            throw new Error('详情窗没打开');
        }
        const slots = await ui.count('[role="dialog"] .slot');
        t.check('详情窗画出 20 格（技能 12 + 内丹 8）', slots === 20, `实际 ${slots} 格`);

        const filled = await ui.count('[role="dialog"] .slot:not(.off)');
        t.check('其中 2 格是学了的技能', filled === 2, `实际 ${filled} 格`);

        // Esc 只关这一层（`use-modal` 的冒泡口径），卡片本身不动。
        await cdp.key('Escape');
        await sleep(300);
        t.check('Esc 关掉详情窗', !(await ui.exists('[role="dialog"]')));
        t.check(
            '卡仍停在召唤兽页',
            (await inCard(
                `[...card.querySelectorAll('.plate')].filter((p) => p.offsetParent !== null).length`,
            )) === 1,
        );
    });

    await t.step('重载后召唤兽还在（详情走的是库里的数据）', async () => {
        await ui.reload();
        await ui.waitText('E2E改名后', { timeout: 8000 });
        await ui.clickIn('.roster .char', 'E2E改名后', { text: '召唤兽' });
        await sleep(320);
        const plates = await cdp.evaluate(
            `(() => {
                const card = [...document.querySelectorAll('.roster .char')]
                    .find((c) => (c.textContent || '').includes('E2E改名后'));
                if (!card) return 0;
                return [...card.querySelectorAll('.plate')].filter((p) => p.offsetParent !== null)
                    .length;
            })()`,
        );
        t.check('重载后兽牌仍在', plates === 1, `实际 ${plates} 块可见`);
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
 * 统计条四格的文本（名目 / 读数 / 副文 / 较上一档）。
 *
 * 2026-11-05 改版后每格多了两层，这两层是**算出来的**（笔均、占比、结余率、上一档），
 * 而算错不会报错——只会显示一个看着正常的错数。所以这里读的是文本本身，
 * 不是「元素存在」：格式对不对（「31 笔 · 均 14.9 万」「+6 笔」）一并盯住。
 */
const statCells = async () =>
    cdp.evaluate(`(() => [...document.querySelectorAll('.stats .stat')].map((el) => ({
        cap: el.querySelector('.cap')?.textContent?.trim() ?? '',
        value: el.querySelector('.v')?.textContent?.trim() ?? '',
        sub: el.querySelector('.sub')?.textContent?.trim() ?? '',
        delta: el.querySelector('.delta')?.textContent?.trim() ?? '',
    })))()`);

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

    /* 2026-11-05 统计条改版：四格从「名目 + 读数」变成「名目 + 读数 + 副文 + 较上一档」。
     * 副文是算出来的（笔均、占比、结余率），算错不会报错，只会显示一个看着正常的数——
     * 所以这里读文本本身，连格式一起盯住。 */
    await t.step('统计条：四格都有副文与「较上一档」', async () => {
        await ui.goto('收益');
        const cells = await statCells();
        t.check('四格齐', cells.length === 4, `实际 ${cells.length}`);
        const caps = cells.map((one) => one.cap).join('/');
        t.check('名目顺序没变', caps === '收入/支出/净额/笔数', caps);
        t.check(
            '每格都有副文',
            cells.every((one) => one.sub.length > 0),
            JSON.stringify(cells.map((one) => one.sub)),
        );
        t.check(
            '每格都有较上一档',
            cells.every((one) => one.delta.length > 0),
            JSON.stringify(cells.map((one) => one.delta)),
        );
        /* 刚记过一笔，收入格必然是「N 笔 · 均 X」；净额格的结余率只有在有收入时才算得出。 */
        t.check('收入副文是「N 笔 · 均 X」', /^\d+ 笔 · 均/.test(cells[0].sub), cells[0].sub);
        t.check('净额副文是结余率', cells[2].sub.startsWith('结余率'), cells[2].sub);
        /* 笔数用差不用百分比：`±0 笔` 也要能读出来。 */
        t.check('笔数对比是「±N 笔」', /^[+−±]\d+ 笔$/.test(cells[3].delta), cells[3].delta);
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

    /* 日期选择器（2026-11-05）：顶部从「只列有账的日子」的下拉换成月历纸片。
     * 放在最末——它会翻到别的日子，不参与上面那串「笔数 +1」的核对。 */
    await t.step('历史窗的日期选择器：默认今天、能翻前一天、能跳回今天', async () => {
        const label = (dt) => `${dt.getFullYear()}年${dt.getMonth() + 1}月${dt.getDate()}日`;
        const now = new Date();
        const todayLabel = label(now);
        const prev = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
        const prevLabel = label(prev);

        await ui.goto('收益');
        await ui.clickLabel('查看历史收益，按角色与按天');
        const hasTrigger = await cdp.waitFor(
            `!!document.querySelector('[role="dialog"] .date-trigger')`,
            { timeout: 4000 },
        );
        if (!hasTrigger) throw new Error('历史窗顶部没有日期选择器');

        const triggerText = async () =>
            (
                await cdp.evaluate(
                    `document.querySelector('[role="dialog"] .date-trigger')?.innerText ?? ''`,
                )
            ).trim();

        const first = await triggerText();
        t.check('日期选择器默认是今天', first.includes(todayLabel), `实际「${first}」`);

        /* 高度下限 + 正文自己滚（2026-11-05 用户：「高度太低不好看」「列表太多了可以滚动」）。
         *
         * 两条都量**结构**，不造假数据：一条盯「窗不至于缩成一小块」，一条盯「滚的是
         * 表格而不是整块正文」——后者才是 `fill` 的契约（筛选条与汇总行钉在顶上，
         * 翻到底想换日期不必先滚回顶部）。记录多时的真实滚动由 `overflow: auto` +
         * 表头 `sticky` 保证，20 行以上人人都会遇到，不必在这里克隆 DOM 去模拟。 */
        const layout = await cdp.evaluate(`(() => {
            const panel = document.querySelector('.modal-panel');
            const body = panel?.querySelector('.modal-body');
            if (!panel || !body) return null;
            const box = panel.querySelector('.log-scroll');
            return {
                h: Math.round(panel.getBoundingClientRect().height),
                bodyOverflow: getComputedStyle(body).overflowY,
                boxOverflow: box ? getComputedStyle(box).overflowY : 'none',
            };
        })()`);
        t.check(
            '历史窗有最小高度（两条记录也不缩成一小块）',
            layout !== null && layout.h >= 500,
            `实际 ${layout?.h}`,
        );
        t.check(
            '滚动交给表格，正文自己不滚',
            layout?.bodyOverflow === 'hidden' && layout?.boxOverflow === 'auto',
            `正文 ${layout?.bodyOverflow} / 表格 ${layout?.boxOverflow}`,
        );

        await cdp.click('[role="dialog"] .date-trigger');
        /* 纸片 `Teleport` 到 body（逃开弹窗正文的 `overflow-y: auto`），所以这里不带
         * `[role="dialog"]` 前缀查——它已经不在那张窗的子树里。 */
        const opened = await cdp.waitFor(`!!document.querySelector('.date-panel')`, {
            timeout: 2000,
        });
        t.check('点开是一张月历纸片', opened);

        /* 这次的核心判据：纸片是否**完整落在视口里**。
         *
         * 被裁剪时它照样查得到、照样有尺寸——只有拿 rect 和视口比才看得出来。
         * 2026-11-05 用户报「日期选择被切割了，没展示完全」：正文高约 260、月历约 300，
         * 下三行与「回到今天」被 `overflow: auto` 齐刀切掉，而界面看上去只是「月历很短」。 */
        const fits = await cdp.evaluate(`(() => {
            const p = document.querySelector('.date-panel');
            if (!p) return null;
            const r = p.getBoundingClientRect();
            return r.top >= 0 && r.left >= 0 &&
                r.bottom <= document.documentElement.clientHeight &&
                r.right <= document.documentElement.clientWidth;
        })()`);
        t.check('整张月历都在视口里（没被弹窗裁掉）', fits === true, `实际 ${fits}`);

        /* 今天是 1 号时，昨天落在上个月——先翻一页再找那一格。 */
        const hasPrev = await cdp.evaluate(
            `!!document.querySelector(${JSON.stringify(`[aria-label="${prevLabel}"]`)})`,
        );
        if (!hasPrev) {
            await ui.clickLabel('上一个月');
            await sleep(150);
        }
        await ui.clickLabel(prevLabel);
        await sleep(300);

        const afterPick = await triggerText();
        t.check('选前一天后触发条跟着换', afterPick.includes(prevLabel), `实际「${afterPick}」`);
        t.check(
            '列表换成了那一天（有记录就列行，没有就说一句）',
            await cdp.evaluate(`(() => {
                const d = document.querySelector('[role="dialog"]');
                return !!d.querySelector('.log tbody tr') || !!d.querySelector('.blank');
            })()`),
        );

        await cdp.click('[role="dialog"] .date-trigger');
        await sleep(200);
        await ui.clickText('button', '回到今天', { exact: true });
        await sleep(300);
        const back = await triggerText();
        t.check('纸片里的「回到今天」跳得回来', back.includes(todayLabel), `实际「${back}」`);

        await cdp.key('Escape');
        await sleep(250);
    });
}

/* ============================ 5. 账号 ============================ */

if (want('账号')) {
    t.section('5 账号 · 两本账 · 记一笔 → 全部记录里删掉');

    await t.step('两本账与十一个快捷入口都在', async () => {
        await ui.gotoReady('账号');
        const shape = await cdp.evaluate(`(() => ({
            books: document.querySelectorAll('.books .book').length,
            shortcuts: document.querySelectorAll('.shortcuts .shortcut').length,
            rowCols: document.querySelectorAll('.recent-table thead th').length,
        }))()`);

        /* 两本账是这一页的立论：合成一张「总收支」等于把元与万加起来。
         * 少一张就是回到了那个错。 */
        t.check('并排两本账', shape.books === 2, `实际 ${shape.books}`);
        t.check('快捷入口 11 个', shape.shortcuts === 11, `实际 ${shape.shortcuts}`);
        t.check(
            '表格六列（有记录时）',
            shape.rowCols === 0 || shape.rowCols === 6,
            `实际 ${shape.rowCols}`,
        );
    });

    /* 记一笔真账，走完整的写库路径，最后自己删干净。
     * 用 `⚠E2E` 开头的备注做标记：删的时候按它定位，不会误删用户的记录。 */
    const MARK = '⚠E2E账号';

    await t.step('记一笔人民币支出：弹窗 → 填数 → 入账', async () => {
        await ui.clickLabel('记一笔账号收支');
        const opened = await ui.waitFor(`!!document.querySelector('[role="dialog"]')`, {
            timeout: 3000,
        });
        t.check('记一笔的弹窗开了', opened);

        await ui.fill('成交金额', '12.5');
        await ui.fill('备注', MARK);
        await sleep(150);
        await ui.clickText('button', '记入', { exact: true });
        await sleep(500);

        const closed = await cdp.evaluate(`!document.querySelector('[role="dialog"]')`);
        t.check('记完弹窗自己关了', closed);

        /* 默认币种人民币、默认方向支出，所以第一行应该是 `−¥12.5`。
         * 这条同时钉住「金额按币种格式化」：写成 `12.5 万` 就说明币种串了。 */
        const first = await cdp.evaluate(`(() => {
            const row = document.querySelector('.recent-table tbody tr');
            if (!row) return null;
            return [...row.querySelectorAll('td')].map((td) => td.textContent.trim());
        })()`);
        t.check('表格里出现这一条', Boolean(first), '一行都没有');
        t.check(
            '金额是 −¥12.5（人民币按元、支出带负号）',
            Boolean(first) && first[first.length - 1] === '−¥12.5',
            `实际「${first ? first[first.length - 1] : ''}」`,
        );
    });

    await t.step('人民币卡上的支出跟着变了', async () => {
        const out = await cdp.evaluate(`(() => {
            const book = [...document.querySelectorAll('.books .book')]
                .find((one) => (one.textContent || '').includes('人民币'));
            if (!book) return null;
            return [...book.querySelectorAll('.metrics b')].map((b) => b.textContent.trim());
        })()`);
        /* 支出与差额都要包含这笔 12.5：支出是新增的，差额是它的相反数。
         * 只断言「有变化」是不够的——两个数同时错也能被称为「变了」。 */
        t.check(
            '人民币支出含这笔 12.5',
            Boolean(out) && out[1].includes('12.5'),
            `实际 ${out && out[1]}`,
        );
        t.check(
            '人民币差额含这笔 12.5',
            Boolean(out) && out[2].includes('12.5'),
            `实际 ${out && out[2]}`,
        );
    });

    await t.step('在全部记录里把它删掉', async () => {
        await ui.clickText('button', '全部记录', { exact: true });
        const opened = await ui.waitFor(`!!document.querySelector('[role="dialog"]')`, {
            timeout: 3000,
        });
        t.check('全部记录弹窗开了', opened);

        await ui.fill('搜索记录', 'E2E');
        await sleep(250);
        const hits = await cdp.evaluate(
            `[...document.querySelectorAll('.rec-table tbody tr')]
                .filter((row) => (row.textContent || '').includes('E2E')).length`,
        );
        t.check('搜到刚记的那一条', hits >= 1, `搜到 ${hits} 条`);

        /* **删到一条不剩**，不是「删一条」。
         * 上一次跑挂掉时留下的记录会一直累积，而「删一条之后还剩几条」取决于上一次跑得多干净——
         * 那会让这条断言在「第一次跑」和「第 N 次跑」上给出不同答案。 */
        let left = hits;
        let askedOnce = false;
        for (let round = 0; round < 6 && left > 0; round += 1) {
            await ui.clickIn('.rec-table tbody tr', 'E2E', { label: '删这一条' });
            await sleep(300);
            /* 删除要二次确认——这一步在账号页是必要的：一条记录挂了很久才发现记错，
             * 而删掉之后没有任何地方能找回来。 */
            if (!askedOnce && (await cdp.evaluate(`!!document.querySelector('[role="dialog"]')`))) {
                askedOnce = true;
                t.check('删除前问了那句', true);
            }
            await ui.clickText('button', '删除', { exact: true });
            await sleep(400);
            left = await cdp.evaluate(
                `[...document.querySelectorAll('.rec-table tbody tr')]
                    .filter((row) => (row.textContent || '').includes('E2E')).length`,
            );
        }
        t.check('删干净了', left === 0, `还剩 ${left} 条`);

        await cdp.key('Escape');
        await sleep(300);
    });

    await t.step('回到账号页：记录已经不在', async () => {
        await ui.gotoReady('账号');
        const still = await cdp.evaluate(`(() => {
            const body = document.querySelector('.page-content')?.innerText ?? '';
            return body.includes('E2E');
        })()`);
        t.check('页面上不再有那一笔', still === false, '还能看到 E2E 那条');
    });
}

/* ============================ 6. 设置 ============================ */

if (want('设置')) {
    t.section('6 设置 · 主题、字号、导入与清除的确认窗');

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
    t.section('7 工具 · 捉鬼助手进出、开发页懒加载');

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

/* ============================ 7. 数据（集成） ============================ */

/**
 * 导出 → 导入整条路的**真往返**：真文件、真信封、真整份替换、真重载。
 *
 * 这一节以前只到「三枚按钮在、按 Esc 能取消」——中间那段恰好是「用户的账到底有没有安全
 * 落盘」的那一段，从来没被走过。挡住它的是系统文件对话框：不在 WebView 里、CDP 点不到，
 * 真弹出来还会把模态窗挂在窗口前面等人。
 *
 * `backup.rs` 为此留了一个**只在 debug 构建里存在**的钩子：数据目录下的
 * `e2e-dialog.json`（`{"save": …}` / `{"open": …}`），读到就删、只生效一次。
 * 发布版里这段代码根本不编译进去。
 *
 * 三个前提都写在断言里，缺一个就跳过而不是硬点：
 * ① 是 debug 构建（`app_info` 的 `debug`，发布版连调试端口都没有，到不了这里）；
 * ② 数据目录可写（钩子文件要落在那里）；
 * ③ 账本本身读得出来（条数不为 -1）。
 */
if (want('数据') && !info?.debug) {
    t.section('8 数据 · 已跳过');
    t.info('跳过原因', '不是 debug 构建：测试钩子与调试端口都只在 debug 里有');
} else if (want('数据')) {
    t.section('8 数据 · 导出 → 导入往返（真文件、真替换）');

    const dir = dataDir();
    const hookFile = join(dir, 'e2e-dialog.json');
    const exportDir = resolve('.runtime/e2e-export');
    const exportFile = join(exportDir, `ledger-${Date.now()}.json`);
    const writeHook = (payload) => writeFileSync(hookFile, JSON.stringify(payload), 'utf8');

    const incomeCount = () =>
        cdp.evaluate(
            `window.__TAURI_INTERNALS__.invoke('income_load')
                .then((v) => (v?.entries ?? []).length, () => -1)`,
        );

    const counts = async () => ({
        chars: await dbCount('characters_load'),
        prices: await dbCount('prices_load'),
        entries: await incomeCount(),
    });

    let before = null;

    await t.step('记录导出前的条数', async () => {
        before = await counts();
        t.info('导出前', `${before.chars} 角色 / ${before.prices} 物价 / ${before.entries} 笔流水`);
        if (before.chars < 0 || before.prices < 0 || before.entries < 0) {
            throw new Error('账本读不出来，这一节没有意义');
        }
    });

    await t.step('导出：真写一份 JSON 到磁盘', async () => {
        await ui.goto('设置');
        mkdirSync(exportDir, { recursive: true });
        /* 每轮都留一份新的，但只留最近 5 份：一轮全量约 56KB，不清会攒到几百个文件，
         * 而翻旧账只需要「昨天那份」。 */
        if (existsSync(exportDir)) {
            const old = readdirSync(exportDir)
                .map((name) => ({ name, mtime: statSync(join(exportDir, name)).mtimeMs }))
                .sort((a, b) => b.mtime - a.mtime)
                .slice(5);
            for (const one of old) rmSync(join(exportDir, one.name));
        }
        writeHook({ save: exportFile });
        await ui.clickLabel('导出账本到文件');
        const done = await ui.waitText('已导出到', { timeout: 8000 });
        if (!done) throw new Error(`没等到导出回执：${(await ui.text()).slice(0, 120)}`);
        t.pass('界面回了「已导出到 …」');
        t.check('文件落在磁盘上', existsSync(exportFile), exportFile);
    });

    await t.step('导出的是一份完整信封', async () => {
        const file = JSON.parse(readFileSync(exportFile, 'utf8'));
        t.check(
            '信封格式与应用标识对',
            file.format === 1 && file.app === 'mh-toolbox-rs',
            `format=${file.format} app=${file.app}`,
        );
        t.check(
            '角色条数与库一致',
            file.characters?.length === before.chars,
            `文件 ${file.characters?.length} / 库 ${before.chars}`,
        );
        t.check(
            '物价条数与库一致',
            file.prices?.length === before.prices,
            `文件 ${file.prices?.length} / 库 ${before.prices}`,
        );
        t.check(
            '流水条数与库一致',
            file.income?.length === before.entries,
            `文件 ${file.income?.length} / 库 ${before.entries}`,
        );
        t.info('导出体积', `${(statSync(exportFile).size / 1024).toFixed(1)} KB`);
    });

    await t.step('导入：确认 → 整份替换 → 页面自己重载', async () => {
        writeHook({ open: exportFile });
        await ui.clickLabel('从备份文件导入账本');
        const asked = await cdp.waitFor(`!!document.querySelector('[role="dialog"]')`, {
            timeout: 4000,
        });
        if (!asked) throw new Error('导入没有二次确认');
        /* 必须在点之前取：点下去之后 `location.reload()` 随时可能把文档换掉。 */
        const beforeReload = await cdp.timeOrigin();
        await ui.clickText('button', '替换', { exact: true });
        await cdp.waitForReload(beforeReload);
        t.pass('导入后页面自己重载了');
        const noted = await ui.waitText('已导入', { timeout: 8000 });
        t.check(
            '重载后仍显示导入回执（经 sessionStorage 过河）',
            noted,
            noted ? '' : `页面开头：${(await ui.text()).slice(0, 60).replace(/\s+/g, ' ')}`,
        );
    });

    await t.step('导入后条数与导出前一致（整份替换没丢东西）', async () => {
        const after = await counts();
        t.check(
            '角色数回到导出前',
            after.chars === before.chars,
            `期望 ${before.chars}，实际 ${after.chars}`,
        );
        t.check(
            '物价数回到导出前',
            after.prices === before.prices,
            `期望 ${before.prices}，实际 ${after.prices}`,
        );
        t.check(
            '流水数回到导出前',
            after.entries === before.entries,
            `期望 ${before.entries}，实际 ${after.entries}`,
        );

        await ui.goto('角色');
        t.check(
            '名册页面也画出来了（不是只有库对）',
            (await ui.count('.roster .char')) === before.chars,
            `页面 ${await ui.count('.roster .char')} 个`,
        );
    });

    await t.step('替换前自动备份了一份', async () => {
        const backupDir = join(dir, 'backups');
        const fresh = existsSync(backupDir)
            ? readdirSync(backupDir)
                  .filter((name) => name.startsWith('账本-before-import-'))
                  .map((name) => statSync(join(backupDir, name)).mtimeMs)
                  .filter((ms) => Date.now() - ms < 5 * 60 * 1000)
            : [];
        t.check('backups/ 里有刚生成的 before-import', fresh.length > 0, `${fresh.length} 份`);
    });

    /* 钩子文件正常已被消费掉；失败路径上会留一份，留着它会让**下一次**导出自动跳到
     * 测试目录——用户点导出时什么都不发生，还以为按钮坏了。 */
    await t.step('收尾：不留钩子文件', async () => {
        if (existsSync(hookFile)) rmSync(hookFile);
        t.check('数据目录里没有残留 e2e-dialog.json', !existsSync(hookFile));
    });
}

/* ============================ 8. 收尾 ============================ */

if (want('收尾') || want('角色') || want('物价')) {
    t.section('9 收尾 · 数量核对');

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
