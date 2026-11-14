/* ============================ 7. 设置 ============================ */

export default async function run(ctx) {
    const { cdp, ui, t, want, sleep } = ctx;

    if (want('设置')) {
        t.section('7 设置 · 风格、明暗、字体、字号、导入与清除的确认窗');

        await t.step('字体独立切换、真实字体加载与重载恢复，结束时还原', async () => {
            await ui.goto('设置');
            const read = () =>
                cdp.evaluate(`(() => ({
                font: document.documentElement.dataset.font,
                stored: localStorage.getItem('mh-font-family'),
                mode: localStorage.getItem('mh-theme'),
                style: localStorage.getItem('mh-theme-style'),
                scale: localStorage.getItem('mh-font-scale'),
                family: getComputedStyle(document.body).fontFamily,
                stroke: parseFloat(getComputedStyle(document.body).webkitTextStrokeWidth),
                strokeMatches: [...document.querySelectorAll('h1, button, input')].every(el => {
                    const style = getComputedStyle(el);
                    return style.webkitTextStrokeColor === style.color;
                }),
            }))()`);
            const original = await read();
            const fonts = [
                ['wenkai', '霞鹜文楷', 'LXGW WenKai Screen'],
                ['sans', '思源黑体', 'MH Toolbox Hei'],
                ['serif', '思源宋体', 'MH Toolbox Song'],
                ['zhuque', '朱雀仿宋', 'MH Toolbox Fangsong'],
                ['rounded', '资源圆体', 'MH Toolbox Rounded'],
            ];
            try {
                for (const [id, label, family] of fonts) {
                    await ui.clickText('[aria-label="字体"] button', label, { exact: true });
                    await cdp.waitFor(`document.documentElement.dataset.font === '${id}'`);
                    const loaded = await cdp.evaluate(
                        `document.fonts.load('14px "${family}"', '梦幻养老助手').then(fonts =>
                            fonts.length > 0 && fonts.every(font => font.status === 'loaded'))`,
                    );
                    const current = await read();
                    t.check(
                        `${label}真实字体加载并全局应用`,
                        loaded && current.family.includes(family),
                    );
                    t.check(
                        `${label}不改主题与字号`,
                        current.mode === original.mode &&
                            current.style === original.style &&
                            current.scale === original.scale,
                    );
                    t.check(
                        `${label}仅仿宋启用轻描字廓`,
                        id === 'zhuque'
                            ? current.stroke > 0 && current.strokeMatches
                            : current.stroke === 0,
                    );
                    if (id === 'zhuque') {
                        const tabular = await cdp.evaluate(`(() => {
                            const probe = document.createElement('span');
                            probe.className = 'num';
                            probe.style.cssText = 'position:fixed;visibility:hidden;white-space:nowrap';
                            document.body.append(probe);
                            try {
                                const width = (text) => {
                                    probe.textContent = text;
                                    return probe.getBoundingClientRect().width;
                                };
                                return Math.abs(width('111111') - width('888888')) < 0.1;
                            } finally {
                                probe.remove();
                            }
                        })()`);
                        t.check('仿宋数字签保留等宽数字', tabular);
                    }
                }
                await ui.reload();
                await cdp.waitFor(`!!document.querySelector('[aria-label="字体"]')`);
                t.check('重载后恢复独立字体选择', (await read()).font === 'rounded');
            } finally {
                const back = fonts.find(([id]) => id === original.font) ?? fonts[0];
                await ui.clickText('[aria-label="字体"] button', back[1], { exact: true });
                await cdp.waitFor(`document.documentElement.dataset.font === '${back[0]}'`);
                if (original.stored === null) {
                    await cdp.evaluate(`localStorage.removeItem('mh-font-family')`);
                }
            }
        });

        await t.step('风格独立切换并在重载后恢复，结束时还原', async () => {
            await ui.goto('设置');
            const styles = [
                ['ledger', '账簿'],
                ['celadon', '青瓷'],
                ['azure', '霁蓝'],
                ['crystal', '水晶'],
                ['dunhuang', '敦煌岩彩'],
                ['rosewood', '紫檀书斋'],
            ];
            const readAppearance = () =>
                cdp.evaluate(`(() => {
                const root = document.documentElement;
                const group = document.querySelector('[aria-label="风格"]');
                const board = group?.closest('.board');
                const surface = document.querySelector('.page-content.surface');
                const stamp = document.querySelector('[aria-label="清空全部账本数据"] .slot-stamp');
                return {
                    style: root.dataset.style,
                    label: group.querySelector('[aria-checked="true"]').textContent.trim(),
                    labels: [...group.querySelectorAll('[role="radio"]')].map(el => el.textContent.trim()),
                    fits: group.scrollWidth <= group.clientWidth + 1 &&
                        group.getBoundingClientRect().right <= (board?.getBoundingClientRect().right ?? innerWidth) + 1,
                    storedStyle: localStorage.getItem('mh-theme-style'),
                    mode: localStorage.getItem('mh-theme'),
                    dark: root.classList.contains('dark'),
                    scale: getComputedStyle(root).getPropertyValue('--fs-scale'),
                    background: surface ? getComputedStyle(surface).background : '',
                    texture: surface ? getComputedStyle(surface).backgroundImage : '',
                    danger: stamp ? getComputedStyle(stamp).backgroundColor : '',
                };
            })()`);
            const original = await readAppearance();
            t.check(
                '风格入口仅保留最终六套，顺序一致',
                original.labels.length === styles.length &&
                    original.labels.every((label, index) => label === styles[index][1]),
            );
            try {
                await ui.clickText('button.bevel-pill', '账簿');
                await sleep(400);
                const ledger = await readAppearance();
                for (const [style, label] of styles.slice(1)) {
                    await ui.clickText('button.bevel-pill', label);
                    await sleep(400);
                    const selected = await readAppearance();
                    t.check(
                        `${label}风格与保存值同步`,
                        selected.style === style && selected.storedStyle === style,
                    );
                    t.check(
                        `${label}台面随风格变化`,
                        !!selected.background && selected.background !== ledger.background,
                    );
                    t.check(
                        `${label}危险按钮保持独立颜色`,
                        !!selected.danger && selected.danger === ledger.danger,
                    );
                    t.check(
                        `${label}保持明暗和字号`,
                        selected.mode === original.mode &&
                            selected.dark === original.dark &&
                            selected.scale === original.scale,
                    );
                    t.check(`${label}风格选项不挤出卡片`, selected.fits);
                    if (['crystal', 'dunhuang', 'rosewood'].includes(style)) {
                        t.check(`${label}台面保留专属材质`, selected.texture.includes('gradient('));
                    }

                    await ui.reload();
                    await ui.goto('设置');
                    const restored = await readAppearance();
                    t.check(
                        `重载恢复${label}及原明暗`,
                        restored.style === style &&
                            restored.background === selected.background &&
                            restored.mode === original.mode &&
                            restored.dark === original.dark &&
                            restored.scale === original.scale,
                    );
                }
            } finally {
                await ui.goto('设置');
                await ui.clickText('button.bevel-pill', original.label);
                await sleep(400);
                if (original.storedStyle === null) {
                    await cdp.evaluate(`localStorage.removeItem('mh-theme-style')`);
                }
            }
            t.check('风格还原', (await readAppearance()).style === original.style);
        });

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
                const clear = document.querySelector('[aria-label="清空全部账本数据"]');
                const clearStamp = clear?.querySelector('.slot-stamp');
                const beforeDanger = clearStamp ? getComputedStyle(clearStamp).backgroundColor : '';
                const popover = document.createElement('div');
                popover.className = 'pet-picker-panel';
                fixture.append(mark, error, reference, board, popover);
                const tile = document.querySelector('.press-tile')?.cloneNode(true);
                if (tile) {
                    tile.className = 'press-tile still';
                    tile.style.setProperty('--tile-face', 'var(--moss)');
                    fixture.append(tile);
                }
                document.body.append(fixture);
                const originalPopover = root.style.getPropertyValue('--popover-bg');
                const popoverPriority = root.style.getPropertyPriority('--popover-bg');
                try {
                    const beforeError = getComputedStyle(error).color;
                    const beforeClass = root.className;
                    root.style.setProperty('--accent', 'var(--moss)');
                    root.style.setProperty('--popover-bg', 'var(--moss)');
                    const color = getComputedStyle(reference).color;
                    return {
                        accent: getComputedStyle(mark).backgroundColor === color,
                        error: getComputedStyle(error).color === beforeError,
                        mode: root.className === beforeClass,
                        board: getComputedStyle(board).backgroundColor === color,
                        tile: !!tile && getComputedStyle(tile).backgroundColor === color,
                        danger:
                            !!clear?.classList.contains('danger-action') && !!clearStamp &&
                            getComputedStyle(clearStamp).backgroundColor === beforeDanger,
                        popover: getComputedStyle(popover).backgroundColor === color,
                        rootFilter: getComputedStyle(root).filter === 'none',
                    };
                } finally {
                    if (original) root.style.setProperty('--accent', original, priority);
                    else root.style.removeProperty('--accent');
                    if (originalPopover) {
                        root.style.setProperty('--popover-bg', originalPopover, popoverPriority);
                    } else root.style.removeProperty('--popover-bg');
                    fixture.remove();
                }
            })()`);
            t.check('主色覆写同步区块标', result.accent);
            t.check('主色覆写不改变错误色或明暗档位', result.error && result.mode);
            t.check('纸卡与压印块的局部染色仍生效', result.board && result.tile);
            t.check('清除按钮保留危险色', result.danger);
            t.check('选择器浮层使用共用材质', result.popover);
            t.check('图标滤镜未落到整页', result.rootFilter);
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
