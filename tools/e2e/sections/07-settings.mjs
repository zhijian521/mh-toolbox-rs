/* ============================ 7. 设置 ============================ */

export default async function run(ctx) {
    const { cdp, ui, t, want, sleep } = ctx;

    if (want('设置')) {
        t.section('7 设置 · 主题、字号、导入与清除的确认窗');

        await t.step('主题切浅色再切回深色', async () => {
            await ui.goto('设置');
            const original = await cdp.evaluate(
                `document.documentElement.classList.contains('dark') ? 'dark' : 'light'`,
            );
            await ui.clickText('button.bevel-pill', '浅色');
            await sleep(400);
            t.check(
                '切到浅色',
                (await cdp.evaluate(
                    `document.documentElement.classList.contains('dark') ? 'dark' : 'light'`,
                )) === 'light',
            );
            await ui.clickText('button.bevel-pill', '深色');
            await sleep(400);
            t.check(
                '切回深色',
                (await cdp.evaluate(
                    `document.documentElement.classList.contains('dark') ? 'dark' : 'light'`,
                )) === 'dark',
            );
            t.info('测试前主题', original);
        });

        /*
         * 字号：三档的因子是 0.92 / 1 / 1.1（`use-font-scale.ts`）。
         * 先读当前值——用户自己可能就停在「较大」，直接断言「点较大后变了」会假红。
         */
        await t.step('字号三档都能切，并还原成测试前那一档', async () => {
            const readScale = () =>
                cdp.evaluate(
                    `getComputedStyle(document.documentElement).getPropertyValue('--fs-scale').trim()`,
                );
            const original = await readScale();
            const pick = async (label, expect) => {
                await ui.clickText('button.step-opt', label);
                await sleep(400);
                const now = await readScale();
                t.check(`点「${label}」→ 缩放 ${expect}`, now === expect, `实际：${now}`);
            };

            await pick('默认', '1');
            await pick('较大', '1.1');
            await pick('较小', '0.92');

            const back = { 0.92: '较小', 1: '默认', 1.1: '较大' }[original] ?? '默认';
            await ui.clickText('button.step-opt', back);
            await sleep(400);
            t.check('字号还原', (await readScale()) === original, `还原到「${back}」`);
        });

        await t.step('数据卡三枚按钮都在', async () => {
            const labels = await cdp.evaluate(
                `[...document.querySelectorAll('[aria-label]')].map((e) => e.getAttribute('aria-label'))`,
            );
            for (const need of ['导出账本到文件', '从备份文件导入账本', '清空所有角色与物价']) {
                t.check(`按钮「${need}」在`, labels.includes(need));
            }
        });

        /* 清除：只验证「先问一句」这一层，取消掉不动真数据。 */
        await t.step('清除先弹确认窗，Esc 能取消', async () => {
            await ui.clickLabel('清空所有角色与物价');
            const asked = await cdp.waitFor(`!!document.querySelector('[role="dialog"]')`, {
                timeout: 3000,
            });
            if (!asked) throw new Error('清除没有二次确认');
            t.pass('清除前有确认窗');
            await cdp.key('Escape');
            await sleep(350);
            t.check('Esc 取消后没有残留窗', !(await ui.exists('[role="dialog"]')));
            t.check('取消后页面还在', (await ui.text()).length > 50);
        });

        /*
         * 导入放最后一节：它问完会开**系统文件对话框**。确认窗若坏了，系统窗会把
         * WebView 挡住、后面每一步都连坐——所以这一步不放在中间。
         */
        await t.step('导入先弹确认窗（确认后才轮到系统选文件）', async () => {
            await ui.clickLabel('从备份文件导入账本');
            const asked = await cdp.waitFor(`!!document.querySelector('[role="dialog"]')`, {
                timeout: 3000,
            });
            if (!asked) throw new Error('导入没有二次确认（会直接弹出系统文件窗）');
            t.pass('导入前有确认窗');
            await cdp.key('Escape');
            await sleep(350);
            t.check('Esc 取消后没有残留窗', !(await ui.exists('[role="dialog"]')));
        });
    }
}
