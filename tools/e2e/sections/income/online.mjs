import { importLoaded } from '../../cdp.mjs';

export default async function runOnline(ctx) {
    const { cdp, ui, t, sleep } = ctx;

    // 补记本轮标记的上线记录，验完删除，保留原账本。
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

    await t.step('上线角色多选胶囊：全部勾选、清空与逐个调整', async () => {
        await ui.goto('收益');
        await ui.clickLabel('开始计时（可以随时再加号）');
        await ui.waitFor(
            `!!document.querySelector('[role="dialog"] [aria-label="选择在线的角色"]')`,
        );
        const group = '[role="dialog"] [aria-label="选择在线的角色"]';
        try {
            const initial = await cdp.evaluate(`(() => {
                    const buttons = [...document.querySelectorAll(${JSON.stringify(group)} + ' button')];
                    return {
                        allFirst: buttons[0]?.textContent.trim() === '全部',
                        allDisabled: buttons[0]?.disabled,
                        available: buttons.slice(1).filter(button => !button.disabled).length,
                        rounded: buttons.every(button => !button.classList.contains('radius-sm')),
                    };
                })()`);
            t.check('全部位于首项，角色使用多选圆角胶囊', initial.allFirst && initial.rounded);
            t.check('没有可上线角色时禁用全部', initial.allDisabled === (initial.available === 0));
            if (!initial.available) return;
            const state = () =>
                cdp.evaluate(`(() => {
                    const buttons = [...document.querySelectorAll(${JSON.stringify(group)} + ' button')];
                    const roles = buttons.slice(1);
                    return {
                        allOn: buttons[0].getAttribute('aria-pressed') === 'true',
                        selected: roles.filter(button => button.getAttribute('aria-pressed') === 'true').length,
                        disabledSelected: roles.some(button => button.disabled && button.getAttribute('aria-pressed') === 'true'),
                    };
                })()`);
            await ui.clickText(group + ' button', '全部', { exact: true });
            const selected = await state();
            t.check(
                '全部只勾选可上线角色，跳过在线中的角色',
                selected.allOn &&
                    selected.selected === initial.available &&
                    !selected.disabledSelected,
            );
            await cdp.click(group + ' button:not(:disabled):nth-child(n + 2)');
            const partial = await state();
            t.check(
                '取消一位角色后全部同步取消高亮',
                !partial.allOn && partial.selected === initial.available - 1,
            );
            await ui.clickText(group + ' button', '全部', { exact: true });
            t.check('部分选择时可再次补齐全部', (await state()).selected === initial.available);
            await ui.clickText(group + ' button', '全部', { exact: true });
            const cleared = await state();
            t.check('再次点击全部清空勾选', !cleared.allOn && cleared.selected === 0);
            t.check(
                '清空后不能开始计时',
                await cdp.evaluate(
                    `document.querySelector('[role="dialog"] button[aria-label="开始"]')?.disabled === true`,
                ),
            );
        } finally {
            await ui.clickLabel('取消');
            await ui.waitFor(`!document.querySelector('[role="dialog"]')`);
        }
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

        const formFit = await cdp.evaluate(`(() => {
                const panel = document.querySelector('[role="dialog"]');
                const boundary = panel.getBoundingClientRect();
                return [...panel.querySelectorAll('.income-form, .online-field, .pill-group, .bevel-pill, .date-field, .times, .time-input, input[maxlength="40"]')]
                    .filter((one) => one.getClientRects().length)
                    .map((one) => {
                        const rect = one.getBoundingClientRect();
                        return { selector: one.className, left: rect.left, right: rect.right,
                            fits: rect.left >= boundary.left && rect.right <= boundary.right &&
                                one.scrollWidth <= one.clientWidth + 1 };
                    });
            })()`);
        t.check(
            '补记角色选项、日期、时刻与备注均在弹窗内，无横向溢出',
            formFit.length > 0 && formFit.every((one) => one.fits),
            JSON.stringify(formFit),
        );

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
        t.check('状态条的「今日在线」读出了时长', /\d/.test(bar.minutes), `实际「${bar.minutes}」`);
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
        const opened = await cdp.waitFor(`!!document.querySelector('[role="dialog"] .rec-table')`, {
            timeout: 3000,
        });
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
            `document.querySelectorAll('[role="dialog"] .times .time-input').length === 2`,
            { timeout: 3000 },
        );
        t.check('已结束记录的起止时刻都可修改', editOpened);
        if (!editOpened) throw new Error('修改窗没有可编辑的结束时刻');
        t.check(
            '修改窗同时显示开始日期与结束日期',
            await cdp.evaluate(
                `document.querySelectorAll('[role="dialog"] .date-trigger').length === 2`,
            ),
        );
        const changedEnd = await cdp.evaluate(`(async () => {
                const { useOnline } = await ${importLoaded('/src/views/income/online-store.ts')};
                const one = useOnline().sessions.value.find((one) => one.note === 'E2E上线一段');
                const end = new Date(one.startAt + 30 * 60000);
                const original = new Date(one.endAt);
                return {
                    time: String(end.getHours()).padStart(2, '0') + ':' +
                        String(end.getMinutes()).padStart(2, '0'),
                    dayLabel: end.getFullYear() + '年' + (end.getMonth() + 1) + '月' + end.getDate() + '日',
                    previousMonth: end.getFullYear() !== original.getFullYear() ||
                        end.getMonth() !== original.getMonth(),
                };
            })()`);
        const endInput = '[role="dialog"] .times .time-field:nth-child(2) .time-input';
        await ui.fillSel(endInput, '99:99');
        await ui.clickLabel('保存');
        t.check(
            '错误结束时刻阻止保存并保留编辑窗',
            await cdp.waitFor(`!!document.querySelector('[role="dialog"] .note.error')`),
        );
        await ui.fillSel(endInput, changedEnd.time);
        await ui.clickLabelPrefix('结束日期：');
        if (changedEnd.previousMonth) await ui.clickLabel('上一个月');
        await ui.clickLabel(changedEnd.dayLabel);
        await ui.clickLabel('保存');
        t.check(
            '修改终点后记录时长更新为半小时',
            await cdp.waitFor(
                `!document.querySelector('[role="dialog"] .times') &&
                        document.querySelector('[role="dialog"] .rec-table tbody tr .c-dur')?.textContent.trim() === '00:30'`,
                { timeout: 3000 },
            ),
        );
        await ui.clickIn('[role="dialog"] .rec-table tbody tr', NOTE, { label: '改这一段' });
        await ui.waitFor(
            `document.querySelectorAll('[role="dialog"] .times .time-input').length === 2`,
        );
        t.check(
            '重新打开保留修改后的结束日期与时刻',
            await cdp.evaluate(`(() => {
                    const end = document.querySelector('[role="dialog"] .times .time-field:nth-child(2) .time-input');
                    const day = document.querySelector('[role="dialog"] [aria-label^="结束日期："]');
                    return end?.value === ${JSON.stringify(changedEnd.time)} &&
                        day?.getAttribute('aria-label').includes(${JSON.stringify(changedEnd.dayLabel)});
                })()`),
        );
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
}
