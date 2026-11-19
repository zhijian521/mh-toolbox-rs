import { importLoaded } from '../../cdp.mjs';

export default async function runHistory(ctx, tools, quick) {
    const { cdp, ui, t, sleep } = ctx;
    const { autoIncomeMatches, showAllHistory, todayCount, dropNewest } = tools;
    const { QUICK, before } = quick;

    t.info('本次写入的流水', `3 笔「${QUICK}」，下面删掉`);
    // 先写入本轮流水，确保斑马纹与外框有实际数据可量。
    await t.step('历史窗保留固定外框、角色汇总滑块与斑马纹', async () => {
        await ui.goto('收益');
        await ui.clickLabel('查看历史收益，按角色与按天');
        const opened = await cdp.waitFor(
            `!!document.querySelector('[role="dialog"] .log tbody tr')`,
            { timeout: 4000 },
        );
        if (!opened) throw new Error('历史窗里没有流水行');
        t.check(
            '日期区间保留起止日期入口和单一分隔符',
            await cdp.evaluate(`(() => {
                const range = document.querySelector('[role="dialog"] .date-range-field');
                return range?.querySelectorAll('.date-field').length === 2 &&
                    !!range.querySelector('[aria-label^="从哪一天"]') &&
                    !!range.querySelector('[aria-label^="到哪一天"]') &&
                    range.querySelectorAll('.date-range-separator[aria-hidden="true"]').length === 1;
            })()`),
        );

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
                const frame = panel?.querySelector('.history-table-frame');
                if (!panel || !table || !frame) return null;
                const cs = getComputedStyle(frame);
                const rows = [...table.querySelectorAll('tbody tr')];
                const bgOf = (row) => {
                    const td = row && row.querySelector('td');
                    return td ? getComputedStyle(td).backgroundColor : '';
                };
                /* 一次量表头、图标、固定外框及汇总滑块，避免分轮读取。 */
                const head = table.querySelector('thead th');
                const firstRow = rows[0];
                const icon = table.querySelector('tbody img');
                const bar = document.querySelector('.history-roles');
                const filters = document.querySelector('.record-filters');
                const boxOf = (el) => (el ? el.getBoundingClientRect() : null);
                const tags = [...document.querySelectorAll('.history-role-slider .step-opt')];
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
                    gapTop: bar && filters ? Math.round(boxOf(bar).top - boxOf(filters).bottom) : -1,
                    gapTable: bar ? Math.round(boxOf(frame).top - boxOf(bar).bottom) : -1,
                    tags: tags.length,
                    inlineSummaries: tags.every((tag) => {
                        const name = tag.querySelector('.history-role-name')?.getBoundingClientRect();
                        const net = tag.querySelector('.history-role-net')?.getBoundingClientRect();
                        return name && net && net.left >= name.right &&
                            Math.abs((name.top + name.bottom - net.top - net.bottom) / 2) < 1;
                    }),
                    totalFirst: tags[0]?.querySelector('.history-role-name')?.textContent === '总计',
                    totalText: (tags[0]?.textContent ?? '').replace(/\\s+/g, ''),
                    roleTags: tags.length - 1,
                    dropdown: !!panel.querySelector('.who-pick'),
                    radios: panel.querySelectorAll('[aria-label="按角色筛选"] [role="radio"]').length,
                    tabStops: tags.filter((el) => el.tabIndex === 0).length,
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

        /* 外框独立于滚动区，边缘由外框裁剪；原生表继续负责列对齐。 */
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

        t.check('物品图标放大到 20', look.iconW >= 20, `实际 ${look.iconW}px`);
        t.check(
            '表头与数据行同高',
            Math.abs(look.headH - look.rowH) <= 1,
            `表头 ${look.headH} / 行 ${look.rowH}`,
        );
        /* 两段气各自判：原来筛选行下沿到表框只有 8，读起来像表头的一部分。 */
        t.check('筛选行与滑块之间留了气', look.gapTop >= 10, `实际 ${look.gapTop}px`);
        t.check('滑块与表格之间留了气', look.gapTable >= 6, `实际 ${look.gapTable}px`);

        t.check('总计 + 各号小计使用多档滑块', look.tags >= 2 && look.radios === look.tags);
        t.check('每档角色名称与金额同行居中，不增加第二行高度', look.inlineSummaries);
        t.check('移除角色下拉，滑块只有一个 Tab 停靠点', !look.dropdown && look.tabStops === 1);
        t.check('总计排在第一位', look.totalFirst === true);
        t.check('总计档保留金额', /^总计.+/.test(look.totalText), look.totalText);
        t.check(
            '滑块涵盖所有记录归属及没有记录的现存角色',
            look.roleTags >= look.whoColNames,
            `标签 ${look.roleTags} / 表里的角色 ${look.whoColNames}`,
        );

        const scrollLook = await cdp.evaluate(`(async () => {
            const frame = document.querySelector('.history-table-frame');
            const box = frame.querySelector('.income-log-scroll');
            const head = box.querySelector('thead th');
            const previous = box.style.maxHeight;
            const top = box.scrollTop;
            try {
                box.style.maxHeight = '100px';
                box.scrollTop = 0;
                const before = { frame: frame.getBoundingClientRect(), head: head.getBoundingClientRect() };
                box.scrollTop = box.scrollHeight;
                await new Promise(requestAnimationFrame);
                const after = { frame: frame.getBoundingClientRect(), head: head.getBoundingClientRect() };
                return { moved: box.scrollTop > 0,
                    top: Math.abs(before.frame.top - after.frame.top),
                    bottom: Math.abs(before.frame.bottom - after.frame.bottom),
                    header: Math.abs(before.head.top - after.head.top),
                    border: getComputedStyle(frame).borderBottomWidth };
            } finally {
                box.style.maxHeight = previous;
                box.scrollTop = top;
            }
        })()`);
        t.check('表格实际滚动时表头与外框上下边缘不移动',
            scrollLook.moved && scrollLook.top < 1 && scrollLook.bottom < 1 &&
                scrollLook.header < 1 && parseFloat(scrollLook.border) > 0,
            JSON.stringify(scrollLook));

        const motion = await cdp.evaluate(`(async () => {
            const mask = document.querySelector('.modal-mask');
            const panel = mask.querySelector('.modal-panel');
            panel.querySelector('[data-modal-close]').click();
            await Promise.resolve();
            const held = mask.isConnected && mask.hasAttribute('data-modal-leaving');
            const inert = panel.hasAttribute('inert') && !panel.hasAttribute('aria-modal');
            const locked = document.querySelector('.page-content').style.overflow === 'hidden';
            await Promise.all(mask.getAnimations({ subtree: true }).map((one) => one.finished.catch(() => {})));
            await new Promise(requestAnimationFrame);
            return { held, inert, locked, removed: !mask.isConnected,
                focusReturned: document.activeElement?.getAttribute('aria-label') === '查看历史收益，按角色与按天',
                unlocked: document.querySelector('.page-content').style.overflow !== 'hidden' };
        })()`);
        t.check(
            '关闭保留原节点直到退场结束，期间禁用面板且锁住背景',
            motion.held && motion.inert && motion.locked && motion.removed && motion.unlocked,
            JSON.stringify(motion),
        );
        t.check('退场完成后焦点回到历史收益入口', motion.focusReturned);
    });

    /* 直接点击汇总滑块选角色；再切回总计，笔数回到原样。
     * 库里有没有这个人、他有没有账，都不影响这几条（0 行也放行，只要求口径自洽）。 */
    await t.step('历史窗能按角色筛选，切回全部角色笔数还原', async () => {
        const countOf = () =>
            cdp.evaluate(`(() => {
                    const d = document.querySelector('[role="dialog"]');
                    const dim = d?.querySelector('.record-foot-note')?.innerText ?? '';
                    return Number.parseInt(dim, 10);
                })()`);

        // 新页面上下文检验首次继承，后续同页面重开另验保留筛选。
        await ui.goto('角色');
        await ui.goto('收益');
        await ui.clickLabel('查看历史收益，按角色与按天');
        const opened = await cdp.waitFor(
            `!!document.querySelector('[role="dialog"] .record-foot-note')`,
            { timeout: 4000 },
        );
        if (!opened) throw new Error('历史收益窗没打开');

        const expectedWho = await cdp.evaluate(`(async () => {
                const { useIncome } = await ${importLoaded('/src/views/income/income-store.ts')};
                const { useRoster } = await ${importLoaded('/src/views/characters/roster.ts')};
                const id = useIncome().target.value[0];
                return id ? (useRoster().roster.value.find((one) => one.id === id)?.name || '未命名') : '总计';
            })()`);
        t.check(
            '历史继承当前速记角色',
            await cdp.evaluate(
                `document.querySelector('.history-role-slider [aria-checked="true"] .history-role-name')?.textContent === ${JSON.stringify(expectedWho)}`,
            ),
        );
        await showAllHistory();
        const total = await countOf();
        t.check(
            '切到全部角色后包含全部今日记录',
            total === before + 3,
            `期望 ${before + 3}，实际 ${total}`,
        );

        const names = await cdp.evaluate(
            `[...document.querySelectorAll('.history-role-name')].map((e) => e.textContent.trim())`,
        );
        const summaries = await cdp.evaluate(
            `document.querySelector('.history-role-slider').textContent`,
        );
        /* 头两项固定是「总计」「未指定」，第三项起才是角色名。
         * 没有角色时退到「未指定」——那一格可能一条账都没有，所以下面的判据容得下 0 行。 */
        t.check(
            '选项里有「总计」与「未指定」',
            names[0] === '总计' && names[1] === '未指定',
            JSON.stringify(names.slice(0, 4)),
        );
        const chosen = names[2] ?? names[1];
        if (!chosen) throw new Error('按角色筛选里没有任何可选项');
        await ui.clickText('.history-role-slider .history-role-name', chosen, { exact: true });
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
            Math.min(filtered, 20) === seen.who.length,
            `笔数 ${filtered} / 行 ${seen.who.length}`,
        );
        t.check(
            '筛完要么有行、要么说一句没有',
            seen.who.length > 0 || seen.blank.includes('没有记录'),
            `行 ${seen.who.length} / 空态「${seen.blank}」`,
        );
        t.check('筛选不会筛出比全部还多', filtered <= total, `${filtered} > ${total}`);
        t.check(
            '选择单个角色后，其他角色档位和小计保持完整',
            (await cdp.evaluate(`document.querySelector('.history-role-slider').textContent`)) ===
                summaries,
        );

        await cdp.key('Escape');
        await sleep(250);
        await ui.clickLabel('查看历史收益，按角色与按天');
        await cdp.waitFor(`!!document.querySelector('.history-role-slider [aria-checked="true"]')`);
        t.check(
            '同一页面重开保留选中的角色',
            (await cdp.evaluate(
                `document.querySelector('.history-role-slider [aria-checked="true"] .history-role-name')?.textContent`,
            )) === chosen,
        );

        /* 切回「全部角色」：笔数回到筛选前，证明它是过滤而不是改写。 */
        await showAllHistory();
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
}
