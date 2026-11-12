/* ============================ 7. 设置 ============================ */

export default async function run(ctx) {
    const { cdp, ui, t, want, sleep } = ctx;

    if (want('设置')) {
        t.section('7 设置 · 主题、字号、导入与清除的确认窗');

        /*
         * 主题：三档都能切，**切完要还原成跑之前那一档**。
         *
         * 读的是 `localStorage.mh-theme` 而不是根元素的 `dark` 类：类只能分出亮/暗，
         * 「跟随系统」与「浅色」都算亮，还原时会把用户的「跟随系统」改成「浅色」。
         * 这一条是实测吃出来的——早先只切「浅色 → 深色」就收工，每跑一次烟测，
         * 用户的主题就被永久改成深色（2026-11-06 用户报「默认怎么变成深色了」）。
         * `null` 表示从没存过，语义上等于「跟随系统」。
         */
        await t.step('主题三档都能切，并还原成测试前那一档', async () => {
            await ui.goto('设置');
            const readMode = () => cdp.evaluate(`localStorage.getItem('mh-theme') || 'system'`);
            const original = await readMode();
            const isDark = () =>
                cdp.evaluate(
                    `document.documentElement.classList.contains('dark') ? 'dark' : 'light'`,
                );

            await ui.clickText('button.bevel-pill', '浅色');
            await sleep(400);
            t.check('切到浅色', (await isDark()) === 'light');

            await ui.clickText('button.bevel-pill', '深色');
            await sleep(400);
            t.check('切到深色', (await isDark()) === 'dark');

            const label =
                { system: '跟随系统', light: '浅色', dark: '深色' }[original] ?? '跟随系统';
            await ui.clickText('button.bevel-pill', label);
            await sleep(400);
            t.check('主题还原', (await readMode()) === original, `还原到「${label}」`);
            t.info('测试前主题', original);
        });

        await t.step('主色独立于错误色，纸块保留局部染色', async () => {
            const result = await cdp.evaluate(`(() => {
                const root = document.documentElement;
                const original = root.style.getPropertyValue('--accent');
                const priority = root.style.getPropertyPriority('--accent');
                const fixture = document.createElement('div');
                fixture.style.cssText = 'position:fixed;visibility:hidden;pointer-events:none';
                const mark = document.createElement('span');
                mark.className = 'section-mark';
                const error = document.createElement('span');
                error.className = 'note error';
                const reference = document.createElement('span');
                reference.style.color = 'var(--moss)';
                const board = document.createElement('div');
                board.className = 'board';
                board.style.setProperty('--board-face', 'var(--moss)');
                fixture.append(mark, error, reference, board);
                const tile = document.querySelector('.press-tile')?.cloneNode(true);
                if (tile) {
                    tile.className = 'press-tile still';
                    tile.style.setProperty('--tile-face', 'var(--moss)');
                    fixture.append(tile);
                }
                document.body.append(fixture);
                try {
                    const beforeError = getComputedStyle(error).color;
                    const beforeClass = root.className;
                    root.style.setProperty('--accent', 'var(--moss)');
                    const color = getComputedStyle(reference).color;
                    return {
                        accent: getComputedStyle(mark).backgroundColor === color,
                        error: getComputedStyle(error).color === beforeError,
                        mode: root.className === beforeClass,
                        board: getComputedStyle(board).backgroundColor === color,
                        tile: !!tile && getComputedStyle(tile).backgroundColor === color,
                    };
                } finally {
                    if (original) root.style.setProperty('--accent', original, priority);
                    else root.style.removeProperty('--accent');
                    fixture.remove();
                }
            })()`);
            t.check('主色覆写同步区块标', result.accent);
            t.check('主色覆写不改变错误色或明暗档位', result.error && result.mode);
            t.check('纸卡与压印块的局部染色仍生效', result.board && result.tile);
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
            for (const need of ['导出账本到文件', '从备份文件导入账本', '清空全部账本数据']) {
                t.check(`按钮「${need}」在`, labels.includes(need));
            }
        });

        /* 清除：只验证「先问一句」这一层，取消掉不动真数据。 */
        await t.step('清除先弹确认窗，Esc 能取消', async () => {
            await ui.clickLabel('清空全部账本数据');
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
