import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { dataDir } from '../../db.mjs';

export default async function runQuick(ctx, tools) {
    const { cdp, ui, t, sleep, baseline, dbCount } = ctx;
    const { autoIncomeMatches, statCells, todayCount } = tools;

    const QUICK = '60武器';
    let before = null;

    await t.step('记录测试前的今日笔数', async () => {
        before = await todayCount();
        t.info('今天已有', `${before} 笔`);
    });

    await t.step('收益工具归位：文件操作在速记卡头，上线管理在状态条', async () => {
        await ui.goto('收益');
        const layout = await cdp.evaluate(`(() => {
                const find = (label) => document.querySelector('button[aria-label="' + label + '"]');
                const fileButtons = [find('把物品单价导出成文件'), find('从文件导入物品单价')];
                const onlineButtons = [find('补记一段已经过去的在线时长'), find('查看全部上线记录')];
                const filesAtHead = fileButtons.every((button) => button?.closest('.section-head'));
                const onlineAtBar = onlineButtons.every((button) => button?.closest('.online-actions'));
                const quick = fileButtons[0]?.closest('.ledger-section');
                const targets = quick?.querySelector('.targets');
                const onlineHeights = onlineButtons.map((button) => button?.getBoundingClientRect().height ?? 0);
                const live = document.querySelector('.online-bar .live-list');
                return {
                    filesAtHead,
                    onlineAtBar,
                    targetsVisible: !!targets && !targets.closest('.section-head') &&
                        targets.scrollWidth <= targets.clientWidth + 1,
                    singleTarget: !!targets?.querySelector('[role="radiogroup"]') &&
                        targets.querySelectorAll('[role="radio"][aria-checked="true"]').length === 1 &&
                        !targets.querySelector('[aria-pressed]'),
                    quietFiles: fileButtons.every((button) => button?.querySelector('.app-icon') &&
                        !button.textContent.trim() && button.title),
                    consistentOnline: onlineHeights.every((height) => height > 0 &&
                        Math.abs(height - onlineHeights[0]) < 1),
                    switchFirst: !!document.querySelector('.card-settings > .cost-switch:first-child'),
                    conciseLabels: !document.querySelector('.card-settings > .cap, .roster-label, .targets > .lbl'),
                    liveScroll: !live || (getComputedStyle(live).overflowX === 'auto' &&
                        getComputedStyle(live).overflowY === 'hidden'),
                };
            })()`);
        t.check('导出导入属于物品速记标题栏', layout.filesAtHead);
        t.check('补记记录属于在线区域', layout.onlineAtBar);
        t.check('记给谁独立常驻且不横向溢出', layout.targetsVisible);
        t.check('物品速记指定人单选，始终只有一个选中项', layout.singleTarget);
        t.check('文件操作收成带说明的小图标', layout.quietFiles);
        t.check('补记记录按钮高度一致', layout.consistentOnline);
        t.check('点卡开关位于单价前面', layout.switchFirst);
        t.check('移除点卡、在线和记给的独立标签', layout.conciseLabels);
        t.check('在线角色保持横向滚动', layout.liveScroll);
    });

    await t.step('物品图标滤镜支持风格覆写，不影响整页', async () => {
        await ui.goto('收益');
        const result = await cdp.evaluate(`(() => {
                const root = document.documentElement;
                const icon = document.querySelector('.item img');
                if (!icon) return false;
                const value = root.style.getPropertyValue('--item-icon-filter');
                const priority = root.style.getPropertyPriority('--item-icon-filter');
                try {
                    root.style.setProperty('--item-icon-filter', 'blur(1px)');
                    return getComputedStyle(icon).filter === 'blur(1px)' &&
                        getComputedStyle(root).filter === 'none';
                } finally {
                    if (value) root.style.setProperty('--item-icon-filter', value, priority);
                    else root.style.removeProperty('--item-icon-filter');
                }
            })()`);
        t.check('实际物品图标随滤镜令牌变化', result);
    });

    /* 2026-11-11 用户实报：「点击一个物品，不输入价格，但是关闭弹窗时候还进行校验，
     * 点第一下「取消」的时候取消不掉」。
     *
     * 两个症状同因：提示行由「输入格失焦」点亮，而按下「取消」正好让输入格失焦——
     * 提示插进来、窗变高、页脚在指针底下往下挪半行，抬起时已经不在按钮上。
     * 所以这里验证的是**没填过东西就不判错**：先把焦点放进价格格再移走（模拟
     * 「点了一下格子又不想填」，鼠标点标题栏与点「取消」走的是同一条 blur），
     * 断言窗里一句校验都没有；再点一次「取消」，窗必须关掉。 */
    await t.step('单价窗：没填价就关掉，不先告状，也不吞第一下「取消」', async () => {
        await ui.goto('收益');
        await ui.clickLabelPrefix('魔兽要诀，');
        const opened = await cdp.waitFor(
            `!!document.querySelector('input[aria-label="单价，以万为单位"]')`,
            { timeout: 2500 },
        );
        if (!opened) throw new Error('浮动价物品没弹出单价窗');

        await cdp.evaluate(
            `document.querySelector('input[aria-label="单价，以万为单位"]')?.focus()`,
        );
        await cdp.click('.modal-head h2');
        await sleep(250);
        const nag = await cdp.evaluate(`(() => {
                const panel = document.querySelector('.modal-panel');
                return {
                    hint: !!panel?.querySelector('.pf-hint'),
                    bad: !!panel?.querySelector('.pf-bad'),
                    text: (panel?.innerText || '').includes('单价要大于 0'),
                };
            })()`);
        t.check(
            '什么都没填，失焦后不弹校验',
            !nag.hint && !nag.bad && !nag.text,
            JSON.stringify(nag),
        );

        await ui.clickLabel('不改了');
        const closed = await cdp.waitFor('!document.querySelector("[role=dialog]")', {
            timeout: 2000,
        });
        t.check('第一下点「取消」就关掉了', closed);
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

        const asked = await cdp.waitFor(
            `!!document.querySelector('input[aria-label="单价，以万为单位"]')`,
            {
                timeout: 2500,
            },
        );
        if (asked) {
            await ui.fill('单价，以万为单位', '5');
            await ui.clickLabel('记下这一条');
            await sleep(700);
            t.pass('没定价时先问单价，填完直接记一条');
        } else {
            t.pass('已有单价，点一下直接记一条');
        }
        t.info(
            '单价来源',
            hadPrice ? '用户原本就有（跑完不动它）' : '测试临时设的（跑完清掉）',
        );

        const after = await todayCount();
        t.check('记一笔后今日笔数 +1', after === before + 1, `${before} → ${after}`);
        t.check(
            '速记净额按日期角色自动同步到账户，收支方向与金额一致',
            await autoIncomeMatches(),
        );
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

    /* 2026-11-11 用户：「收益上面四个统计卡片和下面的卡片样式保持一致吧，看起来整齐，
     * 并且统计上的数字字体颜色优化一下，一般收益为绿色，花费为红色」。
     *
     * 两件事都只有量出来才作数：①「同一套材质」要比 computedStyle（底色 / 落影 / 圆角），
     * 比 class 名只能证明写了那几行；②颜色要跟令牌本身比——写死 #4a6b4a 在暗色主题下
     * 是另一个值（--moss 在暗色翻成 #86ab86）。 */
    await t.step('统计四格与速记卡是同一张纸，进账苔绿、出账朱红', async () => {
        await ui.goto('收益');
        const look = await cdp.evaluate(`(() => {
                const cards = [...document.querySelectorAll('.income-stack .stats .stat')];
                const ledger = document.querySelector('.income-stack .split .ledger-section');
                if (!cards.length || !ledger) return null;
                const csOf = (el) => getComputedStyle(el);
                const inkOf = (name) => {
                    const probe = document.createElement('span');
                    probe.style.color = name;
                    document.body.appendChild(probe);
                    const value = getComputedStyle(probe).color;
                    probe.remove();
                    return value;
                };
                const values = cards.map((el) => el.querySelector('.v'));
                const boxes = cards.map((el) => el.getBoundingClientRect());
                return {
                    count: cards.length,
                    allBoard: cards.every((el) => el.classList.contains('board')),
                    face: csOf(cards[0]).backgroundColor,
                    ledgerFace: csOf(ledger).backgroundColor,
                    shadow: csOf(cards[0]).boxShadow,
                    ledgerShadow: csOf(ledger).boxShadow,
                    radius: csOf(cards[0]).borderRadius,
                    ledgerRadius: csOf(ledger).borderRadius,
                    gap: boxes.length > 1 ? Math.round(boxes[1].left - boxes[0].right) : -1,
                    colors: values.map((el) => (el ? csOf(el).color : '')),
                    tones: values.map((el) => el?.classList.contains('loss') ? 'loss' : el?.classList.contains('gain') ? 'gain' : 'num'),
                    moss: inkOf('var(--moss)'),
                    cinnabar: inkOf('var(--cinnabar)'),
                    num: inkOf('var(--num)'),
                };
            })()`);
        if (!look) throw new Error('收益页上没找到统计四格或速记卡');
        t.check('四格都换成了纸卡', look.count === 4 && look.allBoard, look.count + ' 格');
        t.check(
            '统计卡纸色与速记卡相同',
            look.face === look.ledgerFace,
            look.face + ' / ' + look.ledgerFace,
        );
        t.check('统计卡落影与速记卡相同', look.shadow === look.ledgerShadow);
        t.check(
            '统计卡圆角与速记卡相同',
            look.radius === look.ledgerRadius,
            look.radius + ' / ' + look.ledgerRadius,
        );
        t.check(
            '四格之间留了与别处一样的 16',
            Math.abs(look.gap - 16) <= 1,
            '实际 ' + look.gap + 'px',
        );
        t.check(
            '收入读数按金额取业务色或零值中性色',
            look.colors[0] === (look.tones[0] === 'gain' ? look.moss : look.num),
            look.colors[0] + ' / 令牌 ' + look.moss,
        );
        t.check(
            '支出读数按金额取业务色或零值中性色',
            look.colors[1] === (look.tones[1] === 'loss' ? look.cinnabar : look.num),
            look.colors[1] + ' / 令牌 ' + look.cinnabar,
        );
        /* 净额随正负走：账本里刚记过一笔收入，此刻应为苔绿。不断言「永远绿」——
         * 净额为负的那天它必须转朱，那才是这条规则的意思。 */
        t.check(
            '净额读数随盈亏和零值变化',
            look.colors[2] ===
                (look.tones[2] === 'loss'
                    ? look.cinnabar
                    : look.tones[2] === 'gain'
                      ? look.moss
                      : look.num),
            look.colors[2] + ' / 令牌 ' + look.moss,
        );
        t.check(
            '笔数仍是赭色（数的是条数，不是钱）',
            look.colors[3] === look.num,
            look.colors[3] + ' / 令牌 ' + look.num,
        );
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

    /* ---------------- 速记单价的进出（2026-11-05） ----------------
     *
     * 这一节走的是**真文件**：钩子把系统对话框换成固定路径，于是「另存为 / 打开」那两段
     * 也能被走过（同第 9 节的做法，那里有完整的缘由）。
     *
     * 判据是「导出的就是库里那一份 + 导回来之后库里没变」：这里**故意不改文件里的价**。
     * 改一个价再导回来看着更有说服力，但代价是动到用户自己的价目表，而这一页没有「撤销
     * 导入」，跑完只能靠快照还原。原样往返同样能证明这条链是通的——文件、信封、校验、
     * 合并、写库、重载后还在，每一环错一处都会红。
     */
    let priceCount = null;

    await t.step('单价：导出成文件，再把同一份导回来', async () => {
        const dir = dataDir();
        const hookFile = join(dir, 'e2e-dialog.json');
        const outDir = resolve('.runtime/e2e-export');
        mkdirSync(outDir, { recursive: true });
        const priceFile = join(outDir, `prices-${Date.now()}.json`);

        priceCount = await dbCount('income_load', 'prices');
        if (priceCount < 1) throw new Error('库里一条单价都没有，这一节没有意义');

        writeFileSync(hookFile, JSON.stringify({ save: priceFile }), 'utf8');
        await ui.goto('收益');
        await ui.clickLabel('把物品单价导出成文件');
        /* 回执是**浮层**（`NotifyHost` `Teleport` 到 body），不在 `.page-content` 里，
         * 所以 `ui.waitText` 看不到它，只能按纸条查。三秒就收，读到就取文本。 */
        const said = await cdp.waitFor(
            `[...document.querySelectorAll('.notice .text')]
                    .some((e) => (e.textContent || '').includes('已导出'))`,
            { timeout: 8000 },
        );
        if (!said) throw new Error(`没等到导出回执：${(await ui.text()).slice(0, 120)}`);
        t.check('导出文件落在磁盘上', existsSync(priceFile), priceFile);

        const file = JSON.parse(readFileSync(priceFile, 'utf8'));
        t.check(
            '信封格式与应用标识对',
            file.format === 1 && file.app === 'mh-toolbox-rs',
            `format=${file.format} app=${file.app}`,
        );
        t.check(
            '只带单价，不带角色与流水',
            Array.isArray(file.quickPrices) && !('characters' in file) && !('income' in file),
            `键：${Object.keys(file).join(', ')}`,
        );
        t.check(
            '单价条数与库一致',
            file.quickPrices?.length === priceCount,
            `文件 ${file.quickPrices?.length} / 库 ${priceCount}`,
        );
        t.check(
            '每条都是 {itemId, price} 且价为正',
            (file.quickPrices ?? []).every(
                (one) => Number.isInteger(one.itemId) && one.itemId > 0 && one.price > 0,
            ),
            JSON.stringify(file.quickPrices?.slice(0, 2) ?? []),
        );

        writeFileSync(hookFile, JSON.stringify({ open: priceFile }), 'utf8');
        await ui.clickLabel('从文件导入物品单价');
        const merged = await cdp.waitFor(
            `[...document.querySelectorAll('.notice .text')]
                    .some((e) => (e.textContent || '').includes('单价一致，无需导入'))`,
            { timeout: 8000 },
        );
        t.check('原样导入提示单价一致，跳过覆盖确认', merged);
        t.check(
            '无变化不弹出覆盖确认',
            await cdp.evaluate(`!document.querySelector('[role="dialog"]')`),
        );

        if (existsSync(hookFile)) rmSync(hookFile);
        t.check('钩子文件已被消费掉', !existsSync(hookFile));
    });

    await t.step('单价：导入后条数不变，重载后仍在', async () => {
        const now = await dbCount('income_load', 'prices');
        t.check(
            '库里单价条数与导出前一致',
            now === priceCount,
            `期望 ${priceCount}，实际 ${now}`,
        );

        await ui.reload();
        const after = await dbCount('income_load', 'prices');
        t.check(
            '重载后单价还在（写回的是库，不是内存）',
            after === priceCount,
            `实际 ${after}`,
        );
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

    return { QUICK, before };
}
