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

        /* ---------- 维护公告：外链，点了不进路由 ----------
         *
         * 这一枚现在的落点是系统浏览器（`open_external`）。真点一下会在这台机器上
         * 拉起一个浏览器窗口，之后还得人去关——测试不该留这种东西。所以先把
         * `__TAURI_INTERNALS__.invoke` 里的 `open_external` 截成 no-op 再点。
         *
         * 要验的是「地址没变」：从前它是一条路由（`#/tools/notice`），现在不该再进任何
         * 页面。`data-kind` 是那一层结构的读出口——`tools.ts` 里 `kind: 'link'` 的条目
         * 不进 `router.ts`（那里按 `kind === 'page'` 过滤），两处一起看才闭环。
         *
         * **不验「浏览器真的起来了」**：那要等外部进程，还得收尾关掉，且与这一层
         * 没有关系——`openExternal` 自己的实现只有一行 `rundll32`。
         */
        await t.step('维护公告：外链，点了不进路由', async () => {
            await ui.goto('工具');

            const kind = await cdp.evaluate(
                `[...document.querySelectorAll('.tool-item')]
                    .find((one) => one.textContent?.includes('维护公告'))?.dataset.kind ?? ''`,
            );
            t.check('维护公告标成外链', kind === 'link', kind || '没找到这一枚');

            const stubbed = await cdp.evaluate(`(() => {
                const internals = window.__TAURI_INTERNALS__;
                if (!internals || typeof internals.invoke !== 'function') return false;
                window.__e2eInvoke = internals.invoke;
                internals.invoke = (cmd, ...rest) =>
                    cmd === 'open_external'
                        ? Promise.resolve(null)
                        : window.__e2eInvoke.call(internals, cmd, ...rest);
                return true;
            })()`);
            /* 拦不住就**不点**：宁可少一条断言，也不在用户机器上真开一个浏览器。 */
            if (!stubbed) throw new Error('拦不住 open_external，放弃点击（会真开浏览器）');

            const before = await ui.hash();
            await ui.clickText('button', '维护公告');
            /* 等一拍：要是它真跳了路由，这一段时间够 hash 变完。 */
            await cdp.evaluate('new Promise((done) => setTimeout(done, 400))');
            const after = await ui.hash();
            t.check('点了还留在工具页', after === before, `${before} → ${after}`);

            await cdp.evaluate(`(() => {
                window.__TAURI_INTERNALS__.invoke = window.__e2eInvoke;
                delete window.__e2eInvoke;
            })()`);
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

        /* ---------- 活动日历：点一张卡能把提醒加进闹钟 ----------
         *
         * 验的是**全链路**：卡片 → 弹窗 → 换算 → 闹钟落盘 → 重载后卡上还盖着「已提醒」。
         * 挑「科举大赛」是因为它走的是最特别的一支换算（每月轮换只能退成「仅一次」），
         * 那一支错的话，别的分支看着都好。
         */
        await t.step('活动日历：点一张卡能加提醒', async () => {
            /* 这一节会往 `mh-alarms` 里写一条。先记原值，跑完写回——烟测跑在真实数据
             * 目录上，留一条测试闹钟在用户的闹钟列表里是实打实的副作用。 */
            const before = await cdp.evaluate(`localStorage.getItem('mh-alarms')`);

            await cdp.evaluate(`location.hash = '#/tools'`);
            await cdp.waitFor(
                `document.querySelector('.page-title')?.textContent?.trim() === '工具'`,
                { timeout: 4000 },
            );
            await ui.clickText('button, a', '活动日历');
            const entered = await cdp.waitFor(`location.hash.includes('activities')`, {
                timeout: 5000,
            });
            if (!entered) throw new Error(`点了活动日历，地址还是 ${await ui.hash()}`);

            const loaded = await cdp.waitFor(`document.querySelectorAll('.card').length >= 10`, {
                timeout: 8000,
            });
            if (!loaded) throw new Error('活动卡片没出来');

            const groups = await ui.count('.group');
            t.check('活动按时间分了组', groups >= 4, `${groups} 组`);

            const added = await cdp.evaluate(`(async () => {
                const card = [...document.querySelectorAll('.card')].find(
                    (one) => one.querySelector('.name')?.textContent?.trim() === '科举大赛',
                );
                if (!card) return '没有科举大赛这张卡';
                card.click();
                await new Promise((resolve) => setTimeout(resolve, 350));
                const button = [...document.querySelectorAll('.modal-foot .press-btn')].find(
                    (one) => one.textContent.includes('加提醒'),
                );
                if (!button) return '弹窗里没有加提醒按钮';
                button.click();
                await new Promise((resolve) => setTimeout(resolve, 450));
                const after = [...document.querySelectorAll('.card')].find(
                    (one) => one.querySelector('.name')?.textContent?.trim() === '科举大赛',
                );
                return after?.querySelector('.tag')?.textContent?.trim() ?? '';
            })()`);
            t.check('加完提醒，卡上盖了「已提醒」', added === '已提醒', String(added));

            /* 落盘：闹钟存在 localStorage，重载后还在才算真加上了。
             * 只查内存的话，「点完变了个色」也能过，而什么都没存下来。 */
            await ui.reload({ wait: 1300 });
            const kept = await cdp.waitFor(
                `[...document.querySelectorAll('.card')].some(
                    (one) => one.querySelector('.name')?.textContent?.trim() === '科举大赛'
                        && one.querySelector('.tag')?.textContent?.trim() === '已提醒',
                )`,
                { timeout: 6000 },
            );
            t.check('重载后仍在', kept, kept ? '已提醒' : '没了');

            /* 写回原值，不给用户留一条测试闹钟。 */
            const restore = `(() => {
                const v = ${before === null ? 'null' : JSON.stringify(before)};
                if (v) localStorage.setItem('mh-alarms', v);
                else localStorage.removeItem('mh-alarms');
                return 'ok';
            })()`;
            await cdp.evaluate(restore);
            await ui.reload({ wait: 1000 });
        });
    }
}
