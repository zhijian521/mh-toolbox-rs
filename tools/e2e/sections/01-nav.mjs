/* ============================ 1. 导航 ============================ */

export default async function run(ctx) {
    const { cdp, ui, t, want, sleep, charsInDb } = ctx;

    const NAV = [
        ['总览', '#/overview', 'page'],
        ['收益', '#/income', 'page'],
        ['物价', '#/prices', 'page'],
        ['角色', '#/characters', 'page'],
        ['账号', '#/accounts', 'page'],
        ['目标', '#/goals', 'page'],
        ['工具', '#/tools', 'page'],
        ['设置', '#/settings', 'page'],
    ];

    if (want('导航')) {
        t.section('1 导航与首页 · 左栏八项 + 总览三块');
        for (const [label, expected, kind] of NAV) {
            await t.step(`进入「${label}」`, async () => {
                await ui.gotoReady(label);
                const state = {
                    href: await ui.hash(),
                    title: await ui.title(),
                    body: await ui.text(),
                };
                if (state.href !== expected)
                    throw new Error(`地址是 ${state.href}，期望 ${expected}`);
                if (state.title !== label)
                    throw new Error(`标题是「${state.title}」，期望「${label}」`);
                if (!state.body.length) throw new Error('正文是空的');
                if (kind === 'placeholder' && !state.body.includes('还没开始')) {
                    throw new Error(`占位页没说「还没开始」：${state.body.slice(0, 40)}`);
                }
                t.pass(`进入「${label}」`, `${state.href} · ${state.body.length} 字`);
            });
        }

        /* 总览页的骨架（2026-11-05 新建）。
         *
         * 三条都数**块**而不是读文字：这一页的价值全在「三块同时在」，少一块就是掉了功能。
         * 角色卡的数量与库里对账——不多不少，才算真的把名册接上了。 */
        await t.step('总览页：三块内容都在', async () => {
            await ui.gotoReady('总览');
            const shape = await cdp.evaluate(`(() => ({
                stats: document.querySelectorAll('.stats .stat').length,
                subs: document.querySelectorAll('.stats .stat .sub').length,
                deltas: document.querySelectorAll('.stats .stat .delta').length,
                slots: document.querySelectorAll('.bars .slot').length,
                chars: document.querySelectorAll('.chars .char').length,
            }))()`);

            t.check('今天那一排是四格', shape.stats === 4, `实际 ${shape.stats}`);
            /* 每格都要有副文与「较昨日」——空账时它们落成「—」，但两层都得在，
             * 少一层就是改版漏了一半。 */
            t.check('四格都有副文', shape.subs === 4, `实际 ${shape.subs}`);
            t.check('四格都有较昨日', shape.deltas === 4, `实际 ${shape.deltas}`);
            /* 七格是「七天」的骨架：没记账的那天也占一格，否则横轴对不上日期。 */
            t.check('近七天有七格（空的也占位）', shape.slots === 7, `实际 ${shape.slots}`);
            t.check(
                '各号近况的卡片数 = 库里的角色数',
                shape.chars === charsInDb,
                `页面 ${shape.chars} / 库 ${charsInDb}`,
            );
        });

        /* 默认落地页：`#/` 会重定向到 `DEFAULT_PATH`。2026-11-05 从设置页改成了总览，
         * 这条断言盯的就是那个改动——回退回去会立刻红。 */
        await t.step('打开应用落在总览（不是设置页）', async () => {
            await cdp.evaluate(`location.hash = '#/'`);
            await sleep(500);
            const landed = await ui.hash();
            t.check('默认页是总览', landed === '#/overview', `实际 ${landed}`);
        });
    }
}
