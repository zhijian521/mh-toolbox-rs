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

        /* ---------- 闹钟：建一个、重载后还在、再删掉 ----------
         *
         * 判据用「重载后还在」而不是「保存后出现」：这一批的数据不在 SQLite 里，
         * 而是 `localStorage`，最容易出错的正是「存了但读不回来」。
         *
         * 测试建的那一条备注带 `E2E`，删的时候按**那张卡的下标**定位，
         * 不用 `clickText`——页面上可能摆着用户自己的闹钟，点第一个匹配会删错人。
         */
        await t.step('闹钟：建一个、重载后还在、再删掉', async () => {
            await ui.goto('工具');
            await ui.clickText('button, a', '闹钟');
            const entered = await cdp.waitFor(`location.hash.includes('alarm')`, { timeout: 5000 });
            if (!entered) throw new Error(`点了闹钟，地址还是 ${await ui.hash()}`);
            t.pass('进入闹钟页', await ui.hash());

            await ui.clickLabel('新增一个闹钟');
            const opened = await cdp.waitFor(`!!document.querySelector('#alarm-form')`, {
                timeout: 4000,
            });
            if (!opened) throw new Error('点了新增，弹窗没出来');
            t.pass('新增弹窗打开了');

            /* 填两格：时刻与备注。`input` 事件要冒泡，Vue 的 `v-model` 才收得到。 */
            await cdp.evaluate(`(() => {
                const set = (selector, value) => {
                    const el = document.querySelector(selector);
                    const setter = Object.getOwnPropertyDescriptor(
                        HTMLInputElement.prototype,
                        'value',
                    ).set;
                    setter.call(el, value);
                    el.dispatchEvent(new Event('input', { bubbles: true }));
                };
                set('#alarm-form .time-input', '06:15');
                set('#alarm-form input[aria-label="备注"]', 'E2E 闹钟');
                return true;
            })()`);

            await ui.clickText('[role="dialog"] button', '保存');
            const created = await cdp.waitFor(
                `[...document.querySelectorAll('.alarm-card')].some((el) => el.innerText.includes('06:15'))`,
                { timeout: 4000 },
            );
            t.check('卡上出现 06:15', created, created ? '' : '弹窗关了吗？卡片没出现');

            await ui.reload();
            const survived = await cdp.waitFor(
                `[...document.querySelectorAll('.alarm-card')].some((el) => el.innerText.includes('06:15'))`,
                { timeout: 6000 },
            );
            t.check('重载后闹钟还在', survived, 'localStorage 没存住，或读档把坏记录丢了');

            /* 精确删那一张：先按下标找到它，再点它自己的「删」。 */
            const removed = await cdp.evaluate(`(() => {
                const cards = [...document.querySelectorAll('.alarm-card')];
                const index = cards.findIndex((el) => el.innerText.includes('06:15'));
                if (index < 0) return false;
                const button = [...cards[index].querySelectorAll('.alarm-act')].find(
                    (el) => el.textContent.trim() === '删',
                );
                if (!button) return false;
                button.click();
                return true;
            })()`);
            if (!removed) throw new Error('没找到 06:15 那张卡上的「删」');

            /* 确认窗的主按钮；**必须带 `[role="dialog"]` 作用域**——页面上还有别的「删除」字样
             * （卡片底行那枚「删」也是按钮），第一个匹配不一定是确认窗里的。 */
            await ui.clickText('[role="dialog"] button', '删除');
            const gone = await cdp.waitFor(
                `![...document.querySelectorAll('.alarm-card')].some((el) => el.innerText.includes('06:15'))`,
                { timeout: 4000 },
            );
            t.check('删掉之后卡片消失', gone);
        });
    }
}
