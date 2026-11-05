import { CONFIRM_DELETE } from './shared.mjs';

/* ============================ 3. 物价 ============================ */

export default async function run(ctx) {
    const { cdp, ui, t, want, sleep, baseline } = ctx;

    if (want('物价')) {
        t.section('3 物价 · 新建 → 记价 → 重载 → 历史 → 删除');

        await t.step('清掉上次遗留的 E2E 物品', async () => {
            await ui.goto('物价');
            let purged = 0;
            for (let i = 0; i < 8; i += 1) {
                try {
                    await ui.clickIn('article.price-card', 'E2E', { text: '删' });
                } catch {
                    break;
                }
                await sleep(350);
                await ui.clickText(CONFIRM_DELETE, '删除', { exact: true });
                await sleep(650);
                purged += 1;
            }
            t.info('清理结果', `清掉 ${purged} 个遗留物品`);
        });

        baseline.prices = await ui.count('article.price-card');
        t.info('物价现有物品', `${baseline.prices} 件`);

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

            await ui.fill('物品名称', 'E2E测试物品');
            await ui.fillSel('input[aria-label="初始价（可空），以万为单位"]', '3.5');
            await ui.clickText('button', '保存', { exact: true });
            await sleep(700);

            const body = await ui.text();
            t.check('新物品出现在列表', body.includes('E2E测试物品'));
            t.check('新物品带价格 3.5 万', /E2E测试物品[\s\S]{0,80}3\.5[\s\S]{0,10}万/.test(body));
        });

        await t.step('点卡片主体记一笔价 7.25 万', async () => {
            await ui.markFirst(`() => {
                const card = [...document.querySelectorAll('article.price-card')]
                    .find((c) => (c.textContent || '').includes('E2E测试物品'));
                return card?.querySelector('.card-main') ?? null;
            }`);
            await cdp.click('[data-e2e="1"]');
            const asked = await cdp.waitFor(
                `!!document.querySelector('input[aria-label="这一笔多少钱，以万为单位"]')`,
                { timeout: 3000 },
            );
            if (!asked) throw new Error('记价窗没弹出');
            t.pass('点卡片主体弹出记价窗');

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

        await t.step('卡片上的历史入口能开窗', async () => {
            await ui.markFirst(`() => {
                const card = [...document.querySelectorAll('article.price-card')]
                    .find((c) => (c.textContent || '').includes('E2E测试物品'));
                return card?.querySelector('[data-role="history"]') ?? null;
            }`);
            await cdp.click('[data-e2e="1"]');
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
            await cdp.key('Escape');
            await sleep(350);
            t.check('Esc 关掉历史窗', !(await ui.exists('[role="dialog"]')));
        });

        await t.step('删除物品并回到原来的数量', async () => {
            await ui.clickIn('article.price-card', 'E2E测试物品', { text: '删' });
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
