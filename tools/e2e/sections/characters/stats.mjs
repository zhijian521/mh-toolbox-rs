export async function stats(ctx) {
    await ctx.t.step('角色统计二级页完整对照并可返回', async () => {
        await ctx.ui.goto('角色');
        const count = await ctx.ui.count('.roster .char');
        await ctx.ui.clickLabel('查看所有角色统计');
        await ctx.cdp.waitFor(`location.hash.startsWith('#/characters/stats')`);
        await ctx.cdp.waitFor(`!!document.querySelector('.stats-grid .compact')`);
        ctx.t.check(
            '统计使用全部真实角色且不显示编辑与删除入口',
            (await ctx.ui.count('.stats-grid .char')) === count &&
                !(await ctx.ui.exists('.stats-grid .head-actions')),
        );
        const sections = [
            ['属性', '.attr-layout .slip-row'],
            ['师门', '.school-row'],
            ['辅助', null],
            ['修炼', '.training-list .slip-row'],
            ['装备', '.gear-cell'],
            ['召唤兽', null],
        ];
        for (const [label, rows] of sections) {
            await ctx.ui.clickText('[aria-label="角色统计分区"] button', label, { exact: true });
            await ctx.cdp.waitFor(
                `!!document.querySelector('.stats-grid .pane[aria-label="${label}"]')`,
            );
            const state = await ctx.cdp.evaluate(`(() => {
                const cards = [...document.querySelectorAll('.stats-grid .char')];
                return cards.map(card => ({
                    panels: card.querySelectorAll('.pane').length,
                    role: card.querySelector('.pane')?.getAttribute('role'),
                    width: card.getBoundingClientRect().width,
                    overflow: card.querySelector('.char-body').scrollWidth - card.querySelector('.char-body').clientWidth,
                    rows: ${rows ? `card.querySelectorAll(${JSON.stringify(rows)}).length` : 'null'},
                }));
            })()`);
            ctx.t.check(
                `统计切换${label}且只挂载当前分区`,
                state.length === count &&
                    state.every((card) => card.panels === 1 && card.role === 'region'),
            );
            ctx.t.check(
                `${label}保持固定卡宽且正文无横向溢出`,
                state.length === count &&
                    state.every((card) => Math.abs(card.width - 360) < 1 && card.overflow <= 1),
            );
            if (label === '属性' || label === '修炼' || label === '装备') {
                const expected = label === '属性' ? 20 : label === '修炼' ? 10 : 12;
                ctx.t.check(
                    `${label}保留完整记录`,
                    state.every((card) => card.rows === expected),
                );
            }
            if (label === '装备') {
                ctx.t.check(
                    '统计装备保留四列环绕布局，中央留空',
                    await ctx.cdp.evaluate(`(() => {
                        const boards = [...document.querySelectorAll('.stats-grid .gear-board')];
                        return boards.length > 0 && boards.every(board =>
                            !board.querySelector('.gear-stage') &&
                            getComputedStyle(board).gridTemplateColumns.split(' ').length === 4 &&
                            [...board.querySelectorAll('.gear-cell')].every(cell => {
                                const style = getComputedStyle(cell);
                                const col = Number(style.gridColumnStart);
                                const row = Number(style.gridRowStart);
                                return !([2, 3].includes(col) && [2, 3].includes(row));
                            }));
                    })()`),
                );
            }
            if (label === '修炼') {
                ctx.t.check(
                    '统计修炼标题和名称保持单行',
                    await ctx.cdp.evaluate(`[...document.querySelectorAll(
                        '.stats-grid .training-col .group-head, .stats-grid .training-list .slip-name'
                    )].every(el => getComputedStyle(el).whiteSpace === 'nowrap')`),
                );
                ctx.t.check(
                    '统计修炼显示完整名称',
                    await ctx.cdp.evaluate(`(() => {
                        const rows = [...document.querySelectorAll(
                            '.stats-grid .training-list .slip-row'
                        )];
                        return rows.length > 0 && rows.every(row =>
                            row.querySelector('.slip-name').textContent.trim() === row.title);
                    })()`),
                );
            }
            if (label === '召唤兽') {
                ctx.t.check(
                    '只读召唤兽正常显示，不受禁用按钮透明度影响',
                    await ctx.cdp.evaluate(`(() => {
                        const cards = [...document.querySelectorAll('.stats-grid .pet-list .plate')];
                        return cards.length > 0 && cards.every(card =>
                            card.tagName === 'DIV' && getComputedStyle(card).opacity === '1');
                    })()`),
                );
            }
        }
        await ctx.ui.reload();
        await ctx.cdp.waitFor(`!!document.querySelector('.stats-grid .pane[aria-label="召唤兽"]')`);
        ctx.t.check(
            '重载保留当前统计分区',
            await ctx.cdp.evaluate(
                `document.querySelector('[aria-label="角色统计分区"] [aria-checked="true"]')?.textContent.trim() === '召唤兽'`,
            ),
        );
        await ctx.ui.clickLabel('返回角色页面');
        await ctx.cdp.waitFor(`!!document.querySelector('.roster')`);
        ctx.t.check('返回后名册数量不变', (await ctx.ui.count('.roster .char')) === count);
        await ctx.ui.clickLabel('查看所有角色统计');
        await ctx.cdp.waitFor(`!!document.querySelector('.stats-grid')`);
        await ctx.ui.goto('角色');
        ctx.t.check('重复选择侧栏角色可从统计返回名册', (await ctx.ui.hash()) === '#/characters');
    });
}
