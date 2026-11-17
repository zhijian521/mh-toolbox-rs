export default async function runDates(ctx) {
    const { cdp, ui, t, sleep } = ctx;

    // 最后切换日期，不干扰前面的今日笔数核对。
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
            t.check('滚动交给表格', layout?.boxOverflow === 'auto', `表格 ${layout?.boxOverflow}`);
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

        const retainedDates = await triggerTexts();
        await cdp.key('Escape');
        await sleep(250);
        await ui.clickLabel('查看历史收益，按角色与按天');
        await ui.waitFor(`document.querySelectorAll('[role="dialog"] .date-trigger').length === 2`);
        t.check(
            '关闭重开保留历史日期条件',
            JSON.stringify(await triggerTexts()) === JSON.stringify(retainedDates),
        );
        await cdp.key('Escape');
    });
}
