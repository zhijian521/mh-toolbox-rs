import { CONFIRM_DELETE } from './shared.mjs';

/* ============================ 3. 物价 ============================ */

export default async function run(ctx) {
    const { cdp, ui, t, want, sleep, baseline } = ctx;

    const historyReady = `!!document.querySelector('[aria-modal="true"] [aria-label="删除这件物品"]')`;

    if (want('物价')) {
        t.section('3 物价 · 新建 → 记价 → 重载 → 历史 → 删除');

        await t.step('清掉上次遗留的 E2E 物品', async () => {
            await ui.goto('物价');
            let purged = 0;
            for (let i = 0; i < 8; i += 1) {
                try {
                    await ui.clickIn('article.price-card', 'E2E', { text: '历史' });
                } catch {
                    break;
                }
                await cdp.waitFor(historyReady, { timeout: 3000 });
                await ui.clickLabel('删除这件物品');
                await sleep(350);
                await ui.clickText(CONFIRM_DELETE, '删除', { exact: true });
                await sleep(650);
                purged += 1;
            }
            t.info('清理结果', `清掉 ${purged} 个遗留物品`);
        });

        baseline.prices = await ui.count('article.price-card');
        t.info('物价现有物品', `${baseline.prices} 件`);

        await t.step('切页返回保留物价搜索，可一次清除', async () => {
            await ui.fill('搜索物品名、子类或备注', '__E2E_筛选记忆__');
            await ui.goto('角色');
            await ui.goto('物价');
            t.check(
                '返回保留搜索条件',
                await cdp.evaluate(
                    `document.querySelector('[aria-label="搜索物品名、子类或备注"]')?.value === '__E2E_筛选记忆__'`,
                ),
            );
            await ui.clickLabel('清除筛选');
            t.check(
                '清除后恢复完整物价表',
                (await ui.count('article.price-card')) === baseline.prices,
            );
            const top = await cdp.evaluate(`(() => {
                const page = document.querySelector('.page-content');
                page.scrollTop = Math.min(300, page.scrollHeight - page.clientHeight);
                return page.scrollTop;
            })()`);
            if (top > 0) {
                await sleep(150);
                await ui.goto('角色');
                await ui.goto('物价');
                t.check(
                    '返回恢复物价滚动位置',
                    await cdp.waitFor(
                        `Math.abs(document.querySelector('.page-content').scrollTop - ${top}) <= 1`,
                    ),
                );
                await ui.fill('搜索物品名、子类或备注', '__E2E_清除滚动__');
                await ui.clickLabel('清除筛选');
                t.check(
                    '改变筛选回到列表顶部',
                    await cdp.evaluate(`document.querySelector('.page-content').scrollTop === 0`),
                );
            } else {
                t.info('滚动记忆', '当前物价不足一屏，无需恢复滚动位置');
            }
        });

        await t.step('新建物品并定初始价 3.5 万', async () => {
            await ui.clickLabel('新建一件物品');
            const open = await cdp.waitFor(
                `!!document.querySelector('input[aria-label="物品名称"]')`,
                {
                    timeout: 3000,
                },
            );
            if (!open) throw new Error('物品对话框没打开');
            t.pass('点「新增」打开物品对话框');

            await cdp.click('input[aria-label="物品名称"]');
            await ui.clickLabel('放弃这次编辑');
            t.check(
                '空表单点击一次取消即可关闭',
                await ui.waitFor(`!document.querySelector('input[aria-label="物品名称"]')`),
            );
            await ui.clickLabel('新建一件物品');
            await cdp.waitFor(`!!document.querySelector('input[aria-label="物品名称"]')`, {
                timeout: 3000,
            });
            await ui.clickLabel('保存这件物品');
            const linkedError = await cdp.evaluate(`(() => {
                const input = document.querySelector('input[aria-label="物品名称"]');
                const id = input?.getAttribute('aria-describedby');
                return input?.getAttribute('aria-invalid') === 'true'
                    && !!id && !!document.getElementById(id)?.textContent.trim();
            })()`);
            t.check('物品名称错误与输入框关联', linkedError);

            await ui.fill('物品名称', 'E2E测试物品');
            await ui.clickLabel('物品分类');
            const equipmentGroup = '.cascade-option[data-group="装备灵饰"]';
            const center = await cdp.evaluate(`(() => {
                const group = document.querySelector(${JSON.stringify(equipmentGroup)});
                group.closest('.cascade-column').scrollTop = 0;
                const box = group.getBoundingClientRect();
                return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
            })()`);
            await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', ...center });
            t.check('悬停一级时二级展开在右侧，一级仍可见', await cdp.waitFor(`(() => {
                const group = document.querySelector(${JSON.stringify(equipmentGroup)});
                const child = document.querySelector('[aria-label="装备灵饰的二级分类"]');
                return !!child && child.getBoundingClientRect().left >= group.getBoundingClientRect().right;
            })()`));
            await cdp.evaluate(`document.querySelector(${JSON.stringify(equipmentGroup)}).focus()`);
            await cdp.key('ArrowRight');
            t.check('右键进入二级列表', await cdp.evaluate(`document.activeElement?.dataset.level === '2'`));
            await cdp.key('ArrowLeft');
            t.check('左键回到一级分类', await cdp.evaluate(`document.activeElement?.dataset.group === '装备灵饰'`));
            await ui.clickText('.cascade-option[data-level="2"]', '自定义子类', { exact: true });
            t.check(
                '选择自定义后焦点进入子类输入框',
                await cdp.evaluate(
                    `document.activeElement?.getAttribute('aria-label') === '自己写一个二级分类'`,
                ),
            );
            await ui.fill('自己写一个二级分类', 'E2E试验子类');
            await ui.fillSel('input[aria-label="初始价（可空），以万为单位"]', '3.5');
            await ui.clickText('button', '保存', { exact: true });
            await sleep(700);

            const body = await ui.text();
            t.check('新物品出现在列表', body.includes('E2E测试物品'));
            t.check('新物品带价格 3.5 万', /E2E测试物品[\s\S]{0,80}3\.5[\s\S]{0,10}万/.test(body));
        });

        await t.step('物价可直接按一级或二级筛选', async () => {
            const filter = 'button[aria-label="按分类筛选"]';
            await ui.clickLabel('按分类筛选');
            await ui.clickText('.cascade-option[data-level="1"]', '装备灵饰', { exact: true });
            t.check(
                '点击一级直接筛选并关闭下拉',
                await cdp.evaluate(`(() => {
                    const trigger = document.querySelector(${JSON.stringify(filter)});
                    return trigger?.textContent.trim() === '装备灵饰'
                        && trigger.getAttribute('aria-expanded') === 'false'
                        && !!trigger.parentElement.querySelector('[aria-label="清除筛选"]');
                })()`),
            );
            await ui.clickLabel('按分类筛选');
            await ui.clickLabel('展开装备灵饰的二级分类');
            await ui.clickText('.cascade-option[data-level="2"]', 'E2E试验子类', { exact: true });
            t.check(
                '按自定义子类筛选只显示新物品',
                (await ui.count('article.price-card')) === 1 && (await ui.text()).includes('E2E测试物品'),
            );
            t.check(
                '自定义二级分类沿用一级分类的玻璃色，卡片直接放在公共台面上',
                await cdp.evaluate(`(() => {
                    const card = document.querySelector('.page-content.surface .price-grid > [data-material="glass"]');
                    if (!card) return false;
                    const style = getComputedStyle(card);
                    const hue = style.getPropertyValue('--material-hue').trim();
                    return !!hue && hue === style.getPropertyValue('--tint-hue-装备灵饰').trim();
                })()`),
            );
            await ui.clickLabel('清除筛选');
            t.check(
                '分类框内的叉号清除筛选并返回完整列表',
                !(await ui.exists('.cascade-clear')) &&
                    (await ui.count('article.price-card')) === baseline.prices + 1,
            );
        });

        await t.step('点卡片价格记一笔价 7.25 万', async () => {
            await ui.markFirst(`() => {
                const card = [...document.querySelectorAll('article.price-card')]
                    .find((c) => (c.textContent || '').includes('E2E测试物品'));
                return card?.querySelector('.card-log') ?? null;
            }`);
            await cdp.click('[data-e2e="1"]');
            const asked = await cdp.waitFor(
                `!!document.querySelector('input[aria-label="这一笔多少钱，以万为单位"]')`,
                { timeout: 3000 },
            );
            if (!asked) throw new Error('记价窗没弹出');
            t.pass('点卡片主体弹出记价窗');

            const dateTop = await cdp.evaluate(
                `document.querySelector('[role="dialog"] .date-trigger').getBoundingClientRect().top`,
            );
            await cdp.click('[role="dialog"] .date-trigger');
            t.check(
                '空价格失焦显示错误时，日期按钮保持原位',
                await cdp.evaluate(`Math.abs(document.querySelector('[role="dialog"] .date-trigger')
                    .getBoundingClientRect().top - ${dateTop}) <= 1 &&
                    !!document.querySelector('.pf-hint:not([aria-hidden="true"])')`),
            );
            t.check(
                '记价日期可打开统一月历',
                await cdp.waitFor(`!!document.querySelector('.date-panel')`, { timeout: 3000 }),
            );
            await cdp.key('Escape');
            await cdp.waitFor(`!document.querySelector('.date-panel')`, { timeout: 3000 });
            t.check(
                'Esc 只关闭月历，保留记价草稿',
                await ui.exists('input[aria-label="这一笔多少钱，以万为单位"]'),
            );
            await cdp.click('[role="dialog"] .date-trigger');
            await cdp.waitFor(`!!document.querySelector('.date-panel')`, { timeout: 3000 });
            await ui.clickLabel('关闭日历');
            t.check(
                '月历关闭图标只收起月历并还焦点给日期字段',
                await cdp.evaluate(`!document.querySelector('.date-panel') &&
                    document.activeElement?.matches('.date-trigger') &&
                    !!document.querySelector('input[aria-label="这一笔多少钱，以万为单位"]')`),
            );
            const selectedDate = await cdp.evaluate(
                `document.querySelector('.date-trigger')?.textContent`,
            );
            await cdp.click('[role="dialog"] .date-trigger');
            await cdp.waitFor(`!!document.querySelector('.date-panel')`, { timeout: 3000 });
            await ui.clickLabel('下一个月');
            await cdp.evaluate(`document.querySelector('[aria-label="关闭日历"]')?.focus()`);
            await cdp.key('Enter');
            t.check(
                '键盘触发月历关闭图标不选中翻页后的日期',
                await cdp.evaluate(`!document.querySelector('.date-panel') &&
                    document.activeElement?.matches('.date-trigger') &&
                    document.querySelector('.date-trigger')?.textContent === ${JSON.stringify(selectedDate)}`),
            );

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

        await t.step('卡片上的历史入口支持键盘打开', async () => {
            await cdp.evaluate(`
                document.querySelector('[aria-label="查看E2E测试物品的价格历史"]')?.focus()
            `);
            await cdp.key('Enter');
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
            t.check(
                '价格明细使用账本表格，历史图表在表格下方',
                (await ui.exists('.price-history-table.income-table tbody td.log-price')) &&
                    (await ui.exists('.price-history-table + .hist-chart .chart-in-card')),
            );
            const tooltipOpen = await ui.exists('.chart-tooltip');
            await cdp.key('Escape');
            if (tooltipOpen) {
                t.check(
                    'Esc 先收起图表明细，保留历史窗',
                    !(await ui.exists('.chart-tooltip')) && (await ui.exists('.modal-panel')),
                );
                await cdp.key('Escape');
            }
            t.check('Esc 关掉历史窗', await ui.waitFor('!document.querySelector("[role=dialog]")'));
        });

        await t.step('删除物品并回到原来的数量', async () => {
            await ui.clickLabel('查看E2E测试物品的价格历史');
            await cdp.waitFor(historyReady, { timeout: 3000 });
            await ui.clickLabel('删除这件物品');
            await sleep(400);
            t.check(
                '无标题确认窗仍默认聚焦取消',
                await cdp.evaluate('document.activeElement?.hasAttribute("data-modal-cancel")'),
            );
            await cdp.click('.modal-panel[aria-modal="true"] [data-modal-close]');
            t.check(
                '确认窗关闭图标取消删除并保留物品',
                (await ui.waitFor(historyReady)) &&
                    (await ui.text()).includes('E2E测试物品'),
            );
            await ui.clickLabel('删除这件物品');
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
}
