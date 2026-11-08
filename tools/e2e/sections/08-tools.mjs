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

        /* ---------- 游戏资源：一进来落在武器、搜索能收窄、能换类 ----------
         *
         * 判据用卡片标题而不是图数：图片是 `loading="lazy"`，屏外的那些还没请求，
         * 按图数断言会在不同窗口高度下飘。
         */
        await t.step('游戏资源：清单出来了、搜得到', async () => {
            /* 上一段停在闹钟页，而左栏「工具」那一格在 `/tools/alarm` 下本来就是高亮的——
             * 点它等于点「当前这一项」，路由不动。所以这里直接改地址回列表。 */
            await cdp.evaluate(`location.hash = '#/tools'`);
            if (
                !(await cdp.waitFor(
                    `document.querySelector('.page-title')?.textContent?.trim() === '工具'`,
                    { timeout: 4000 },
                ))
            ) {
                throw new Error(`没回到工具列表：${await ui.hash()}`);
            }

            await ui.clickText('button, a', '游戏资源');
            const entered = await cdp.waitFor(`location.hash.includes('assets')`, {
                timeout: 5000,
            });
            if (!entered) throw new Error(`点了游戏资源，地址还是 ${await ui.hash()}`);
            t.pass('进入游戏资源', await ui.hash());

            const loaded = await cdp.waitFor(
                `document.querySelector('.asset-title')?.textContent?.trim() === '武器'`,
                { timeout: 8000 },
            );
            if (!loaded) throw new Error('资源页没有默认落在「武器」这一类');
            const cards = await ui.count('.asset-section');
            const total = await cdp.evaluate(
                `document.querySelector('.asset-count')?.textContent?.trim() ?? ''`,
            );
            /* 只摆一类是有意的（十类一千多项一次性建 DOM 会卡），所以这里断言**恰好一张**：
             * 多出来就说明「全部分类」又回来了。 */
            t.check('默认只摆武器一类', cards === 1, `${cards} 张，${total}`);
            t.check('计数是这一类的总数', /^共 \d+ 项$/.test(total), total);

            /* 搜索：只在当前这一类里收窄。 */
            const count = await cdp.evaluate(`(async () => {
                const el = document.querySelector('.asset-search');
                const setter = Object.getOwnPropertyDescriptor(
                    HTMLInputElement.prototype,
                    'value',
                ).set;
                setter.call(el, '剑');
                el.dispatchEvent(new Event('input', { bubbles: true }));
                await new Promise((resolve) => setTimeout(resolve, 500));
                return document.querySelector('.asset-count')?.textContent?.trim() ?? '';
            })()`);
            t.check('搜「剑」能收窄', /^找到 \d+ 项$/.test(count), count);

            const left = await cdp.evaluate(
                `[...document.querySelectorAll('.asset-section')].map((el) => el.querySelector('.asset-title')?.textContent ?? '')`,
            );
            t.check(
                '收窄后仍在武器这一类里',
                Array.isArray(left) && left.length === 1 && left[0] === '武器',
                JSON.stringify(left),
            );

            /* 换一类：点触发条开列表，再点「门派技能」那一项。
             * 顺带把搜索词清掉——不清的话新一类会被一个不相关的词再筛一遍。 */
            const switched = await cdp.evaluate(`(async () => {
                const el = document.querySelector('.asset-search');
                const setter = Object.getOwnPropertyDescriptor(
                    HTMLInputElement.prototype,
                    'value',
                ).set;
                setter.call(el, '');
                el.dispatchEvent(new Event('input', { bubbles: true }));
                document.querySelector('.asset-kind .select-trigger').click();
                await new Promise((resolve) => setTimeout(resolve, 250));
                const opt = [...document.querySelectorAll('.asset-kind .select-opt')].find(
                    (one) => one.textContent.trim() === '门派技能',
                );
                opt?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
                await new Promise((resolve) => setTimeout(resolve, 450));
                return document.querySelector('.asset-title')?.textContent?.trim() ?? '';
            })()`);
            t.check('换分类后只剩那一类', switched === '门派技能', switched);
        });
    }
}
