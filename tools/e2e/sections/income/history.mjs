import { importLoaded } from '../../cdp.mjs';

export default async function runHistory(ctx, tools, quick) {
    const { cdp, ui, t, sleep } = ctx;
    const { autoIncomeMatches, showAllHistory, todayCount, dropNewest } = tools;
    const { QUICK, before } = quick;

    t.info('本次写入的流水', `3 笔「${QUICK}」，下面删掉`);
    // 先写入本轮流水，确保斑马纹与外框有实际数据可量。
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
                return id ? (useRoster().roster.value.find((one) => one.id === id)?.name || '未命名') : '全部角色';
            })()`);
        t.check(
            '历史继承当前速记角色',
            await cdp.evaluate(
                `document.querySelector('[aria-label="按角色筛选"]').textContent.includes(${JSON.stringify(expectedWho)})`,
            ),
        );
        await showAllHistory();
        const total = await countOf();
        t.check(
            '切到全部角色后包含全部今日记录',
            total === before + 3,
            `期望 ${before + 3}，实际 ${total}`,
        );

        await ui.clickLabel('按角色筛选');
        const listed = await cdp.waitFor(`!!document.querySelector('.select-list .opt-label')`, {
            timeout: 2000,
        });
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
}
