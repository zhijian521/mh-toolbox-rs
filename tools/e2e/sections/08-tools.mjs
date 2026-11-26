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

        await t.step('提醒助手：简洁首屏与切页继续监听', async () => {
            // IPC 替身只验证页面生命周期，不开始或停止用户正在使用的游戏监听。
            const stubbed = await cdp.evaluate(`(async () => {
                const internals = window.__TAURI_INTERNALS__;
                if (!internals || typeof internals.invoke !== 'function') return false;
                const invoke = internals.invoke;
                const actual = await invoke.call(internals, 'fengyao_status');
                const fake = {
                    ...actual, running: false, baselineReady: true, error: '',
                    config: null,
                    text: ['E2E 识别原文'],
                    alerts: Array.from({ length: 4 }, (_, i) => ({
                        id: 'e2e-' + i, kind: 'yiguan', scene: '大唐国境', coordinates: '321,123', at: Date.now() - i * 1000,
                        text: 'E2E 公告正文 ' + i,
                    })),
                };
                window.__e2eFengyao = {
                    invoke, fake, hideChatWindow: false,
                    preference: localStorage.getItem('mh-fengyao-preferences'),
                    previewCalls: 0, startCalls: 0, stopCalls: 0, statusCalls: 0, updateCalls: 0,
                };
                localStorage.setItem('mh-fengyao-preferences', JSON.stringify({
                    scenes: [], windowTitle: '', region: null,
                }));
                internals.invoke = (cmd, ...rest) => {
                    if (cmd === 'fengyao_status') {
                        window.__e2eFengyao.statusCalls += 1;
                        return Promise.resolve(fake);
                    }
                    if (cmd === 'ghost_windows') {
                        if (window.__e2eFengyao.hideChatWindow) return Promise.resolve([]);
                        return Promise.resolve([
                            { hwnd: 1, title: '梦幻西游 聊天窗口' },
                            { hwnd: 2, title: '梦幻西游 主窗口' },
                        ]);
                    }
                    if (cmd === 'fengyao_capture') {
                        return Promise.resolve({ image: '', title: '梦幻西游 聊天窗口',
                            width: 800, height: 600 });
                    }
                    if (cmd === 'fengyao_preview_speech') {
                        window.__e2eFengyao.previewCalls += 1;
                        return Promise.resolve(null);
                    }
                    if (cmd === 'fengyao_set_speech') {
                        if (fake.config) fake.config.speechEnabled = rest[0].enabled;
                        return Promise.resolve(null);
                    }
                    if (cmd === 'fengyao_update') {
                        window.__e2eFengyao.updateCalls += 1;
                        fake.config = { ...fake.config, reminders: rest[0].reminders };
                        fake.running = fake.config.reminders.length > 0;
                        return Promise.resolve(fake);
                    }
                    if (cmd === 'fengyao_start') {
                        window.__e2eFengyao.startCalls += 1;
                        fake.config = rest[0].config;
                        fake.running = true;
                        return Promise.resolve(fake);
                    }
                    if (cmd === 'fengyao_stop') {
                        window.__e2eFengyao.stopCalls += 1;
                        return Promise.reject(new Error('页面进出不应控制监听'));
                    }
                    return invoke.call(internals, cmd, ...rest);
                };
                return true;
            })()`);
            if (!stubbed) throw new Error('无法隔离封妖 IPC，停止页面烟测');
            try {
                await cdp.evaluate(`location.hash = '#/tools/fengyao'`);
                const loaded = await cdp.waitFor(
                    `document.querySelectorAll('.fy-type').length === 6 &&
                        !document.querySelector('[aria-label="开始公告监听"]').disabled`,
                    { timeout: 5000 },
                );
                t.check(
                    '六种提醒独立设置，保留旧设置的主动全关',
                    loaded &&
                        (await cdp.evaluate(`
                    document.querySelectorAll('.fy-settings .fy-types > .fy-type').length === 6 &&
                    document.querySelectorAll('.fy-maps-toggle[aria-expanded="false"]').length === 1 &&
                    [...document.querySelectorAll('.fy-type .cost-switch')].every(s =>
                        s.classList.contains('off')) &&
                    !document.querySelector('[aria-label="开始公告监听"]').disabled
                `)),
                );
                await ui.clickLabel('试听语音提醒');
                t.check(
                    '未监听时也能独立试听',
                    await cdp.evaluate(
                        'window.__e2eFengyao.previewCalls === 1 && window.__e2eFengyao.startCalls === 0',
                    ),
                );
                await cdp.click('[aria-label="语音播报"] [role="radio"]:last-child');
                await ui.clickLabel('开始公告监听');
                t.check(
                    '未开启类型时提示配置',
                    await cdp.evaluate(`
                    [...document.querySelectorAll('[role="alert"]')].some(el =>
                        el.textContent.includes('请先开启至少一种提醒'))
                `),
                );
                t.check(
                    '移除等级、测试通知和官方规则入口',
                    await cdp.evaluate(`
                    !document.querySelector('[aria-label="封妖角色等级"]') &&
                    !document.querySelector('[aria-label="发送一条封妖测试通知"]') &&
                    !document.querySelector('[aria-label="打开官网封妖等级规则"]')
                `),
                );
                await cdp.click('[aria-label="封妖提醒"] [role="radio"]:last-child');
                await cdp.click('.fy-maps-toggle');
                await ui.clickText('#fy-maps-fengyao button', '柳林坡');
                t.check(
                    '封妖可以单独开启并选择地图',
                    await cdp.evaluate(`
                    !document.querySelector('[aria-label="封妖提醒"]').classList.contains('off')
                `),
                );
                await cdp.evaluate('window.__e2eFengyao.hideChatWindow = true');
                await ui.clickLabel('开始公告监听');
                await ui.waitFor(
                    "document.querySelector('.notice-layer')?.textContent.includes('请选择独立聊天窗口')",
                );
                t.check(
                    '窗口为空时只提示，不启动后台监听',
                    await cdp.evaluate('window.__e2eFengyao.startCalls === 0'),
                );
                await cdp.evaluate('window.__e2eFengyao.hideChatWindow = false');
                await ui.clickLabel('开始公告监听');
                await ui.waitFor(
                    `document.querySelector('.fy-settings .fy-window-control + .fy-status')?.textContent.includes('监听中')`,
                );
                t.check(
                    '首次直接监听完整聊天窗口，窗口选择框下方显示监听状态',
                    await cdp.evaluate(`
                    (() => {
                        const { hwnd, region, speechEnabled } = window.__e2eFengyao.fake.config ?? {};
                        return speechEnabled === true && hwnd === 1 && region?.x === 0 && region.y === 0 &&
                            region.width === 800 && region.height === 600 &&
                            region.frameWidth === 800 && region.frameHeight === 600 &&
                            document.querySelector('.fy-settings .fy-window-control + .fy-status').textContent.includes(
                                '监听中 · 新公告符合条件时提醒') &&
                            document.querySelector('.fy-guide').textContent.includes('避免最小化或隐藏') &&
                            !document.querySelector('[aria-label*="框选"]');
                    })()
                `),
                );
                t.check(
                    '开始监听后保存地图和所选聊天窗口',
                    await cdp.evaluate(`
                    (() => {
                        const saved = JSON.parse(localStorage.getItem('mh-fengyao-preferences'));
                        return saved.windowTitle === '梦幻西游 聊天窗口' && !('region' in saved) &&
                            saved.reminders.find(x => x.kind === 'fengyao').scenes.includes('柳林坡');
                    })()
                `),
                );
                t.check(
                    '识别详情默认收起',
                    await cdp.evaluate(`!document.querySelector('.fy-reading').open`),
                );
                t.check(
                    '时间线纵向展示最近三条提醒，保留类型和坐标',
                    await cdp.evaluate(`
                        (() => {
                            const list = document.querySelector('.fy-reminders');
                            const tags = list.querySelectorAll('.fy-reminder');
                            const rows = [...tags].map(tag => tag.getBoundingClientRect());
                            return rows.every((row, i) => !i || row.top >= rows[i - 1].bottom) &&
                                tags.length === 3 && tags[0].textContent.includes('衣冠古丘') &&
                                tags[0].textContent.includes('321,123') &&
                                [...tags].every(tag => tag.getAttribute('aria-expanded') === 'false');
                        })()
                    `),
                );
                await cdp.click('.fy-reminders li:first-child .fy-reminder');
                t.check(
                    '点时间线条目在该条下方显示原文',
                    await cdp.evaluate(`
                        document.querySelector('.fy-reminder[aria-expanded="true"]') !== null &&
                        document.querySelector('.fy-reminder[aria-expanded="true"] + .fy-alert-text')?.innerText.trim() === 'E2E 公告正文 0'
                    `),
                );
                await cdp.click('.fy-reminders li:nth-child(2) .fy-reminder');
                t.check(
                    '切换时间线条目只展开当前原文',
                    await cdp.evaluate(`
                        document.querySelectorAll('.fy-reminder[aria-expanded="true"]').length === 1 &&
                        document.querySelector('.fy-reminder[aria-expanded="true"] + .fy-alert-text')?.innerText.trim() === 'E2E 公告正文 1'
                    `),
                );
                await cdp.click('[aria-label="梦魇夜叉提醒"] [role="radio"]:last-child');
                await ui.waitFor(
                    `window.__e2eFengyao.updateCalls === 1 && !document.querySelector('[aria-label="梦魇夜叉提醒"]').classList.contains('off')`,
                );
                t.check(
                    '监听中开启夜叉保留封妖，并且复用当前任务',
                    await cdp.evaluate(`
                    window.__e2eFengyao.fake.running && window.__e2eFengyao.stopCalls === 0 &&
                    window.__e2eFengyao.fake.config.reminders.some(x => x.kind === 'fengyao') &&
                    window.__e2eFengyao.fake.config.reminders.some(x => x.kind === 'yecha' && x.scenes.length === 0)
                `),
                );
                await ui.clickLabel('返回工具列表');
                await ui.waitFor(
                    `location.hash === '#/tools' && !document.querySelector('.fengyao')`,
                );
                t.check(
                    '离开页面没有停止后台监听',
                    await cdp.evaluate('window.__e2eFengyao.stopCalls === 0'),
                );
                await ui.clickText('button, a', '提醒助手');
                await ui.waitFor(
                    `document.querySelector('.fy-settings .fy-window-control + .fy-status')?.textContent.includes('监听中')`,
                );
                t.check(
                    '回来读取后台状态与手动选择，复用已启动的监听',
                    await cdp.evaluate(`
                    window.__e2eFengyao.statusCalls >= 2 && window.__e2eFengyao.startCalls === 1 &&
                    !document.querySelector('[aria-label="封妖提醒"]').classList.contains('off') &&
                    !document.querySelector('[aria-label="停止公告监听"]').disabled
                `),
                );
            } finally {
                await cdp.evaluate(`location.hash = '#/tools'`);
                await ui.waitFor(`!document.querySelector('.fengyao')`);
                await cdp.evaluate(`(() => {
                    const saved = window.__e2eFengyao;
                    window.__TAURI_INTERNALS__.invoke = saved.invoke;
                    if (saved.preference === null) localStorage.removeItem('mh-fengyao-preferences');
                    else localStorage.setItem('mh-fengyao-preferences', saved.preference);
                    delete window.__e2eFengyao;
                })()`);
            }
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
            const visible = await cdp.evaluate(`
                [...document.querySelectorAll('[data-dev-section]')]
                    .filter(el => el.getClientRects().length).map(el => el.dataset.devSection)`);
            t.check('默认仅展示组件预览，调试数据单独分组', visible.join() === 'components');
            t.check(
                '日期区间和表单操作区组合示例可见',
                await cdp.evaluate(`!!document.querySelector('.date-range-field') &&
                    !!document.querySelector('.demo-actions [data-modal-cancel]') &&
                    !!document.querySelector('.demo-actions [aria-label="示例保存"]')`),
            );
            await ui.clickLabel('示例保存');
            t.check('示例重试清除错误', !(await ui.exists('.demo-actions .save-error')));
            await ui.clickText('[aria-label="开发帮助分组"] button', '图标目录', { exact: true });
            t.check(
                '图标目录直接展示完整清单，不提供搜索',
                await cdp.evaluate(`
                document.querySelectorAll('.icon-item').length > 0 &&
                !document.querySelector('.icon-search')`),
            );
            await ui.clickText('[aria-label="开发帮助分组"] button', '调试数据', { exact: true });
            t.check(
                '只保留统一模拟账本入口，无独立领域示例按钮',
                await cdp.evaluate(`
                !!document.querySelector('[aria-label="导入模拟数据"]')?.getClientRects().length &&
                !document.querySelector('[aria-label="添加目标示例"], [aria-label="添加仓库示例"], [aria-label="添加关联交易示例"]')`),
            );
            await ui.clickLabel('导入模拟数据');
            await ui.waitFor(`!!document.querySelector('[role="dialog"]')`);
            t.check(
                '替换前确认包含全部账本与自动备份',
                (await ui.text('[role="dialog"]')).includes('替换全部账本') &&
                    (await ui.text('[role="dialog"]')).includes('替换前自动备份'),
            );
            await ui.clickText('[role="dialog"] button', '保持现状', { exact: true });
            await ui.clickText('[aria-label="开发帮助分组"] button', '组件预览', { exact: true });
            t.check('切组返回保留纯内存示例状态', !(await ui.exists('.demo-actions .save-error')));
            await cdp.click('.atoms-nav button[data-id="read"]');
            t.check(
                '读数示例展示三种可复用材质卡',
                await cdp.evaluate(`[...document.querySelectorAll('.demo-materials figure > .material-card')]
                    .map(card => card.dataset.material).join() === 'glass,frosted,turned-metal'`),
            );
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

        /* 图鉴只读，不写账本；图片加载只检查进入视口的预览，不要求屏外懒加载完成。 */
        await t.step('游戏资源：检索、分组等级、头像与预览', async () => {
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
            t.check('默认只摆武器一类', cards === 1, `${cards} 张，${total}`);
            t.check('计数是这一类的总数', /^共 \d+ 项$/.test(total), total);
            const layout = await cdp.evaluate(`(() => {
                const input = document.querySelector('.asset-bar input[type=search]');
                const bar = document.querySelector('.asset-bar');
                const heading = document.querySelector('.asset-sub');
                const marker = heading.querySelector('.section-mark').getBoundingClientRect();
                const text = heading.lastElementChild.getBoundingClientRect();
                const range = document.createRange();
                range.selectNodeContents(heading.lastElementChild);
                const scale = parseFloat(getComputedStyle(input).getPropertyValue('--fs-scale')) || 1;
                return {
                    width: input.getBoundingClientRect().width,
                    expected: Math.min(260 * scale, bar.getBoundingClientRect().width),
                    singleLine: range.getClientRects().length === 1,
                    besideMarker: text.left >= marker.right &&
                        Math.abs((text.top + text.bottom - marker.top - marker.bottom) / 2) <= 1,
                };
            })()`);
            t.check('搜索框保持固定宽度', Math.abs(layout.width - layout.expected) <= 1);
            t.check(
                '分组标题单行且位于竖条右侧',
                layout.singleLine && layout.besideMarker,
                JSON.stringify(layout),
            );
            t.check('每页限制图标数量', (await ui.count('.asset-cell')) <= 120);
            t.check(
                '图鉴分页保留资源专属标签和页码播报',
                await cdp.evaluate(`!!document.querySelector('[aria-label="资源分页"] [aria-live="polite"] .asset-page-info') &&
                    document.querySelector('[aria-label="资源上一页"]')?.disabled === true`),
            );
            t.check(
                '上一页和下一页使用纯图标按钮，当前页有唯一标记',
                await cdp.evaluate(`(() => {
                    const pager = document.querySelector('.asset-pages');
                    const arrows = ['资源上一页', '资源下一页'].map((label) =>
                        pager.querySelector('[aria-label="' + label + '"]'));
                    return arrows.every((button) => button?.querySelector('svg') && !button.textContent.trim()) &&
                        pager.querySelectorAll('[aria-current="page"]').length === 1 &&
                        pager.querySelector('[aria-current="page"]')?.dataset.page === '1';
                })()`),
            );
            await ui.clickLabel('资源下一页');
            t.check(
                '下一页生效',
                await cdp.waitFor(
                    `document.querySelector('.asset-page-info')?.textContent?.trim().startsWith('2 /')`,
                ),
            );

            const lastPage = await cdp.evaluate(`Number(
                [...document.querySelectorAll('.asset-pages [data-page]')].at(-1).dataset.page,
            )`);
            await cdp.click(`.asset-pages [data-page="${lastPage}"]`);
            t.check(
                '点击末页直接到达，下一页在边界禁用',
                await cdp.waitFor(`document.querySelector('.asset-pages [aria-current="page"]')?.dataset.page === '${lastPage}' &&
                    document.querySelector('[aria-label="资源下一页"]')?.disabled === true`),
            );
            if (lastPage > 7) {
                await cdp.click('.asset-pages [data-page-gap="previous"]');
                t.check(
                    '省略号向前跳五页，焦点保留在新的当前页',
                    await cdp.waitFor(`(() => {
                        const current = document.querySelector('.asset-pages [aria-current="page"]');
                        return current?.dataset.page === '${lastPage - 5}' && document.activeElement === current;
                    })()`),
                );
                await cdp.click('.asset-pages [data-page-gap="next"]');
                t.check(
                    '省略号向后跳五页，恢复末页',
                    await cdp.waitFor(
                        `document.querySelector('.asset-pages [aria-current="page"]')?.dataset.page === '${lastPage}'`,
                    ),
                );
            }
            await cdp.click('.asset-pages [data-page="1"]');
            await ui.waitFor(
                `document.querySelector('.asset-pages [aria-current="page"]')?.dataset.page === '1'`,
            );
            await ui.fill('搜索资源名', '剑');
            const narrowed = await cdp.waitFor(
                `document.querySelector('.asset-count')?.textContent?.trim().startsWith('找到 ')`,
            );
            t.check('搜索收窄并重置分页', narrowed && !(await ui.exists('.asset-pages')));
            const choose = async (label, value) => {
                await ui.clickLabel(label);
                await ui.clickText('.select-opt', value, { exact: true });
            };
            await choose('按分组筛选', '剑');
            await choose('按等级筛选', '60 级');
            t.check(
                '精确筛选 60 级剑',
                await cdp.waitFor(
                    `document.querySelectorAll('.asset-cell').length > 0 &&
                [...document.querySelectorAll('.asset-meta')].every((el) => el.textContent.trim() === '60 级')`,
                ),
            );

            await choose('按类别筛选', '全部分类');
            await ui.fill('搜索资源名', '兔子怪');
            t.check(
                '全局搜索找到头像，切分类清除等级与分组',
                await cdp.waitFor(
                    `document.querySelector('.asset-title')?.textContent?.trim() === '召唤兽头像'`,
                ),
            );
            await ui.fill('搜索资源名', '泡泡相伴');
            t.check(
                '同名技能的物法版本分别展示',
                await cdp.waitFor(
                    `[...document.querySelectorAll('.asset-name')].some((el) => el.textContent === '泡泡相伴（物）') &&
                [...document.querySelectorAll('.asset-name')].some((el) => el.textContent === '泡泡相伴（法）')`,
                ),
            );
            await ui.clickLabel('查看泡泡相伴（物）大图');
            t.check(
                '预览完整技能名称',
                await cdp.waitFor(
                    `document.querySelector('[role="dialog"] h2')?.textContent === '泡泡相伴（物）'`,
                ),
            );
            await cdp.key('Escape');
            t.check(
                'Esc 关闭后焦点回到原图标',
                await cdp.waitFor(
                    `!document.querySelector('[role="dialog"]') &&
                document.activeElement?.getAttribute('aria-label') === '查看泡泡相伴（物）大图'`,
                ),
            );
            await cdp.key('Enter');
            t.check(
                '键盘可重新打开预览',
                await cdp.waitFor(`!!document.querySelector('[role="dialog"]')`),
            );
            await cdp.key('Escape');

            await ui.clickLabel('清除资源筛选');
            await choose('按类别筛选', '召唤兽头像');
            t.check(
                '头像分类分页显示',
                await cdp.waitFor(
                    `document.querySelector('.asset-title')?.textContent?.trim() === '召唤兽头像' &&
                document.querySelectorAll('.asset-cell').length <= 120 && !!document.querySelector('.asset-pages')`,
                ),
            );
            await ui.clickLabel('查看兔子怪大图');
            const imageReady = `(() => {
                const img = document.querySelector('[role="dialog"] .asset-image img');
                return !!img?.complete && img.naturalWidth > 0;
            })()`;
            t.check('头像原图实际可读', await cdp.waitFor(imageReady));
            await cdp.evaluate(`document.querySelector('[role="dialog"] .asset-image img')
                .dispatchEvent(new Event('error'))`);
            t.check(
                '缺图显示占位',
                await cdp.waitFor(
                    `!!document.querySelector('[role="dialog"] .asset-image-missing')`,
                ),
            );
            await ui.clickLabel('重试预览图片');
            t.check('重试后恢复图片', await cdp.waitFor(imageReady));
            await ui.clickLabel('关闭资源预览');

            await ui.fill('搜索资源名', '不存在的资源-e2e');
            t.check(
                '搜索无结果与加载失败区分',
                await cdp.waitFor(
                    `document.querySelector('.asset-void h3')?.textContent === '没有匹配的资源' &&
                !document.querySelector('.asset-warning')`,
                ),
            );
            await ui.clickLabel('清除无结果筛选');
            await choose('按类别筛选', '门派技能');
            t.check(
                '清除筛选后仍可切换分类',
                await cdp.waitFor(
                    `document.querySelector('.asset-title')?.textContent?.trim() === '门派技能'`,
                ),
            );
        });

        /* ---------- 活动日历：点一张卡能把提醒加进闹钟 ----------
         *
         * 验的是**全链路**：卡片 → 弹窗 → 换算 → 闹钟落盘 → 重载后仍按活动 ID 标记「已设提醒」。
         * 挑「科举大赛」覆盖按月持续循环，不能退成每周或一次性，
         * 那一支错的话，别的分支看着都好。
         */
        await t.step('活动日历：点一张卡能加提醒', async () => {
            /* 这一节会往 `mh-alarms` 里写一条。先记原值，跑完写回——烟测跑在真实数据
             * 目录上，留一条测试闹钟在用户的闹钟列表里是实打实的副作用。 */
            const before = await cdp.evaluate(`localStorage.getItem('mh-alarms')`);

            try {
                await cdp.evaluate(`localStorage.setItem('mh-alarms', '[]')`);
                await ui.reload({ wait: 1000 });
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

                const loaded = await cdp.waitFor(
                    `document.querySelectorAll('.card').length >= 10`,
                    {
                        timeout: 8000,
                    },
                );
                if (!loaded) throw new Error('活动卡片没出来');

                const groups = await ui.count('.group');
                t.check('活动按时间分了组', groups >= 4, `${groups} 组`);

                const darkWash = await cdp.evaluate(`(() => {
                    const root = document.documentElement;
                    const wasDark = root.classList.contains('dark');
                    const card = document.querySelector('.activity-card:not(.t-month)');
                    const monthly = document.querySelector('.activity-card.t-month');
                    if (!card || !monthly) return false;
                    const wash = (element) => ['--wash', '--wash-hi', '--wash-lo']
                        .map((name) => getComputedStyle(element).getPropertyValue(name).trim()).join('|');
                    try {
                        root.classList.remove('dark');
                        const light = wash(card);
                        const lightMonthly = wash(monthly);
                        root.classList.add('dark');
                        return wash(card) !== light && wash(monthly) !== lightMonthly &&
                            getComputedStyle(root).filter === 'none';
                    } finally {
                        root.classList.toggle('dark', wasDark);
                    }
                })()`);
                t.check('普通与月度活动的暗色配方均能命中，整页无图标滤镜', darkWash);

                await ui.markFirst(`() => [...document.querySelectorAll('.card')].find(
                    (one) => one.querySelector('.name')?.textContent?.trim() === '科举大赛',
                )`);
                await cdp.click('[data-e2e="1"]');
                await ui.waitFor('!!document.querySelector(".modal-panel")');
                await ui.clickLabel('保存这一场的提醒设置');
                await ui.waitFor('!document.querySelector(".modal-panel")');
                const added = await cdp.evaluate(`(() => {
                    const after = [...document.querySelectorAll('.card')].find(
                        (one) => one.querySelector('.name')?.textContent?.trim() === '科举大赛',
                    );
                    return after?.querySelector('.tag')?.textContent?.trim() ?? '';
                })()`);
                t.check('加完提醒，卡上标记「已设提醒」', added === '已设提醒', String(added));
                const linked =
                    await cdp.evaluate(`JSON.parse(localStorage.getItem('mh-alarms')).some(
                    (one) => one.repeat === 'activity' && one.activityId === 'exam' && one.time === '12:00'
                )`);
                t.check('月度活动按 ID 与场次保存', linked);

                /* 落盘：闹钟存在 localStorage，重载后还在才算真加上了。
                 * 只查内存的话，「点完变了个色」也能过，而什么都没存下来。 */
                await ui.reload({ wait: 1300 });
                const kept = await cdp.waitFor(
                    `[...document.querySelectorAll('.card')].some(
                        (one) => one.querySelector('.name')?.textContent?.trim() === '科举大赛'
                            && one.querySelector('.tag')?.textContent?.trim() === '已设提醒',
                    )`,
                    { timeout: 6000 },
                );
                t.check('重载后仍在', kept, kept ? '已设提醒' : '没了');
            } finally {
                /* 写回原值，不给用户留一条测试闹钟。 */
                const restore = `(() => {
                    const v = ${before === null ? 'null' : JSON.stringify(before)};
                    if (v) localStorage.setItem('mh-alarms', v);
                    else localStorage.removeItem('mh-alarms');
                    return 'ok';
                })()`;
                await cdp.evaluate(restore);
                await ui.reload({ wait: 1000 });
            }
        });
    }
}
