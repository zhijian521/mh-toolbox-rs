import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { dataDir } from '../db.mjs';
import { importLoaded } from '../cdp.mjs';

/* ============================ 4. 收益 ============================ */

export default async function run(ctx) {
    const { cdp, ui, t, want, sleep, baseline, dbCount } = ctx;

    const autoIncomeMatches = () =>
        cdp.waitFor(
            `(async () => {
        const invoke = window.__TAURI_INTERNALS__.invoke;
        const [income, accounts] = await Promise.all([invoke('income_load'), invoke('account_load')]);
        const net = new Map();
        for (const one of income.entries) {
            const key = JSON.stringify([one.date, one.characterId]);
            net.set(key, (net.get(key) || 0) + (one.kind === 'expense' ? -one.amount : one.amount));
        }
        const expected = [...net].filter(([, amount]) => amount !== 0)
            .map(([key, amount]) => JSON.stringify([key, amount])).sort();
        const actual = accounts.filter((one) => one.source === 'auto' && one.category === '游戏收益')
            .map((one) => JSON.stringify([JSON.stringify([one.date, one.characterId]), one.kind === 'expense' ? -one.amount : one.amount])).sort();
        return JSON.stringify(actual) === JSON.stringify(expected);
    })()`,
            { timeout: 4000 },
        );

    /**
     * 统计条四格的文本（名目 / 读数 / 副文 / 较上一档）。
     *
     * 2026-11-05 改版后每格多了两层，这两层是**算出来的**（笔均、占比、结余率、上一档），
     * 而算错不会报错——只会显示一个看着正常的错数。所以这里读的是文本本身，
     * 不是「元素存在」：格式对不对（「31 笔 · 均 14.92 万」「+6 笔」）一并盯住。
     */
    const statCells = async () =>
        cdp.evaluate(`(() => [...document.querySelectorAll('.stats .stat')].map((el) => ({
            cap: el.querySelector('.cap')?.textContent?.trim() ?? '',
            value: el.querySelector('.v')?.textContent?.trim() ?? '',
            sub: el.querySelector('.sub')?.textContent?.trim() ?? '',
            delta: el.querySelector('.delta')?.textContent?.trim() ?? '',
            color: getComputedStyle(el.querySelector('.v')).color,
        })))()`);

    /**
     * 今日笔数：从「历史收益」窗里读。
     *
     * 不从页顶统计条读：那四格是**跨分类的合计**（收入/支出/净额/笔数），
     * 记一条摆摊收入进去，「笔数」会动但分不清是这一条还是别的；而历史窗是一条一行，
     * 数行数就是数自己刚记的。
     * （2026-11-11 第 149 批之前，统计条跟着页顶「今天 / 近七天 / 本月」滑块走，
     * 停在「近 7 天」时新记的这几笔也一起变，更看不出是不是自己记的；现在滑块删了、
     * 统计恒为今天，这条理由只剩前半段，但历史窗仍然是更准的读法。）
     */
    const todayCount = async () => {
        await ui.goto('收益');
        await ui.clickLabel('查看历史收益，按角色与按天');
        const opened = await cdp.waitFor(
            `!!document.querySelector('[role="dialog"] .record-filters')`,
            {
                timeout: 4000,
            },
        );
        if (!opened) throw new Error('历史收益窗没打开');
        const raw = await cdp.evaluate(
            `document.querySelector('[role="dialog"] .record-foot-note')?.innerText ?? ''`,
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
        const opened = await cdp.waitFor(
            `!!document.querySelector('[role="dialog"] .log tbody tr')`,
            {
                timeout: 4000,
            },
        );
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

        t.info('本次写入的流水', `3 笔「${QUICK}」，下面删掉`);
        /* 历史窗的版式（2026-11-11）：用户要「表格斑马纹」「表格最外边加边框」「弹窗增大一点」。
         * 放在这里：今天刚写了三条自己的流水，表格是渲染出来的，斑马纹与外框才有东西可量。 */
        await t.step('历史窗放大到 900，表格有外框、隔行换底', async () => {
            await ui.goto('收益');
            await ui.clickLabel('查看历史收益，按角色与按天');
            const opened = await cdp.waitFor(
                `!!document.querySelector('[role="dialog"] .log tbody tr')`,
                { timeout: 4000 },
            );
            if (!opened) throw new Error('历史窗里没有流水行');

            /* 先把指针挪到角上再量颜色：鼠标还停在「查看历史收益」那一枚上时，它现在
             * 已经压在某一行上了，而悬停会改底色——那样量到的「第一行不铺底」永远是假的。 */
            await cdp.send('Input.dispatchMouseEvent', {
                type: 'mouseMoved',
                x: 2,
                y: 2,
                button: 'none',
                buttons: 0,
            });
            await sleep(200);

            /* 一次取全：视口、窗宽窗高、表格外框、前两行的底色。
             * 分开量要多跑几轮 CDP，而这几项本来就在同一屏里。
             *
             * 底色读的是 td 的 computedStyle，不是 class 名：要证的是「真的换了底」，
             * 读到 class 只能证明那段 CSS 存在。 */
            const look = await cdp.evaluate(`(() => {
                const panel = document.querySelector('.modal-panel');
                const table = document.querySelector('[role="dialog"] table.log');
                if (!panel || !table) return null;
                const cs = getComputedStyle(table);
                const rows = [...table.querySelectorAll('tbody tr')];
                const bgOf = (row) => {
                    const td = row && row.querySelector('td');
                    return td ? getComputedStyle(td).backgroundColor : '';
                };
                /* 表头与数据行同高、筛选行与表格之间的气、物品图标的边长、
                 * 顶上那排 tag——四件事都是「看上去对不对」，只有量得出来。 */
                const head = table.querySelector('thead th');
                const firstRow = rows[0];
                const icon = table.querySelector('tbody img');
                const bar = document.querySelector('.record-summary');
                const filters = document.querySelector('.record-filters');
                const boxOf = (el) => (el ? el.getBoundingClientRect() : null);
                const tags = [...document.querySelectorAll('.record-summary .sum-tag')];
                return {
                    vw: innerWidth,
                    vh: innerHeight,
                    w: Math.round(panel.getBoundingClientRect().width),
                    h: Math.round(panel.getBoundingClientRect().height),
                    border: cs.borderTopWidth + ' ' + cs.borderTopStyle,
                    radius: cs.borderRadius,
                    rows: rows.length,
                    first: bgOf(rows[0]),
                    second: bgOf(rows[1]),
                    wide: !!document.querySelector('[role="dialog"] .log thead .c-time.wide'),
                    headH: head ? Math.round(boxOf(head).height) : -1,
                    rowH: firstRow ? Math.round(boxOf(firstRow).height) : -1,
                    iconW: icon ? Math.round(boxOf(icon).width) : -1,
                    /* 两段气分别量：筛选行 → tag 排、tag 排 → 表框。合成一个总数会把
                     * 「挤在一起的 20」也当成合格。 */
                    gapTop: bar && filters ? Math.round(boxOf(bar).top - boxOf(filters).bottom) : -1,
                    gapTable: bar ? Math.round(boxOf(table).top - boxOf(bar).bottom) : -1,
                    tags: tags.length,
                    totalFirst: tags[0]?.classList.contains('total') === true,
                    totalText: (tags[0]?.textContent ?? '').replace(/\\s+/g, ''),
                    roleTags: tags.filter((el) => !el.classList.contains('total')).length,
                    /* 上面两个角：表格的圆角裁不掉方盒子的单元格（纸色会盖住那道弧），
                     * 所以四角那四格自己也要跟着圆。这里量的是「角上的格子确实带圆」
                     * 以及「内圆比外圆小一个边框宽」，两件事都对才没有切角。 */
                    tableR: parseFloat(cs.borderTopLeftRadius) || 0,
                    headCornerR: (() => {
                        const th = table.querySelector('thead th:first-child');
                        return th ? parseFloat(getComputedStyle(th).borderTopLeftRadius) || 0 : -1;
                    })(),
                    lastCornerR: (() => {
                        const last = rows[rows.length - 1];
                        const td = last && last.querySelector('td:first-child');
                        return td ? parseFloat(getComputedStyle(td).borderBottomLeftRadius) || 0 : -1;
                    })(),
                    whoColNames: [...new Set(
                        rows.map((r) => (r.querySelector('.c-who')?.innerText ?? '').trim()),
                    )].length,
                };
            })()`);
            if (!look) throw new Error('历史窗里没有表格');

            /* 宽度不写死 900：窗户比它窄时 max-width 会把它收在视口里，
             * 写死就成了「换个窗口尺寸必红」的断言。「有没有放大」与视口无关。 */
            const expectW = Math.min(900, look.vw - 48);
            t.check(
                '弹窗宽度按 900 取（原先是 720）',
                Math.abs(look.w - expectW) <= 2,
                `实际 ${look.w}px / 期望 ${expectW}px（视口 ${look.vw}）`,
            );
            /* 高度是**下限**不是定值：记录多时窗户可以更长，所以只判「不低于」。 */
            const expectH = Math.min(600, look.vh - 48);
            t.check(
                '窗高下限 600（原先是 520）',
                look.h >= expectH - 2,
                `实际 ${look.h}px / 期望 ${expectH}px（视口高 ${look.vh}）`,
            );

            /* 外框画在 table 上而不是滚动容器上：挂在容器上时行会从框底下滚过去。
             * border-collapse: separate 只为一件事——collapse 下 border-radius 不生效。 */
            t.check(
                '表格最外边有一圈边框',
                parseFloat(look.border) > 0 && look.border.endsWith(' solid'),
                `实际 ${look.border}`,
            );
            t.check('边框带圆角', look.radius !== '0px', `实际 ${look.radius}`);

            t.check('至少两行可比（斑马纹要有第二行）', look.rows >= 2, `实际 ${look.rows} 行`);
            /* 只比「两行颜色不同」不够稳：鼠标停在哪一行都会改颜色。所以奇数行必须是
             * 透明的（自己没有底色），偶数行才是那层浅染。 */
            t.check('第一行不铺底', look.first === 'rgba(0, 0, 0, 0)', `实际 ${look.first}`);
            t.check(
                '第二行铺了浅底（斑马纹）',
                look.second !== look.first,
                `奇数 ${look.first} / 偶数 ${look.second}`,
            );
            /* 圆角不能把边框切掉：角上的单元格自己也要带内圆，且比外沿小一个边框宽。 */
            t.check(
                '角上的格子跟着表格一起圆',
                look.headCornerR > 0 && look.lastCornerR > 0,
                `表头角 ${look.headCornerR}px / 末行角 ${look.lastCornerR}px`,
            );
            t.check(
                '内圆比外圆小一个边框宽',
                Math.abs(look.headCornerR - (look.tableR - 1)) <= 0.6,
                `外 ${look.tableR}px / 内 ${look.headCornerR}px`,
            );
            t.check('单日时时间列只有时刻（不加宽）', look.wide === false);

            /* 2026-11-11 用户四条：图标大一点、表头与列表同高、筛选与表格之间留气、
             * 总计与各号小计排成一排 tag。四条都是观感，只有量几何能证。 */
            t.check('物品图标放大到 20', look.iconW >= 20, `实际 ${look.iconW}px`);
            t.check(
                '表头与数据行同高',
                Math.abs(look.headH - look.rowH) <= 1,
                `表头 ${look.headH} / 行 ${look.rowH}`,
            );
            /* 两段气各自判：原来筛选行下沿到表框只有 8，读起来像表头的一部分。 */
            t.check('筛选行与 tag 排之间留了气', look.gapTop >= 10, `实际 ${look.gapTop}px`);
            t.check('tag 排与表格之间留了气', look.gapTable >= 6, `实际 ${look.gapTable}px`);

            /* 一排 tag：总计排第一、每个人一枚。总数要与表里出现的角色数对得上
             * （未指定的那枚也在——它同样是个"人"）。 */
            t.check('总计 + 各号小计是一排 tag', look.tags >= 2, `实际 ${look.tags} 枚`);
            t.check('总计排在第一位', look.totalFirst === true);
            t.check('总计那枚写着「总计」和一个数', /^总计/.test(look.totalText), look.totalText);
            t.check(
                '每个角色一枚 tag',
                look.roleTags === look.whoColNames,
                `标签 ${look.roleTags} / 表里的角色 ${look.whoColNames}`,
            );

            await cdp.key('Escape');
            await sleep(250);
        });

        /* 按角色筛选（2026-11-11）：历史窗里多了一个「按角色筛选」下拉。
         * 判据不依赖数据——挑一个号，要求每一行都是他；再切回「全部角色」，笔数回到原样。
         * 库里有没有这个人、他有没有账，都不影响这几条（0 行也放行，只要求口径自洽）。 */
        await t.step('历史窗能按角色筛选，切回全部角色笔数还原', async () => {
            const countOf = () =>
                cdp.evaluate(`(() => {
                    const d = document.querySelector('[role="dialog"]');
                    const dim = d?.querySelector('.record-foot-note')?.innerText ?? '';
                    return Number.parseInt(dim, 10);
                })()`);

            await ui.goto('收益');
            await ui.clickLabel('查看历史收益，按角色与按天');
            const opened = await cdp.waitFor(
                `!!document.querySelector('[role="dialog"] .record-foot-note')`,
                { timeout: 4000 },
            );
            if (!opened) throw new Error('历史收益窗没打开');

            const total = await countOf();
            t.check(
                '默认是「全部角色」',
                total === before + 3,
                `期望 ${before + 3}，实际 ${total}`,
            );

            await ui.clickLabel('按角色筛选');
            const listed = await cdp.waitFor(
                `!!document.querySelector('.select-list .opt-label')`,
                { timeout: 2000 },
            );
            if (!listed) throw new Error('按角色筛选没展开选项');
            const names = await cdp.evaluate(
                `[...document.querySelectorAll('.select-list .opt-label')].map((e) => e.textContent.trim())`,
            );
            /* 头两项固定是「全部角色」「未指定」，第三项起才是角色名。
             * 没有角色时退到「未指定」——那一格可能一条账都没有，所以下面的判据容得下 0 行。 */
            t.check(
                '选项里有「全部角色」与「未指定」',
                names[0] === '全部角色' && names[1] === '未指定',
                JSON.stringify(names.slice(0, 4)),
            );
            const chosen = names[2] ?? names[1];
            if (!chosen) throw new Error('按角色筛选里没有任何可选项');
            await ui.clickText('.select-list .opt-label', chosen, { exact: true });
            await sleep(300);

            const seen = await cdp.evaluate(`(() => {
                const d = document.querySelector('[role="dialog"]');
                return {
                    who: [...d.querySelectorAll('.log tbody tr')].map((r) =>
                        (r.querySelector('.c-who')?.innerText ?? '').trim(),
                    ),
                    blank: (d.querySelector('.record-empty')?.innerText ?? '').trim(),
                };
            })()`);
            const filtered = await countOf();
            t.check(
                '筛某个角色后每一行都是他',
                seen.who.every((one) => one === chosen),
                `挑的是「${chosen}」，行里是 ${JSON.stringify(seen.who.slice(0, 5))}`,
            );
            t.check(
                '笔数跟着行数走',
                filtered === seen.who.length,
                `笔数 ${filtered} / 行 ${seen.who.length}`,
            );
            t.check(
                '筛完要么有行、要么说一句没有',
                seen.who.length > 0 || seen.blank.includes('没有记录'),
                `行 ${seen.who.length} / 空态「${seen.blank}」`,
            );
            t.check('筛选不会筛出比全部还多', filtered <= total, `${filtered} > ${total}`);

            /* 切回「全部角色」：笔数回到筛选前，证明它是过滤而不是改写。 */
            await ui.clickLabel('按角色筛选');
            await cdp.waitFor(`!!document.querySelector('.select-list .opt-label')`, {
                timeout: 2000,
            });
            await ui.clickText('.select-list .opt-label', '全部角色', { exact: true });
            await sleep(300);
            const restored = await countOf();
            t.check(
                '切回全部角色，笔数回到原样',
                restored === total,
                `期望 ${total}，实际 ${restored}`,
            );

            await cdp.key('Escape');
            await sleep(250);
        });

        await t.step('把自己写进去的流水删干净', async () => {
            const removed = await dropNewest(QUICK, 3);
            t.check('删掉 3 条', removed === 3, `实际删了 ${removed} 条`);
            const now = await todayCount();
            t.check('今日笔数回到测试前', now === before, `期望 ${before}，实际 ${now}`);
            t.check('删除源流水后自动账目同步还原', await autoIncomeMatches());
        });

        /* ---------------- 上线计时、点卡单价、每日走势（2026-11-12 补） ----------------
         *
         * 第 145–149 批把「上线计时 + 点卡成本 + 两张走势图」整套做上了页，但一条烟测都没有。
         * 这三件事都会写库（上线记录，以及每日同步顺带写进账号账的那两行），所以这一节的
         * 做法是**自己造、自己删**：补一段一小时的上线，验完从记录窗里删掉，账回到原样。
         * 判据全部落在「只有我写的那一行才能满足」的事实上（备注是自造的标记），
         * 不数库里有几条上线记录——那会随用户自己的数据变红。
         */
        await t.step('点卡单价：点开能改，改完能改回原值', async () => {
            await ui.goto('收益');
            const tagLabel = async () =>
                cdp.evaluate(
                    `document.querySelector('.online-bar .price-tag')?.getAttribute('aria-label') ?? ''`,
                );
            const before = await tagLabel();
            t.check('状态条上有一枚点卡单价签', before.startsWith('点卡单价'), `实际「${before}」`);

            const openPrice = async () => {
                await ui.clickLabelPrefix('点卡单价 ');
                const opened = await cdp.waitFor(
                    `!!document.querySelector('input[aria-label="每点多少钱，以万为单位"]')`,
                    { timeout: 2500 },
                );
                if (!opened) throw new Error('点卡单价窗没打开');
                return cdp.evaluate(
                    `document.querySelector('input[aria-label="每点多少钱，以万为单位"]').value`,
                );
            };

            const current = await openPrice();
            t.check(
                '单价窗预填当前值（不让人对着空格重打一遍）',
                Number(current) > 0,
                `实际「${current}」`,
            );

            /* 只碰一个说得准的值，改完立刻改回来：跑完之后用户的单价要逐字相等。 */
            const temp = current === '2' ? '3' : '2';
            await ui.fill('每点多少钱，以万为单位', temp);
            await ui.clickLabel('保存点卡单价');
            const closed = await cdp.waitFor(`!document.querySelector('[role="dialog"]')`, {
                timeout: 3000,
            });
            t.check('保存后窗自己关掉', closed);
            const mid = await tagLabel();
            t.check(
                '单价签跟着换成新价',
                mid !== before && mid.startsWith('点卡单价'),
                `「${before}」→「${mid}」`,
            );

            await openPrice();
            await ui.fill('每点多少钱，以万为单位', current);
            await ui.clickLabel('保存点卡单价');
            await cdp.waitFor(`!document.querySelector('[role="dialog"]')`, { timeout: 3000 });
            const after = await tagLabel();
            t.check(
                '把单价改回原值（跑完不留痕）',
                after === before,
                `期望「${before}」，实际「${after}」`,
            );
        });

        let onlineTestRecorded = false;
        await t.step('补记一段上线：状态条与走势图都跟着走', async () => {
            await ui.goto('收益');
            const NOTE = 'E2E上线一段';

            await ui.clickLabel('补记一段已经过去的在线时长');
            const opened = await cdp.waitFor(
                `!!document.querySelector('[role="dialog"] .pill-group')`,
                { timeout: 2500 },
            );
            if (!opened) throw new Error('补记窗没打开');

            const hasWho = await cdp.evaluate(
                `!!document.querySelector('[role="dialog"] .pill-group button')`,
            );
            if (!hasWho) {
                /* 名册空时补记没有可选的号（窗里直接写「名册里还没有角色」），这一段跳过。 */
                t.info('补记', '名册里没有角色，本轮跳过——补记要先选一个号');
                await cdp.key('Escape');
                await sleep(250);
                return;
            }

            const freeRole = await cdp.evaluate(`(async () => {
                const { useOnline } = await ${importLoaded('/src/views/income/online-store.ts')};
                const { useRoster } = await ${importLoaded('/src/views/characters/roster.ts')};
                const start = Date.now() - 3600000;
                return useRoster().roster.value.findIndex((role) => !useOnline().sessions.value.some((one) => {
                    const ids = one.roster.length ? one.roster : [one.characterId];
                    return ids.includes(role.id) && one.startAt < Date.now() && (one.endAt ?? Infinity) > start;
                }));
            })()`);
            if (freeRole < 0) {
                t.info('补记', '所有角色最近一小时已有记录，跳过，避免重叠计时');
                await cdp.key('Escape');
                return;
            }
            await ui.markFirst(
                `() => document.querySelectorAll('[role="dialog"] .pill-group button')[${freeRole}]`,
            );
            await cdp.click('[data-e2e="1"]');
            const startBefore = await cdp.evaluate(
                `document.querySelector('[role="dialog"] .time-input')?.value`,
            );
            await ui.fillSel('[role="dialog"] .time-input', '99:99');
            await ui.clickLabel('补记');
            const invalid = await cdp.waitFor(
                `!!document.querySelector('[role="dialog"] .note.error')`,
                { timeout: 2000 },
            );
            t.check('错误时刻保留补记窗', invalid);
            await ui.fillSel('[role="dialog"] .time-input', startBefore);
            const recovered = await cdp.waitFor(
                `(() => {
                const button = document.querySelector('[role="dialog"] button[aria-label="补记"]');
                return button && !button.disabled && !document.querySelector('[role="dialog"] .note.error');
            })()`,
                { timeout: 2000 },
            );
            t.check('改正时刻后清除报错并恢复保存', recovered);
            const fit = await cdp.evaluate(`(() => {
                const row = document.querySelector('[role="dialog"] .times');
                return row && row.scrollWidth <= row.clientWidth + 1;
            })()`);
            t.check('起止时刻两列不产生横向溢出', fit);

            /* 备注留一个只有这一段才有的字：记录窗里靠它定位自己写的那一行，不猜位置。 */
            await ui.fillSel('.income-form input[maxlength="40"]', NOTE);
            /* 起止时刻用窗里的默认值（「一小时前 → 现在」）：那正是最常见的补记场景，
             * 顺手也验证默认值落在正时长上——不足一分钟的记录会被规则层直接拒掉。 */
            await ui.clickLabel('补记');
            const closed = await cdp.waitFor(`!document.querySelector('[role="dialog"]')`, {
                timeout: 3000,
            });
            t.check('补记后窗自己关掉', closed);
            onlineTestRecorded = closed;

            const bar = await cdp.evaluate(`(() => {
                const cells = [...document.querySelectorAll('.online-bar .online-totals .readout')];
                const pick = (cap) =>
                    cells.find(
                        (el) => (el.querySelector('.cap')?.textContent || '').trim() === cap,
                    );
                return {
                    minutes: (pick('今日在线')?.querySelector('.val')?.textContent || '').trim(),
                    running: document.querySelectorAll('.online-bar .live-chip').length,
                };
            })()`);
            t.check(
                '状态条的「今日在线」读出了时长',
                /\d/.test(bar.minutes),
                `实际「${bar.minutes}」`,
            );
            t.info('状态条', `今日在线 ${bar.minutes} · 在线胶囊 ${bar.running} 枚`);

            const charts = await cdp.evaluate(`(() => {
                return [...document.querySelectorAll('.chart-block')].map((block) => ({
                    head: (block.querySelector('h3')?.textContent || '').trim(),
                    drawn: !!block.querySelector('svg.chart-svg'),
                    panel: !!block.querySelector('.chart-panel > .chart-surface'),
                    edge: (() => {
                        const surface = block.querySelector('.chart-surface');
                        if (!surface) return false;
                        const frame = getComputedStyle(surface, '::after');
                        return frame.content !== 'none' && frame.boxShadow !== 'none'
                            && Number(frame.zIndex) > 0 && frame.pointerEvents === 'none';
                    })(),
                    shelf: !!block.querySelector('.chart-panel > .chart-legend-shelf'),
                    raised: (() => {
                        const columns = [...block.querySelectorAll('.chart-column')];
                        return columns.length > 0 && columns.every((one) => getComputedStyle(one).filter !== 'none'
                            && one.querySelector('.column-front') && one.querySelector('.column-side') && one.querySelector('.column-cap'));
                    })(),
                    series: block.querySelectorAll('.chart-series').length,
                    bars: block.querySelectorAll('.chart-column').length,
                    legendValues: [...block.querySelectorAll('.legend-value')].map((el) => el.textContent.trim()),
                }));
            })()`);
            t.check('两张走势图都在', charts.length === 2, `实际 ${charts.length} 张`);
            t.check(
                '绘图区立体边沿覆盖在固定纵轴之上且不拦截操作',
                charts.every((one) => one.edge),
            );
            t.check(
                '走势图使用完整底板，图例位于底板内',
                charts.every((one) => one.panel && (!one.drawn || one.shelf)),
            );
            t.check(
                '有数据的柱体具有正面、侧面和顶面',
                charts.filter((one) => one.drawn).every((one) => one.raised),
            );
            t.check(
                '「每日在线时长」按号画出柱体（不是一句空态）',
                charts[0]?.drawn === true && charts[0]?.series > 0 && charts[0]?.bars > 0,
                JSON.stringify(charts[0]),
            );
            t.check(
                '每条时长柱组的图例都显示末日数值',
                charts[0]?.legendValues.length === charts[0]?.series &&
                    charts[0]?.legendValues.every((value) => /\d/.test(value)),
                JSON.stringify(charts[0]?.legendValues),
            );
        });

        await t.step('柱图悬停日期明细、键盘切换与关闭', async () => {
            const point = await cdp.evaluate(`(() => {
                const svg = document.querySelector('.chart-block .chart-svg');
                if (!svg) return null;
                svg.scrollIntoView({ block: 'center' });
                const box = svg.getBoundingClientRect();
                const viewport = svg.closest('.chart-scroll').getBoundingClientRect();
                const guides = [...svg.querySelectorAll('.chart-guides line')];
                const first = guides[0];
                const last = guides[guides.length - 1];
                return { x: viewport.left + viewport.width / 2,
                    y: box.top + (Number(first.getAttribute('y1')) + Number(last.getAttribute('y1'))) / 2 };
            })()`);
            if (!point) throw new Error('缺少用于悬停的时长图');
            await cdp.send('Input.dispatchMouseEvent', {
                type: 'mouseMoved',
                ...point,
                button: 'none',
                buttons: 0,
            });
            t.check(
                '悬停显示日期、各系列明细与标记',
                await cdp.waitFor(
                    "!!document.querySelector('.chart-block .chart-tooltip .tooltip-heading') && document.querySelectorAll('.chart-block .tooltip-row').length > 0 && !!document.querySelector('.chart-hover-mark')",
                    { timeout: 2000 },
                ),
            );
            const before = await cdp.evaluate(
                "document.querySelector('.chart-block .chart-tooltip').getBoundingClientRect().left",
            );
            await cdp.send('Input.dispatchMouseEvent', {
                type: 'mouseMoved',
                x: point.x + 6,
                y: point.y,
                button: 'none',
                buttons: 0,
            });
            t.check(
                '明细随鼠标移动并留在图表内',
                await cdp.waitFor(
                    `(() => {
                const tip = document.querySelector('.chart-block .chart-tooltip');
                const host = document.querySelector('.chart-block .chart');
                if (!tip || !host) return false;
                const box = tip.getBoundingClientRect();
                const frame = host.getBoundingClientRect();
                return Math.abs(box.left - ${before}) > 1 && box.left >= frame.left && box.right <= frame.right
                    && box.top >= frame.top && box.bottom <= frame.bottom;
            })()`,
                    { timeout: 2000 },
                ),
            );
            t.check(
                '纵轴刻度只显示整数',
                await cdp.evaluate(`(() => {
                const labels = [...document.querySelectorAll('.chart-block .chart-axis:not(.chart-dates) text')].map((el) => el.textContent.trim());
                return labels.length >= 2 && labels.every((label) => /^[−-]?[\\d,]+ (元|万|分|时)$/.test(label));
            })()`),
            );
            await cdp.evaluate("document.querySelector('.chart-block .chart-svg').focus()");
            await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Home' });
            await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Home' });
            const firstDay = await cdp.evaluate(
                "document.querySelector('.chart-block .tooltip-heading')?.textContent",
            );
            await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'End' });
            await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'End' });
            t.check(
                'Home、End 查看不同日期',
                firstDay !==
                    (await cdp.evaluate(
                        "document.querySelector('.chart-block .tooltip-heading')?.textContent",
                    )),
            );
            await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape' });
            await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape' });
            t.check(
                'Esc 收起柱图明细',
                await cdp.waitFor("!document.querySelector('.chart-tooltip')", { timeout: 2000 }),
            );
            await cdp.evaluate("document.querySelector('.chart-block .chart-svg').blur()");
        });

        await t.step('上线记录窗里找到刚补的那一段，删掉之后账回到原样', async () => {
            if (!onlineTestRecorded) return;
            const NOTE = 'E2E上线一段';
            await ui.goto('收益');
            await ui.clickLabel('查看全部上线记录');
            const opened = await cdp.waitFor(
                `!!document.querySelector('[role="dialog"] .rec-table')`,
                { timeout: 3000 },
            );
            if (!opened) throw new Error('上线记录窗没打开');

            await ui.fillSel('input[aria-label="搜索上线记录"]', NOTE);
            await sleep(300);

            const rows = await cdp.evaluate(`(() => [
                ...document.querySelectorAll('[role="dialog"] .rec-table tbody tr'),
            ].map((tr) => ({
                time: (tr.querySelector('.c-time')?.textContent || '').trim(),
                dur: (tr.querySelector('.c-dur')?.textContent || '').trim(),
                who: (tr.querySelector('.c-who')?.textContent || '').trim(),
                note: (tr.querySelector('.c-note')?.textContent || '').trim(),
            })))()`);
            t.check('搜到刚补的那一段（只有一段）', rows.length === 1, JSON.stringify(rows));
            t.check(
                '时长是默认的「一小时前 → 现在」',
                rows[0]?.dur === '01:00',
                `实际「${rows[0]?.dur}」`,
            );
            t.check(
                '时段写成 HH:mm–HH:mm',
                /^\d{2}:\d{2}–\d{2}:\d{2}$/.test(rows[0]?.time ?? ''),
                `实际「${rows[0]?.time}」`,
            );
            t.check('备注原样留在记录上', rows[0]?.note === NOTE, `实际「${rows[0]?.note}」`);
            t.info('这一段的角色', rows[0]?.who ?? '');

            await ui.clickIn('[role="dialog"] .rec-table tbody tr', NOTE, { label: '改这一段' });
            const editOpened = await cdp.waitFor(
                `!!document.querySelector('[aria-label="结束时刻"]')`,
                { timeout: 3000 },
            );
            t.check('修改上线记录保留只读终点', editOpened);
            await cdp.key('Escape');
            await sleep(250);
            t.check(
                '关闭修改后保留记录筛选',
                await cdp.evaluate(
                    `document.querySelector('[aria-label="搜索上线记录"]')?.value === 'E2E上线一段'`,
                ),
            );

            await ui.clickIn('[role="dialog"] .rec-table tbody tr', NOTE, { label: '删这一段' });
            await sleep(300);
            await ui.clickText('button', '删除', { exact: true });
            await sleep(700);
            const left = await cdp.evaluate(
                `document.querySelectorAll('[role="dialog"] .rec-table tbody tr').length`,
            );
            t.check('删掉之后这一段不在了', left === 0, `还剩 ${left} 行`);

            await ui.clickLabel('关闭上线记录');
            await sleep(250);
        });

        /* 区间筛选（2026-11-11）：顶部从「一个日期」扩成「起 + 止 + 角色」。
         * 放在最末——它会翻到别的日子，不参与上面那串「笔数 +1」的核对。 */
        await t.step('历史窗的日期区间：默认今天、能往前翻、能跳回今天', async () => {
            const label = (dt) => `${dt.getFullYear()}年${dt.getMonth() + 1}月${dt.getDate()}日`;
            const now = new Date();
            const todayLabel = label(now);
            const prev = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
            const prevLabel = label(prev);

            await ui.goto('收益');
            await ui.clickLabel('查看历史收益，按角色与按天');
            /* 两条触发条 = 区间（起、止）。只查「有一条」时，退回单日的改动静默通过。 */
            const hasTrigger = await cdp.waitFor(
                `document.querySelectorAll('[role="dialog"] .date-trigger').length === 2`,
                { timeout: 4000 },
            );
            if (!hasTrigger) throw new Error('历史窗顶部不是「起 + 止」两条日期');

            /* 两条触发条的文本：[0] 是起点、[1] 是终点。 */
            const triggerTexts = () =>
                cdp.evaluate(
                    `[...document.querySelectorAll('[role="dialog"] .date-trigger')]
                        .map((el) => el.innerText.trim())`,
                );

            const first = (await triggerTexts())[0] ?? '';
            t.check('区间默认是今天（起点）', first.includes(todayLabel), `实际「${first}」`);
            const second = (await triggerTexts())[1] ?? '';
            t.check('区间默认是今天（终点）', second.includes(todayLabel), `实际「${second}」`);

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
                const box = panel.querySelector('.income-log-scroll');
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
            /* 正文的 `overflow` 与数据无关，两条都判；表格那一半要看**这一天有没有记录**：
             * `.income-log-scroll` 只在有行时渲染（空态是一句「这一天还没有记录」），没有行时它不存在，
             * 把它当成失败就是一条**随数据变红**的断言——2026-11-05 在这份库上真红过一次：
             * 当天三条测试流水刚被删干净，表格没渲染。 */
            t.check(
                '正文自己不滚（滚动只可能发生在表格里）',
                layout?.bodyOverflow === 'hidden',
                `正文 ${layout?.bodyOverflow}`,
            );
            if (layout?.boxOverflow === 'none') {
                t.info('表格滚动', '这一天没有记录，表格未渲染（有记录时才判 overflow）');
            } else {
                t.check(
                    '滚动交给表格',
                    layout?.boxOverflow === 'auto',
                    `表格 ${layout?.boxOverflow}`,
                );
            }

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
             * 下三行与「回到今天」被 `overflow: auto` 齐刀切掉，而界面看上去只是「月历很短」。
             * 2026-11-11 窗从 720 放大到 900 之后这条仍然要盯：宽度换了，纸片的落点跟着换。 */
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

            const afterPick = (await triggerTexts())[0] ?? '';
            t.check(
                '起点换到前一天后触发条跟着换',
                afterPick.includes(prevLabel),
                `实际「${afterPick}」`,
            );
            /* 起止不同天时**时间列要补上日期**：区间一跨天，「14:32」单独看分不出是哪一天。
             * 判据不依赖数据——`wide` 类画在表头格上，这一天有没有流水都在。 */
            const crossed = await cdp.evaluate(`(() => {
                const d = document.querySelector('[role="dialog"]');
                return {
                    wide: !!d.querySelector('.log thead .c-time.wide'),
                    blank: (d.querySelector('.record-empty')?.innerText ?? '').trim(),
                    body: !!d.querySelector('.log tbody tr'),
                };
            })()`);
            t.check(
                '跨天后有记录则时间列加宽，无记录则显示区间空态',
                crossed.body ? crossed.wide : crossed.blank.includes('这段时间'),
                JSON.stringify(crossed),
            );
            t.check(
                '区间里没有记录时说的是「这段时间」',
                crossed.body || crossed.blank.includes('这段时间'),
                `表头加宽 ${crossed.wide} · 空态「${crossed.blank}」`,
            );

            await cdp.click('[role="dialog"] .date-trigger');
            await sleep(200);
            await ui.clickText('button', '回到今天', { exact: true });
            await sleep(300);
            const back = (await triggerTexts())[0] ?? '';
            t.check('纸片里的「回到今天」跳得回来', back.includes(todayLabel), `实际「${back}」`);

            await cdp.key('Escape');
            await sleep(250);
        });
    }
}
