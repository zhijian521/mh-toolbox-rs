import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { dataDir } from '../../db.mjs';
import { importLoaded } from '../../cdp.mjs';

export default async function runQuick(ctx, tools) {
    const { cdp, ui, t, sleep, baseline, dbCount } = ctx;
    const { autoIncomeMatches, statCells, todayCount } = tools;

    const QUICK = '60武器';
    let before = null;

    await t.step('记录测试前的今日笔数', async () => {
        before = await todayCount();
        t.info('今天已有', `${before} 笔`);
    });

    await t.step('收益与上线读取失败各自降级，恢复后重用原数据', async () => {
        await ui.gotoReady('收益');
        const result = await cdp.evaluate(`(async () => {
            const { useIncome } = await ${importLoaded('/src/views/income/income-store.ts')};
            const { useOnline } = await ${importLoaded('/src/views/income/online-store.ts')};
            const income = useIncome();
            const online = useOnline();
            const errors = [income.loadError.value, online.loadError.value];
            const before = JSON.stringify([income.entries.value, online.sessions.value]);
            const tick = () => new Promise(resolve => requestAnimationFrame(resolve));
            const charts = () => [...document.querySelectorAll('.chart-block')];
            const state = {};
            try {
                income.loadError.value = 'E2E收益读取失败';
                online.loadError.value = '';
                await tick();
                const dump = document.querySelector('.today-dump');
                state.incomeFailed = dump?.textContent.includes('收益未读取') &&
                    !dump.querySelector('.total, .g') &&
                    !charts()[1]?.querySelector('.trend') &&
                    !!charts()[0]?.querySelector('.trend');
                income.loadError.value = '';
                online.loadError.value = 'E2E上线读取失败';
                await tick();
                state.onlineFailed = !!document.querySelector('.today-dump .total') &&
                    !charts()[0]?.querySelector('.trend') &&
                    charts()[0]?.textContent.includes('上线记录未读取') &&
                    !!charts()[1]?.querySelector('.trend');
            } finally {
                income.loadError.value = errors[0];
                online.loadError.value = errors[1];
                await tick();
            }
            state.restored = JSON.stringify([income.entries.value, online.sessions.value]) === before &&
                charts().length === 2 && charts().every(el => el.querySelector('.trend')) &&
                !!document.querySelector('.today-dump .total');
            return state;
        })()`);
        t.check('收益失败不显示正常净额、撤回或收益图，时长图仍可读', result.incomeFailed);
        t.check('上线失败只隐藏时长图，今日速记及收益图保留', result.onlineFailed);
        t.check('恢复后图表重现，原始记录没有变化', result.restored);
    });

    await t.step('收益工具归位：文件操作在速记卡头，点卡与上线管理在右上方', async () => {
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
                const priceHeight = document.querySelector('.online-bar .price-tag')?.getBoundingClientRect().height ?? 0;
                const onlineHead = document.querySelector('.online-bar .section-head');
                const toolbar = document.querySelector('.online-tools');
                const tools = [document.querySelector('.card-settings'), ...onlineButtons];
                const boxes = tools.map((el) => el?.getBoundingClientRect());
                return {
                    filesAtHead,
                    onlineAtBar: onlineAtBar && tools.every((el) => el?.closest('.section-head') === onlineHead),
                    targetsVisible: !!targets && !targets.closest('.section-head') &&
                        targets.scrollWidth <= targets.clientWidth + 1,
                    singleTarget: !!targets?.querySelector('[role="radiogroup"]') &&
                        targets.querySelectorAll('[role="radio"][aria-checked="true"]').length === 1 &&
                        !targets.querySelector('[aria-pressed]'),
                    quietActions: [...fileButtons, ...onlineButtons].every((button) =>
                        button?.classList.contains('text-btn') && button.textContent.trim() &&
                        button.title && !button.querySelector('.press-tile') &&
                        getComputedStyle(button).boxShadow === 'none' &&
                        getComputedStyle(button).backgroundColor === 'rgba(0, 0, 0, 0)'),
                    consistentOnline: onlineHeights.every((height) => height > 0 &&
                        Math.abs(height - priceHeight) < 1),
                    switchLast: !!document.querySelector('.card-settings > .cost-switch:last-child'),
                    toolOrder: (() => {
                        const ordered = [onlineButtons[0], onlineButtons[1],
                            document.querySelector('.price-tag'), document.querySelector('.card-settings > .cost-switch')];
                        return document.querySelector('.income-stack').clientWidth < 760 ||
                            ordered.every((el, i) => el && (!i ||
                                ordered[i - 1].getBoundingClientRect().right <= el.getBoundingClientRect().left + 1));
                    })(),
                    conciseLabels: !document.querySelector('.card-settings > .cap, .roster-label, .targets > .lbl'),
                    toolsFit: !!toolbar && toolbar.scrollWidth <= toolbar.clientWidth + 1,
                    sameRow: document.querySelector('.income-stack').clientWidth < 760 ||
                        boxes.every((box) => box && Math.abs((box.top + box.bottom) / 2 -
                            (boxes[0].top + boxes[0].bottom) / 2) < 2),
                };
            })()`);
        t.check('导出导入属于物品速记标题栏', layout.filesAtHead);
        t.check('点卡设置、补记和记录同属卡片标题栏', layout.onlineAtBar);
        t.check('记给谁独立常驻且不横向溢出', layout.targetsVisible);
        t.check('物品速记指定人单选，始终只有一个选中项', layout.singleTarget);
        t.check('补记、记录和导入导出共用无底板文字按钮', layout.quietActions);
        t.check('补记、记录、点卡价格高度一致', layout.consistentOnline);
        t.check('右起为计入开关、点卡设置、记录、补记', layout.switchLast && layout.toolOrder);
        t.check('移除点卡、在线和记给的独立标签', layout.conciseLabels);
        t.check('右上操作不横向溢出，宽窗保持同一排', layout.toolsFit && layout.sameRow);
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
        t.info('单价来源', hadPrice ? '用户原本就有（跑完不动它）' : '测试临时设的（跑完清掉）');

        const after = await todayCount();
        t.check('记一笔后今日笔数 +1', after === before + 1, `${before} → ${after}`);
        t.check('速记净额按日期角色自动同步到账户，收支方向与金额一致', await autoIncomeMatches());
        baseline.quickPricedByTest = !hadPrice;
    });

    /* 今日速记已有小计，在线卡旁只保留净额、笔数和昨日对比。 */
    await t.step('在线卡左侧收益票据保留净额、笔数与昨日对比', async () => {
        await ui.goto('收益');
        const cells = await statCells();
        t.check('摘要只保留两项', cells.length === 2, `实际 ${cells.length}`);
        const caps = cells.map((one) => one.cap).join('/');
        t.check('名目顺序为净额和笔数', caps === '净额/笔数', caps);
        t.check(
            '摘要保留副文与昨日对比',
            cells.every((one) => one.sub && one.delta),
        );
        t.check(
            '底部统一为简短昨日读数',
            cells.every((one) => one.sub.startsWith('昨日') && !one.sub.includes(' ')),
            cells.map((one) => one.sub).join('/'),
        );
        t.check('笔数对比是「±N 笔」', /^[+−±]\d+ 笔$/.test(cells[1].delta), cells[1].delta);
        const subtotal = await cdp.evaluate(
            "document.querySelector('.today-dump .total .v')?.textContent.trim()",
        );
        t.check('摘要净额与今日速记小计一致', cells[0].value === subtotal);
    });

    /* 摘要共用一张票据；比较实际材质与数值颜色，避免只证明类名存在。 */
    await t.step('收益标签并入在线卡，保留读数与收支语义', async () => {
        await ui.goto('收益');
        const look = await cdp.evaluate(`(() => {
                const summary = document.querySelector('.online-bar .income-summary');
                const cards = [...(summary?.querySelectorAll('.stat') ?? [])];
                const boards = [...document.querySelectorAll('.income-stack .board')];
                if (!summary || cards.length !== 2) return null;
                const inkOf = (name) => {
                    const probe = document.createElement('span');
                    probe.style.color = name;
                    document.body.appendChild(probe);
                    const value = getComputedStyle(probe).color;
                    probe.remove();
                    return value;
                };
                const values = cards.map((el) => el.querySelector('.v'));
                const bounds = summary.getBoundingClientRect();
                return {
                    heading: document.querySelector('.online-bar .section-head h2')?.textContent.trim(),
                    folded: summary.classList.contains('folded-card') && summary.dataset.spine === 'left',
                    paired: (() => {
                        const online = document.querySelector('.online-summary');
                        const tickets = document.querySelector('.online-tickets');
                        const roster = document.querySelector('.online-roster');
                        if (!online || !tickets || !roster) return false;
                        const first = online.getBoundingClientRect();
                        const frame = tickets.getBoundingClientRect();
                        const right = roster.getBoundingClientRect();
                        return online.classList.contains('folded-card') && online.dataset.spine === 'left' &&
                            Math.abs(first.left - frame.left) < 1 &&
                            (document.querySelector('.income-stack').clientWidth <= 900 ||
                                right.left >= frame.right);
                    })(),
                    merged: !document.querySelector('.income-stack > .income-summary'),
                    singleSurface: cards.every((el) => !el.classList.contains('board') &&
                        getComputedStyle(el).boxShadow === 'none'),
                    plainBoards: boards.length > 0 && boards.every((el) =>
                        getComputedStyle(el).backgroundImage === 'none'),
                    contained: cards.every((el) => {
                        const box = el.getBoundingClientRect();
                        const spine = summary.querySelector('.folded-spine').getBoundingClientRect();
                        return box.left >= spine.right + 15 && box.right <= bounds.right + 1;
                    }),
                    readableFooters: [...document.querySelectorAll('.online-tickets .sub, .online-tickets .delta')]
                        .every((el) => {
                            const row = el.closest('.stat').getBoundingClientRect();
                            const box = el.getBoundingClientRect();
                            return el.scrollWidth <= el.clientWidth + 1 &&
                                el.scrollHeight <= el.clientHeight + 1 &&
                                box.left >= row.left - 1 && box.right <= row.right + 1;
                        }),
                    noRosterTitle: !document.querySelector('.online-roster h3'),
                    roleLayout: (() => {
                        const list = document.querySelector('.online-roster .role-list');
                        const items = [...(list?.querySelectorAll('.role-item') ?? [])];
                        const ticket = document.querySelector('.online-summary');
                        const roster = document.querySelector('.online-roster');
                        const beside = roster && ticket && roster.getBoundingClientRect().left >= ticket.getBoundingClientRect().right;
                        return {
                            noBatch: !document.querySelector('.online-roster [aria-label^="一键上号"]'),
                            topAligned: !beside || !items.length ||
                                Math.abs(items[0].getBoundingClientRect().top - ticket.getBoundingClientRect().top) < 1,
                            autoWidth: items.every(el => el.getBoundingClientRect().width <= list.clientWidth + 1 &&
                                el.scrollWidth <= el.clientWidth + 1) && (() => {
                                const item = items[0];
                                const name = item?.querySelector('.name');
                                if (!name) return true;
                                const original = name.textContent;
                                try {
                                    name.textContent = '甲';
                                    const shortWidth = item.getBoundingClientRect().width;
                                    name.textContent = '甲乙丙丁戊己';
                                    const longWidth = item.getBoundingClientRect().width;
                                    return longWidth > shortWidth + 1 && longWidth <= list.clientWidth + 1;
                                } finally {
                                    name.textContent = original;
                                }
                            })(),
                            keycaps: items.every(el => {
                                const start = el.querySelector('.role-start.keycap-btn');
                                const face = start?.querySelector('.keycap-face');
                                const stop = el.querySelector('.role-stop');
                                return start instanceof HTMLButtonElement && face &&
                                    start.type === 'button' && !el.classList.contains('side-tab-surface') &&
                                    getComputedStyle(start).backgroundImage.includes('linear-gradient') &&
                                    getComputedStyle(face).backgroundImage.includes('radial-gradient') &&
                                    getComputedStyle(face).boxShadow !== 'none' &&
                                    !!face.querySelector('.keycap-indicator[aria-hidden=true]') &&
                                    start.classList.contains('is-active') === el.classList.contains('is-running') &&
                                    !start.querySelector('button') && !stop &&
                                    el.querySelectorAll('button').length === 1;
                            }),
                        };
                    })(),
                    colors: values.map((el) => getComputedStyle(el).color),
                    tones: values.map((el) => el.classList.contains('loss') ? 'loss' :
                        el.classList.contains('gain') ? 'gain' : 'num'),
                    positive: inkOf('var(--positive)'),
                    negative: inkOf('var(--negative)'),
                    neutral: inkOf('var(--ink)'),
                };
            })()`);
        if (!look) throw new Error('收益页上没找到完整的统计摘要');
        t.check('区块标题简化为在线点卡', look.heading === '在线点卡');
        t.check('收益统计使用左侧纸脊，不在每格叠卡', look.folded && look.singleSurface);
        t.check('收益摘要合并在在线卡内部', look.merged);
        t.check('在线与收益均用左侧纸脊并靠左，宽窗角色位于右侧', look.paired);
        t.check('收益外卡使用纯色纸面', look.plainBoards);
        t.check('两项统计避开左侧纸脊并保持在摘要范围内', look.contained);
        t.check('双票据昨日读数和增减完整显示、不裁切', look.readableFooters);
        t.check('角色列表不再重复展示标题', look.noRosterTitle);
        t.check('角色区移除一键上号', look.roleLayout.noBatch);
        t.check('并排时角色首项与票据顶面对齐', look.roleLayout.topAligned);
        t.check('角色键按内容自适应宽度，窄区不溢出', look.roleLayout.autoWidth);
        t.check('角色使用带状态灯的弧面瓷键，同一按钮开始和结束', look.roleLayout.keycaps);
        for (const [index, label] of ['净额', '笔数'].entries()) {
            const expected =
                look.tones[index] === 'gain'
                    ? look.positive
                    : look.tones[index] === 'loss'
                      ? look.negative
                      : look.neutral;
            t.check(
                label + '读数使用对应业务色',
                look.colors[index] === expected,
                look.colors[index] + ' / ' + expected,
            );
        }
    });

    await t.step('角色排成三行或两行时，按钮不再按便签高度拉伸', async () => {
        const original = await cdp.evaluate(`(() => {
                const list = document.querySelector('.role-list');
                const ticket = document.querySelector('.income-summary');
                const items = [...(list?.querySelectorAll('.role-item') ?? [])];
                if (!list || !ticket || items.length < 3 ||
                    document.querySelector('.online-roster .note.error, .unlisted') ||
                    list.getBoundingClientRect().left < ticket.getBoundingClientRect().right) return null;
                const sizes = items.slice(0, 3).map(item => {
                    const box = item.getBoundingClientRect();
                    return { width: box.width, height: box.height };
                });
                const gap = Number.parseFloat(getComputedStyle(list).columnGap) || 0;
                if (list.clientWidth + 1 < Math.max(...sizes.map(item => item.width)) * 2 + gap) return null;
                const style = document.createElement('style');
                style.id = 'e2e-role-alignment';
                style.textContent = '.online-bar .role-list { display: grid !important; grid-template-columns: max-content !important; justify-items: start; }' +
                    '.online-bar .role-item:nth-child(n + 4) { display: none !important; }';
                document.head.appendChild(style);
                return sizes;
            })()`);
        if (!original) {
            t.info('三行专项未执行', '需要至少三个角色、双便签并排、无读取错误且角色区可容纳两列');
            return;
        }
        try {
            const aligned = await cdp.waitFor(
                `(() => {
                    const list = document.querySelector('.role-list');
                    const boxes = [...list.querySelectorAll('.role-item')].filter(el => el.getClientRects().length)
                        .map(el => el.getBoundingClientRect());
                    const rows = new Set(boxes.map(box => Math.round(box.top)));
                    return rows.size === 3 && boxes.every((box, index) =>
                        Math.abs(box.height - ${JSON.stringify(original)}[index].height) < 1 &&
                        Math.abs(box.width - ${JSON.stringify(original)}[index].width) < 1);
                })()`,
                { timeout: 2500 },
            );
            t.check('三行保持原有按钮高度，不跟随便签拉高', aligned);
            await cdp.evaluate(`document.getElementById('e2e-role-alignment').textContent =
                ${JSON.stringify(
                    '.online-bar .role-list { display: grid !important; grid-template-columns: repeat(2, max-content) !important; justify-items: start; }' +
                        '.online-bar .role-item:nth-child(n + 4) { display: none !important; }',
                )}`);
            t.check(
                '两行与三行保持同样的自然尺寸',
                await cdp.waitFor(
                    `(() => {
                    const list = document.querySelector('.role-list');
                    const boxes = [...list.querySelectorAll('.role-item')].filter(el => el.getClientRects().length)
                        .map(el => el.getBoundingClientRect());
                    const rows = new Set(boxes.map(box => Math.round(box.top)));
                    return rows.size === 2 && boxes.every((box, index) =>
                        Math.abs(box.height - ${JSON.stringify(original)}[index].height) < 1 &&
                        Math.abs(box.width - ${JSON.stringify(original)}[index].width) < 1);
                })()`,
                    { timeout: 2500 },
                ),
            );
        } finally {
            await cdp.evaluate(`document.getElementById('e2e-role-alignment')?.remove()`);
        }
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
            file.format === 2 && file.app === 'mh-toolbox-rs',
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
        t.check('库里单价条数与导出前一致', now === priceCount, `期望 ${priceCount}，实际 ${now}`);

        await ui.reload();
        const after = await dbCount('income_load', 'prices');
        t.check('重载后单价还在（写回的是库，不是内存）', after === priceCount, `实际 ${after}`);
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
