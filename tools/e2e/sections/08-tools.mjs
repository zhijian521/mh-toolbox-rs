/* ============================ 8. 工具 ============================ */

export default async function run(ctx) {
    const { cdp, ui, t, want } = ctx;

    if (want('工具')) {
        t.section('8 工具 · 捉鬼助手进出、开发页懒加载');

        await t.step('进工具页并打开捉鬼助手', async () => {
            await ui.goto('工具');
            const entry = await ui.count('button, a');
            t.check('工具页有可点入口', entry > 0, `${entry} 个`);
            await ui.clickText('button, a', '捉鬼');
            if (!(await cdp.waitFor(`location.hash.includes('ghost')`, { timeout: 5000 }))) {
                throw new Error(`点了捉鬼助手，地址还是 ${await ui.hash()}`);
            }
            t.pass('进入捉鬼助手', await ui.hash());
            t.check('捉鬼页画出来了', (await cdp.evaluate('document.body.innerText.length')) > 50);
        });

        await t.step('从捉鬼页回到工具列表', async () => {
            await ui.clickLabel('返回工具列表');
            const back = await cdp.waitFor(`location.hash === '#/tools'`, { timeout: 5000 });
            t.check('回到工具列表', back, await ui.hash());
        });

        /* `/dev` 只能靠左栏牌记三连击进，这里直接改地址——要验的是**懒加载的 chunk 到不到**。 */
        await t.step('开发页（#/dev）懒加载能渲染', async () => {
            await cdp.evaluate(`location.hash = '#/dev'`);
            const ok = await cdp.waitFor(
                `document.querySelector('.page-title')?.textContent?.trim() === '开发帮助'`,
                { timeout: 6000 },
            );
            if (!ok) throw new Error(`开发页没渲染：${await ui.title()}`);
            const cards = await ui.count('.ledger-section');
            t.check('开发页的卡片都在', cards >= 7, `${cards} 张`);
        });
    }
}
