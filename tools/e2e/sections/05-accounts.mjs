/* ============================ 5. 账号 ============================ */

export default async function run(ctx) {
    const { cdp, ui, t, want, sleep } = ctx;

    if (want('账号')) {
        t.section('5 账号 · 两本账 · 角色分类堆叠图 · 记一笔 → 历史里删掉');
        let baseline;
        const rmbNumber = (text) => Number(text.replace('−', '-').replace(/[^0-9.-]/g, ''));

        await t.step('两本账与十一个快捷入口都在', async () => {
            await ui.gotoReady('账号');
            const shape = await cdp.evaluate(`(() => ({
                books: document.querySelectorAll('.books .book').length,
                shortcuts: document.querySelectorAll('.shortcuts .shortcut').length,
                shortcutContent: [...document.querySelectorAll('.shortcuts .shortcut')].every((one) =>
                    one.querySelector('.press-tile.wide') && one.querySelector('.sc-copy small') && one.querySelector('.sc-total small') && one.scrollWidth <= one.clientWidth + 1),
                charts: document.querySelectorAll('.account-charts .analysis-card').length,
                chartSurfaces: document.querySelectorAll('.account-charts .chart-panel > .chart-surface').length,
                barFrame: [...document.querySelectorAll('.bar-frame')].every((one) =>
                    one.classList.contains('chart-surface') && !!one.querySelector('.bar-axis') && !!one.closest('.chart-panel')?.querySelector('.chart-legend-shelf')),
                barDepth: [...document.querySelectorAll('.column.has-value')].every((one) => {
                    const face = one.querySelector('.column-segment') ?? one;
                    return getComputedStyle(face, '::after').content !== 'none' && parseFloat(getComputedStyle(face, '::after').width) >= 6 && getComputedStyle(face).backgroundImage !== 'none';
                }),
                roleChart: (() => {
                    const host = document.querySelector('.account-charts');
                    const role = document.querySelector('.character-flow');
                    const plot = role?.querySelector('.columns-scroll');
                    return host && role ? {
                        fullWidth: Math.abs(host.getBoundingClientRect().width - role.getBoundingClientRect().width) < 1,
                        fits: !plot || plot.scrollWidth <= plot.clientWidth + 1,
                    } : null;
                })(),
                whoWidth: document.querySelector('.who-pick')?.getBoundingClientRect().width,
                history: !!document.querySelector('[aria-label="查看账号历史记录"]'),
                primary: document.querySelector('[aria-label="记一笔账号收支"]')?.classList.contains('seal'),
                bottom: (() => {
                    const recent = document.querySelector('.account-bottom .records')?.getBoundingClientRect();
                    const channel = document.querySelector('.account-bottom .channel-card')?.getBoundingClientRect();
                    return recent && channel ? { sameRow: Math.abs(recent.top - channel.top) < 1, sameWidth: Math.abs(recent.width - channel.width) < 1, channelFirst: channel.left < recent.left } : null;
                })(),
            }))()`);

            /* 两本账是这一页的立论：合成一张「总收支」等于把元与万加起来。
             * 少一张就是回到了那个错。 */
            t.check('并排两本账', shape.books === 2, `实际 ${shape.books}`);
            t.check('快捷入口 11 个', shape.shortcuts === 11, `实际 ${shape.shortcuts}`);
            t.check('快捷卡共用按钮材质并保留说明、金额与笔数，无横向溢出', shape.shortcutContent);
            t.check('两张走势与一张角色分类图', shape.charts === 3);
            t.check(
                '账号图表共用台面材质，非零柱带亮面与侧面',
                shape.chartSurfaces >= 2 && shape.barDepth && shape.barFrame,
            );
            t.check('历史入口在页头', shape.history);
            t.check(
                '角色分类图占满整行且无横向滚动',
                shape.roleChart?.fullWidth && shape.roleChart?.fits,
            );
            t.check('角色筛选不撑满', shape.whoWidth > 100 && shape.whoWidth < 230);
            t.check('渠道在左、最近记录在右', shape.bottom?.channelFirst);
            t.check('记一笔使用主操作色', shape.primary);
            t.check('最近记录与渠道图表等宽并排', shape.bottom?.sameRow && shape.bottom?.sameWidth);
            baseline = await cdp.evaluate(`(() => {
                const book = [...document.querySelectorAll('.books .book')].find((one) => one.textContent.includes('人民币'));
                return [...book.querySelectorAll('.metrics b')].map((one) => one.textContent.trim());
            })()`);
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

            await ui.fill('备注', MARK);
            await ui.fill('成交金额', '12.');
            t.check(
                '金额输入小数点时保留草稿',
                await cdp.evaluate(`document.activeElement?.value === '12.'`),
            );
            await ui.fill('成交金额', '');
            t.check(
                '清空金额立即禁止记入',
                await cdp.evaluate(
                    `document.querySelector('button[aria-label="记入账本"]')?.disabled === true`,
                ),
            );
            await ui.fill('成交金额', '12.5');
            t.check(
                '金额未失焦即可记入',
                await cdp.evaluate(
                    `document.activeElement?.getAttribute('aria-label') === '成交金额' && document.querySelector('button[aria-label="记入账本"]')?.disabled === false`,
                ),
            );
            await sleep(150);
            await ui.clickText('button', '记入', { exact: true });
            await sleep(500);

            const closed = await cdp.evaluate(`!document.querySelector('[role="dialog"]')`);
            t.check('记完弹窗自己关了', closed);

            /* 默认币种人民币、默认方向支出，所以第一行应该是 `−12.5 元`。
             * 这条同时钉住「金额按币种格式化」：写成 `12.5 万` 就说明币种串了。 */
            const first = await cdp.evaluate(`(() => {
                const row = [...document.querySelectorAll('.recent-row')].find((one) => one.getAttribute('aria-label')?.includes('⚠E2E账号'));
                if (!row) return null;
                return ['.recent-date', '.recent-title', '.recent-note', '.recent-who', '.recent-amount'].map((selector) => row.querySelector(selector)?.textContent.trim() ?? '');
            })()`);
            t.check('最近记录里出现这一条', Boolean(first), '一行都没有');
            t.check(
                '金额是 −12.5 元（人民币按元、支出带负号）',
                Boolean(first) && first[first.length - 1] === '−12.5 元',
                `实际「${first ? first[first.length - 1] : ''}」`,
            );
        });

        await t.step('柱图悬停与键盘显示渠道收支明细', async () => {
            t.check(
                '柱图整数刻度中心与参考线对齐',
                await cdp.evaluate(`(() => {
                const labels = [...document.querySelectorAll('.channel-card .bar-axis > span')];
                const guides = [...document.querySelectorAll('.channel-card .column-guides > span')];
                return labels.length >= 2 && labels.length === guides.length && labels.every((label, index) => {
                    const box = label.getBoundingClientRect();
                    return Math.abs(box.top + box.height / 2 - guides[index].getBoundingClientRect().top) <= 1;
                });
            })()`),
            );
            const point = await cdp.evaluate(`(() => {
                const group = document.querySelector('.channel-card .column-group');
                if (!group) return null;
                group.scrollIntoView({ block: 'center' });
                const box = group.getBoundingClientRect();
                return { x: box.left + box.width / 2, y: box.top + 90 };
            })()`);
            if (!point) throw new Error('缺少刚入账的渠道柱组');
            await cdp.send('Input.dispatchMouseEvent', {
                type: 'mouseMoved',
                ...point,
                button: 'none',
                buttons: 0,
            });
            t.check(
                '悬停立即显示收支金额',
                await cdp.waitFor(
                    "document.querySelectorAll('.channel-card .chart-tooltip .tooltip-row').length >= 2",
                    { timeout: 2000 },
                ),
            );
            const before = await cdp.evaluate(
                "document.querySelector('.channel-card .chart-tooltip').getBoundingClientRect().left",
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
                const tip = document.querySelector('.channel-card .chart-tooltip');
                const host = document.querySelector('.channel-card .bar-chart');
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
                const labels = [...document.querySelectorAll('.channel-card .bar-axis > span')].map((el) => el.textContent.trim());
                return labels.length >= 2 && labels.every((label) => /^[−-]?[\\d,]+ (元|万|分|时)$/.test(label));
            })()`),
            );
            await cdp.evaluate("document.querySelector('.channel-card .column-group').focus()");
            t.check(
                '柱组可用键盘查看',
                await cdp.evaluate("!!document.activeElement?.getAttribute('aria-describedby')"),
            );
            await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape' });
            await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape' });
            t.check(
                'Esc 收起柱图明细',
                await cdp.waitFor("!document.querySelector('.chart-tooltip')", { timeout: 2000 }),
            );
            await cdp.evaluate('document.activeElement?.blur()');
        });

        await t.step('人民币卡上的支出跟着变了', async () => {
            const out = await cdp.evaluate(`(() => {
                const book = [...document.querySelectorAll('.books .book')]
                    .find((one) => (one.textContent || '').includes('人民币'));
                if (!book) return null;
                return [...book.querySelectorAll('.metrics b')].map((b) => b.textContent.trim());
            })()`);
            // 相对现有账目检查增量，不假定测试前是空账。
            t.check(
                '人民币支出增加 12.5',
                Boolean(out) &&
                    Math.round((rmbNumber(out[1]) - rmbNumber(baseline[1])) * 100) === 1250,
                `实际 ${out && out[1]}`,
            );
            t.check(
                '人民币差额减少 12.5',
                Boolean(out) &&
                    Math.round((rmbNumber(out[2]) - rmbNumber(baseline[2])) * 100) === -1250,
                `实际 ${out && out[2]}`,
            );
        });

        await t.step('在全部记录里把它删掉', async () => {
            await ui.reload();
            await ui.gotoReady('账号');
            t.check(
                '记录重载后仍在',
                await cdp.evaluate(
                    "[...document.querySelectorAll('.recent-row')].some((one) => one.getAttribute('aria-label')?.includes('⚠E2E账号'))",
                ),
            );
            await ui.clickLabel('查看账号历史记录');
            const opened = await ui.waitFor(`!!document.querySelector('[role="dialog"]')`, {
                timeout: 3000,
            });
            t.check('全部记录弹窗开了', opened);
            t.check(
                '账号历史共用筛选、汇总和页脚读数',
                await cdp.evaluate(
                    "!!document.querySelector('[role=dialog] .record-filters') && !!document.querySelector('[role=dialog] .record-summary') && !!document.querySelector('[role=dialog] .record-foot-note')",
                ),
            );

            t.check(
                '历史支持日期和来源筛选',
                await cdp.evaluate(
                    '!!document.querySelector(\'[aria-label^="账号历史开始日期"]\') && !!document.querySelector(\'[aria-label^="账号历史结束日期"]\') && !!document.querySelector(\'[aria-label="来源筛选"]\')',
                ),
            );
            await ui.fill('搜索记录', MARK);
            await sleep(250);
            const hits = await cdp.evaluate(
                `[...document.querySelectorAll('.rec-table tbody tr')]
                    .filter((row) => (row.textContent || '').includes('⚠E2E账号')).length`,
            );
            t.check('搜到刚记的那一条', hits >= 1, `搜到 ${hits} 条`);

            /* **删到一条不剩**，不是「删一条」。
             * 上一次跑挂掉时留下的记录会一直累积，而「删一条之后还剩几条」取决于上一次跑得多干净——
             * 那会让这条断言在「第一次跑」和「第 N 次跑」上给出不同答案。 */
            let left = hits;
            let askedOnce = false;
            for (let round = 0; round < 6 && left > 0; round += 1) {
                await ui.clickIn('.rec-table tbody tr', MARK, { label: '删这一条' });
                await sleep(300);
                /* 删除要二次确认——这一步在账号页是必要的：一条记录挂了很久才发现记错，
                 * 而删掉之后没有任何地方能找回来。 */
                if (
                    !askedOnce &&
                    (await cdp.evaluate(`!!document.querySelector('[role="dialog"]')`))
                ) {
                    askedOnce = true;
                    t.check('删除前问了那句', true);
                }
                await ui.clickText('button', '删除', { exact: true });
                await sleep(400);
                left = await cdp.evaluate(
                    `[...document.querySelectorAll('.rec-table tbody tr')]
                        .filter((row) => (row.textContent || '').includes('⚠E2E账号')).length`,
                );
            }
            t.check('删干净了', left === 0, `还剩 ${left} 条`);

            await cdp.key('Escape');
            await sleep(300);
        });

        await t.step('回到账号页：记录已经不在', async () => {
            await ui.reload();
            await ui.gotoReady('账号');
            const still = await cdp.evaluate(`(() => {
                return [...document.querySelectorAll('.recent-row')].some((one) => one.getAttribute('aria-label')?.includes('⚠E2E账号'));
            })()`);
            t.check('页面上不再有那一笔', still === false, '还能看到 E2E 那条');
        });
    }
}
