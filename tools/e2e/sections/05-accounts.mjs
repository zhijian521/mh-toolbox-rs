/* ============================ 5. 账号 ============================ */

export default async function run(ctx) {
    const { cdp, ui, t, want, sleep } = ctx;

    if (want('账号')) {
        const warehouseIdle = `!document.querySelector('.warehouse-forward-enter-active, .warehouse-forward-leave-active, .warehouse-back-enter-active, .warehouse-back-leave-active')`;
        t.section('5 账号 · 两本账 · 角色分类堆叠图 · 记一笔 → 历史里删掉');
        let baseline;
        const rmbNumber = (text) => Number(text.replace('−', '-').replace(/[^0-9.-]/g, ''));
        const warehouseItems = (name) => `[...document.querySelectorAll('.warehouse-item')].filter((one) =>
            one.getAttribute('aria-label')?.includes(${JSON.stringify(name)}))`;
        async function narrowWarehouse(kind, name) {
            if (kind === '召唤兽') await ui.fill('搜索仓库物品', name);
            else {
                await ui.clickLabel('筛选装备部位');
                await ui.clickText('[role="option"]', '武器', { exact: true });
            }
        }

        await t.step('两本账与十一个快捷入口都在', async () => {
            await ui.gotoReady('账号');
            const shape = await cdp.evaluate(`(() => ({
                books: document.querySelectorAll('.account-overview .books .book.folded-card[data-spine=left]').length,
                bookValues: [...document.querySelectorAll('.books .book')].every((one) =>
                    one.querySelectorAll('[data-stat-id]').length === 3 &&
                    !!one.querySelector('.stats-heading-icon') &&
                    !one.querySelector('h3').textContent.includes('笔') &&
                    one.querySelector('.stats-head').title.includes('笔') &&
                    [...one.querySelectorAll('[data-stat-id]')].every((cell) =>
                        cell.getBoundingClientRect().left >=
                            one.querySelector('.folded-spine').getBoundingClientRect().right + 15)),
                overviewHeading: document.querySelector('.account-overview .section-head h2')?.textContent.trim(),
                noRangeText: !document.querySelector('.account-overview .range-text'),
                booksFill: (() => {
                    const host = document.querySelector('.books');
                    const box = host.getBoundingClientRect();
                    const [first, last] = [...host.querySelectorAll('.book')].map((one) => one.getBoundingClientRect());
                    return first && last &&
                        Math.abs(box.width - host.parentElement.getBoundingClientRect().width) < 1 &&
                        Math.abs(first.width - last.width) < 1 &&
                        Math.abs(first.left - box.left) < 1 && Math.abs(last.right - box.right) < 1;
                })(),
                plainCards: [...document.querySelectorAll('.accounts-layout .board')].every((one) =>
                    getComputedStyle(one).backgroundImage === 'none'),
                headerActions: !!document.querySelector('[aria-label="查看账号历史记录"]:not(.seal) .press-tile') &&
                    !!document.querySelector('[aria-label="打开装备和召唤兽仓库"] .press-tile'),
                noGenericEntry: !document.querySelector('[aria-label="记一笔账号收支"]'),
                noSectionHints: !document.querySelector('.accounts-layout .section-head .hint, .trend-head .muted'),
                shortcuts: document.querySelectorAll('.shortcuts .shortcut').length,
                shortcutSizing: (() => {
                    const list = document.querySelector('.shortcuts');
                    const scale = Number(getComputedStyle(list).getPropertyValue('--fs-scale')) || 1;
                    return [...list.querySelectorAll('.shortcut')].every((one) =>
                        one.getBoundingClientRect().width <= 260 * scale + 1 &&
                        Math.abs(Number.parseFloat(getComputedStyle(one.querySelector('.sc-icon .app-icon')).width) -
                            23 * scale) < 1);
                })(),
                shortcutWrapping: (() => {
                    const list = document.querySelector('.shortcuts');
                    const scale = Number(getComputedStyle(list).getPropertyValue('--fs-scale')) || 1;
                    const width = list.style.width;
                    const firstRowCount = () => {
                        const cards = [...list.querySelectorAll('.shortcut')];
                        const top = cards[0].getBoundingClientRect().top;
                        return cards.filter((one) => Math.abs(one.getBoundingClientRect().top - top) < 1).length;
                    };
                    try {
                        // 只调整快捷区可用宽度，检查宽窗超过四列、收窄后列数减少。
                        list.style.width = 760 * scale + 'px';
                        const narrow = firstRowCount();
                        list.style.width = 1680 * scale + 'px';
                        const wide = firstRowCount();
                        return wide > 4 && wide > narrow && list.scrollWidth <= list.clientWidth + 1;
                    } finally {
                        list.style.width = width;
                    }
                })(),
                recentCount: document.querySelectorAll('.account-bottom .recent-row').length,
                recentRows: [...document.querySelectorAll('.recent-row')].every((row) => {
                    const copy = row.querySelector('.recent-copy');
                    const title = row.querySelector('.recent-title');
                    const meta = row.querySelector('.recent-meta');
                    const amount = row.querySelector('.recent-amount');
                    return copy && title && meta && amount && !!row.querySelector('.recent-arrow') &&
                        !!meta.querySelector('.recent-who') && !!meta.querySelector('.recent-channel') &&
                        title.getBoundingClientRect().bottom <= meta.getBoundingClientRect().top + 1 &&
                        copy.getBoundingClientRect().right <= amount.getBoundingClientRect().left &&
                        row.title.includes(amount.textContent.trim()) &&
                        row.scrollWidth <= row.clientWidth + 1;
                }),
                shortcutContent: [...document.querySelectorAll('.shortcuts .shortcut')].every((one) =>
                    one.querySelector('.paper-tag') && one.title && !one.querySelector('.sc-copy small') &&
                    !!one.querySelector('.paper-tag-binding[aria-hidden=true]') &&
                    getComputedStyle(one.querySelector('.paper-tag'), '::before').maskImage !== 'none' &&
                    getComputedStyle(one.querySelector('.paper-tag-content'), '::before').maskImage.includes('repeating-linear-gradient') &&
                    getComputedStyle(one.querySelector('.paper-tag-content'), '::before').backgroundImage.includes('linear-gradient') &&
                    one.querySelectorAll('.sc-currency').length === 2 &&
                    ['梦幻币', '人民币'].every((name) => one.querySelector('.sc-total')?.textContent.includes(name)) &&
                    [...one.querySelectorAll('.sc-currency')].every((row) => row.querySelector('.sc-value') && row.querySelector('small') && row.title.includes('笔')) &&
                    (() => {
                        const [cash, rmb] = [...one.querySelectorAll('.sc-currency')].map((row) => row.getBoundingClientRect());
                        return cash && rmb && Math.abs(cash.top - rmb.top) < 1 && cash.right < rmb.left;
                    })() &&
                    one.scrollWidth <= one.clientWidth + 1),
                charts: document.querySelectorAll('.account-charts .analysis-card').length,
                trendBlocks: document.querySelectorAll('.account-charts .trend-block .chart-in-card').length,
                recordsBeforeCharts: !!(document.querySelector('.account-bottom')?.compareDocumentPosition(
                    document.querySelector('.account-charts')) & Node.DOCUMENT_POSITION_FOLLOWING),
                chartSurfaces: document.querySelectorAll('.account-charts .chart-panel > .chart-surface').length,
                chartsInCards: [...document.querySelectorAll('.accounts-layout .chart-panel')].every((one) =>
                    one.classList.contains('chart-in-card') &&
                    getComputedStyle(one).boxShadow === 'none' &&
                    parseFloat(getComputedStyle(one).borderTopWidth) === 0 &&
                    parseFloat(getComputedStyle(one).paddingTop) === 0),
                barFrame: [...document.querySelectorAll('.bar-frame')].every((one) =>
                    one.classList.contains('chart-surface') && !!one.querySelector('.bar-axis') && !!one.closest('.chart-panel')?.querySelector('.chart-legend-shelf')),
                chartHeight: [...document.querySelectorAll('.accounts-layout .chart-surface')].every((one) =>
                    Math.abs(one.getBoundingClientRect().height - 220) < 1),
                chartScroll: [...document.querySelectorAll('.accounts-layout .chart-scroll')].every((viewport) => {
                    const style = getComputedStyle(viewport);
                    if (style.overflowX !== 'auto' || style.scrollbarWidth !== 'none') return false;
                    if (!viewport.firstElementChild) return true;
                    const maxWidth = viewport.style.maxWidth;
                    const scrollLeft = viewport.scrollLeft;
                    try {
                        // 只收窄可视区验证真实横滚，不改图表数据或持久化状态。
                        viewport.style.maxWidth = '80px';
                        viewport.scrollLeft = 0;
                        viewport.scrollLeft = viewport.scrollWidth;
                        return viewport.scrollWidth > viewport.clientWidth && viewport.scrollLeft > 0;
                    } finally {
                        viewport.style.maxWidth = maxWidth;
                        viewport.scrollLeft = scrollLeft;
                    }
                }),
                barDepth: [...document.querySelectorAll('.column.has-value')].every((one) => {
                    const face = one.querySelector('.column-segment') ?? one;
                    return getComputedStyle(face, '::after').content !== 'none' && parseFloat(getComputedStyle(face, '::after').width) >= 6 && getComputedStyle(face).backgroundImage !== 'none';
                }),
                roleChart: (() => {
                    const host = document.querySelector('.account-charts');
                    const role = document.querySelector('.character-flow');
                    const plot = role?.querySelector('.columns-scroll');
                    return host && role ? {
                        fullWidth: Math.abs(host.getBoundingClientRect().width - role.getBoundingClientRect().width) < 1,
                        readable: !plot || (getComputedStyle(plot).overflowX === 'auto' &&
                            [...plot.querySelectorAll('.column-group')].every((one) =>
                                one.getBoundingClientRect().width >= (one.classList.contains('paired') ? 132 : 100) - 1)),
                    } : null;
                })(),
                noRoleFilter: !document.querySelector('.accounts-layout [aria-label="按角色筛选"]'),
                chartSpacing: [...document.querySelectorAll('.accounts-layout .analysis-card')].every((one) =>
                    one.classList.contains('chart-section') &&
                    parseFloat(getComputedStyle(one).paddingBottom) === 8) &&
                    getComputedStyle(document.querySelector('.account-bottom')).alignItems === 'stretch',
                contentWidth: document.querySelector('.accounts-layout')?.getBoundingClientRect().width,
                history: !!document.querySelector('[aria-label="查看账号历史记录"]'),
                primary: document.querySelector('[aria-label="打开装备和召唤兽仓库"]')?.classList.contains('seal') &&
                    !!document.querySelector('[aria-label="打开装备和召唤兽仓库"] .app-icon'),
                bottom: (() => {
                    const recent = document.querySelector('.account-bottom .records')?.getBoundingClientRect();
                    const card = document.querySelector('.account-bottom .channel-card');
                    const channel = card?.getBoundingClientRect();
                    const chartBottom = card?.querySelector('.chart-legend-shelf') ?? card?.querySelector('.chart-surface');
                    const scale = Number(getComputedStyle(document.querySelector('.accounts-layout')).getPropertyValue('--fs-scale')) || 1;
                    return recent && channel ? {
                        sameRow: Math.abs(recent.top - channel.top) < 1,
                        sameWidth: Math.abs(recent.width - channel.width) < 1,
                        sameHeight: Math.abs(recent.height - channel.height) < 1,
                        channelFirst: channel.left < recent.left,
                        stacked: channel.bottom <= recent.top && Math.abs(channel.left - recent.left) < 1,
                        compact: !!chartBottom && channel.bottom - chartBottom.getBoundingClientRect().bottom <= 54 * scale,
                    } : null;
                })(),
            }))()`);

            /* 两本账是这一页的立论：合成一张「总收支」等于把元与万加起来。
             * 少一张就是回到了那个错。 */
            t.check('收支概览复用左侧纸脊双账，等宽铺满内容区且标题保持简洁',
                shape.books === 2 && shape.overviewHeading === '收支概览' && shape.booksFill);
            t.check('独立币种票据保留收入、支出与差额，外卡统一纯色', shape.bookValues && shape.plainCards);
            t.check('概览只保留时间范围切换，不重复显示起止日期文字', shape.noRangeText);
            t.check('快捷入口 11 个', shape.shortcuts === 11, `实际 ${shape.shortcuts}`);
            t.check('快捷纸签限宽，图标跟随总览尺寸与字号缩放', shape.shortcutSizing);
            t.check('快捷纸签随可用宽度自动换行，宽窗不限制为四列或三行', shape.shortcutWrapping);
            t.check('快捷卡一行左梦幻币右人民币，笔数悬停显示且无横向溢出', shape.shortcutContent);
            t.check('双币种走势共用外卡，保留角色分类图', shape.charts === 2 && shape.trendBlocks === 2);
            t.check('历史使用普通按钮，仓库保留主操作，移除独立记一笔入口', shape.headerActions && shape.noGenericEntry);
            t.check('最近记录分类和角色渠道分两行，金额右对齐并保留完整悬停', shape.recentRows);
            t.check('最近记录先于走势，区块移除辅助小字', shape.recordsBeforeCharts && shape.noSectionHints);
            t.check('账号图表统一卡内样式，不重复绘制底板与外影', shape.chartsInCards);
            t.check('账号趋势与分类图统一为 220px，窄区可横滚且隐藏滚动条', shape.chartHeight && shape.chartScroll);
            t.check(
                '账号图表共用台面材质，非零柱带亮面与侧面',
                shape.chartSurfaces >= 2 && shape.barDepth && shape.barFrame,
            );
            t.check('历史入口在页头', shape.history);
            t.check(
                '角色分类图占满整行，柱组保留最小宽度并支持横滚',
                shape.roleChart?.fullWidth && shape.roleChart?.readable,
            );
            t.check('账号主页移除角色筛选，统一展示日期范围内的全部角色', shape.noRoleFilter);
            t.check('图表底部沿用总览 8px 留白，渠道与记录卡片拉伸对齐', shape.chartSpacing);
            t.check('最近记录最多四笔，渠道图表下方不留整行以上空白', shape.recentCount <= 4 && shape.bottom?.compact);
            t.check('仓库使用带收纳图标的主操作色', shape.primary);
            t.check(
                '渠道与最近记录宽屏等高并排，窄屏上下排列',
                shape.bottom?.sameWidth && (shape.contentWidth > 760
                    ? shape.bottom.sameRow && shape.bottom.sameHeight && shape.bottom.channelFirst
                    : shape.bottom.stacked),
            );
            baseline = await cdp.evaluate(`(() => {
                const book = [...document.querySelectorAll('.books .book')].find((one) => one.textContent.includes('人民币'));
                return [...book.querySelectorAll('[data-stat-id] .v')].map((one) => one.textContent.trim());
            })()`);
        });

        await t.step('仓库分类与独立截图草稿入口，取消不入仓', async () => {
            await ui.clickLabel('打开装备和召唤兽仓库');
            await ui.waitFor(`!!document.querySelector('.warehouse-toolbar')`);
            const before = await cdp.evaluate(
                `document.querySelector('.warehouse-count').textContent`,
            );
            t.check(
                '仓库沿用固定内容外框和分页页脚，只有物品区滚动',
                await cdp.evaluate(`(() => {
                    const dialog = document.querySelector('.warehouse-dialog');
                    const body = dialog?.querySelector('.warehouse-list-body');
                    const frame = body?.querySelector('.record-content-frame');
                    const content = frame?.querySelector('.warehouse-content');
                    const footer = dialog?.querySelector('.modal-actions');
                    if (!body || !frame || !content || !footer) return false;
                    const a = frame.getBoundingClientRect();
                    const b = body.getBoundingClientRect();
                    return getComputedStyle(frame).overflow === 'hidden' &&
                        parseFloat(getComputedStyle(frame).borderTopWidth) > 0 &&
                        getComputedStyle(content).overflowY === 'auto' &&
                        Math.abs(a.left - b.left - 16) <= 1 &&
                        Math.abs(b.right - a.right - 16) <= 1 &&
                        !!footer.querySelector('.warehouse-count.record-foot-note') &&
                        !body.querySelector('.warehouse-count') &&
                        !!body.querySelector('.warehouse-filters [aria-label="仓库状态"]');
                })()`),
            );
            t.check('装备仅显示部位筛选，分类滑块按内容定宽', await cdp.evaluate(`(() => {
                const tabs = document.querySelector('.warehouse-tabs');
                const scale = Number(getComputedStyle(tabs).getPropertyValue('--fs-scale')) || 1;
                return !document.querySelector('.warehouse-search') &&
                    tabs.getBoundingClientRect().width < 250 * scale;
            })()`));
            t.check('部位下拉在筛选行右对齐且没有重置按钮', await cdp.evaluate(`(() => {
                const filters = document.querySelector('.warehouse-filters');
                const slot = filters.querySelector('.warehouse-slot-filter');
                return Math.abs(filters.getBoundingClientRect().right - slot.getBoundingClientRect().right) <= 1 &&
                    !filters.querySelector('[aria-label="清空仓库筛选"]');
            })()`));
            await ui.clickLabel('筛选装备部位');
            await ui.clickText('[role="option"]', '武器', { exact: true });
            await ui.clickLabel('筛选装备部位');
            await ui.clickText('[role="option"]', '全部部位', { exact: true });
            t.check(
                '选择全部部位恢复原列表',
                before ===
                    (await cdp.evaluate(`document.querySelector('.warehouse-count').textContent`)),
            );
            await cdp.evaluate(`window.__warehouseMask = document.querySelector('.modal-mask')`);
            await ui.clickLabel('新增或截图录入装备');
            await ui.waitFor(`!!document.querySelector('input[aria-label="装备截图文件"]')`);
            await ui.waitFor(warehouseIdle);
            t.check(
                '进入编辑沿用原遮罩，只有一个弹窗',
                await cdp.evaluate(`
                window.__warehouseMask === document.querySelector('.modal-mask') &&
                document.querySelectorAll('.modal-mask').length === 1 &&
                document.querySelectorAll('[role="dialog"]').length === 1
            `),
            );
            t.check(
                '装备复用详情与截图入口',
                await cdp.evaluate(`!!document.querySelector('.gear-name-input')`),
            );
            await ui.clickLabel('返回仓库列表');
            await ui.waitFor(`!!document.querySelector('.warehouse-toolbar')`);
            await ui.waitFor(warehouseIdle);
            t.check(
                '返回沿用遮罩并还焦点给入仓按钮',
                await cdp.evaluate(`
                window.__warehouseMask === document.querySelector('.modal-mask') &&
                document.activeElement?.hasAttribute('data-warehouse-add')
            `),
            );
            t.check(
                '空草稿取消不入仓',
                before ===
                    (await cdp.evaluate(`document.querySelector('.warehouse-count').textContent`)),
            );
            await ui.clickText('[aria-label="仓库分类"] button', '召唤兽', { exact: false });
            await ui.clickLabel('新增或截图录入召唤兽');
            await ui.waitFor(`!!document.querySelector('input[aria-label="召唤兽截图文件"]')`);
            await ui.waitFor(warehouseIdle);
            t.check(
                '宝宝复用属性表单',
                await cdp.evaluate(`!!document.querySelector('input[aria-label="召唤兽名称"]')`),
            );
            await ui.clickLabel('返回仓库列表');
            await ui.waitFor(`!!document.querySelector('.warehouse-toolbar')`);
            await ui.waitFor(warehouseIdle);
            await ui.clickLabel('关闭仓库');
            await cdp.evaluate(`delete window.__warehouseMask`);
        });

        await t.step('仓库只显示图标，悬停看属性，点击修改并从详情删除', async () => {
            await ui.clickLabel('打开装备和召唤兽仓库');
            await ui.waitFor(`!!document.querySelector('.warehouse-toolbar')`);
            for (const kind of ['装备', '召唤兽']) {
                await ui.clickText('[aria-label="仓库分类"] button', kind);
                const name = `E2E仓库${kind}-${Date.now()}`;
                await ui.clickLabel(`新增或截图录入${kind}`);
                if (kind === '装备') {
                    await ui.waitFor(`!!document.querySelector('.gear-name-input')`);
                    await ui.waitFor(warehouseIdle);
                    await ui.fillSel('.gear-name-input', name);
                } else {
                    await ui.waitFor(`!!document.querySelector('input[aria-label="召唤兽名称"]')`);
                    await ui.waitFor(warehouseIdle);
                    await ui.fill('召唤兽名称', name);
                    await ui.fill('召唤兽气血', '3456');
                    await ui.fill('成长', '1.275');
                }
                await ui.clickLabel('保存仓库物品');
                await ui.waitFor(`!!document.querySelector('.warehouse-toolbar')`);
                await ui.waitFor(warehouseIdle);
                await narrowWarehouse(kind, name);
                await ui.waitFor(`${warehouseItems(name)}.length === 1`);
                t.check(
                    `${kind}列表仅保留图标`,
                    await cdp.evaluate(`(() => {
                    const item = ${warehouseItems(name)}[0];
                    return !!item?.querySelector('.press-tile') &&
                        !item.querySelector('.slip-row, .pet-list, b, small') &&
                        !document.querySelector('.warehouse-grid [aria-label="删除仓库物品"]');
                })()`),
                );
                const point = await cdp.evaluate(`(() => {
                    const box = ${warehouseItems(name)}[0].getBoundingClientRect();
                    return { x: box.left + box.width / 2, y: box.top + box.height / 2 };
                })()`);
                await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', ...point });
                await ui.waitFor(`!!document.querySelector('.detail-tip.on')`);
                t.check(
                    `${kind}浮层展示名称且位于仓库遮罩上方`,
                    await cdp.evaluate(`(() => {
                    const tip = document.querySelector('.detail-tip.on');
                    const mask = document.querySelector('.modal-mask');
                    return tip?.textContent.includes(${JSON.stringify(name)}) &&
                        Number(getComputedStyle(tip).zIndex) > Number(getComputedStyle(mask).zIndex) &&
                        (tip.classList.contains('pet-tip')
                            ? tip.textContent.includes('3456') && tip.textContent.includes('1.275') &&
                                ['属性', '加点', '资质', '技能'].every((label) => tip.textContent.includes(label)) &&
                                !tip.textContent.includes('内丹')
                            : !!tip.querySelector('[aria-label="装备属性"]'));
                })()`),
                );
                if (kind === '召唤兽') {
                    t.check(
                        '召唤兽属性、加点、资质三列对齐，技能放在下方',
                        await cdp.evaluate(`(() => {
                        const tip = document.querySelector('.pet-tip.on');
                        const columns = Array.from(tip.querySelectorAll('.pet-tip-columns > section'));
                        const boxes = columns.map((column) => column.getBoundingClientRect());
                        const skills = tip.querySelector('.tip-content > .pet-tip-group');
                        const facts = columns[2]?.querySelector('.pet-tip-facts');
                        return columns.length === 3 &&
                            columns.map((column) => column.getAttribute('aria-label')).join() === '属性,加点,资质' &&
                            boxes.every((box) => Math.abs(box.top - boxes[0].top) <= 1) &&
                            boxes.slice(1).every((box, i) => box.left > boxes[i].right) &&
                            columns.every((column) => {
                                const rows = Array.from(column.querySelectorAll('.slip-row'));
                                return rows.every((row) => Math.abs(row.getBoundingClientRect().left -
                                    rows[0].getBoundingClientRect().left) <= 1);
                            }) &&
                            Array.from(facts.querySelectorAll('.slip-name')).map((name) => name.textContent).join() === '寿命,成长' &&
                            facts.getBoundingClientRect().bottom <= columns[2].querySelector('.group-head').getBoundingClientRect().top &&
                            skills.getBoundingClientRect().top >= Math.max(...boxes.map((box) => box.bottom)) &&
                            tip.scrollWidth <= tip.clientWidth + 1;
                    })()`),
                    );
                }
                await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 0, y: 0 });
                await ui.waitFor(`!document.querySelector('.detail-tip.on')`);
                await cdp.evaluate(`document.querySelector('.warehouse-item').focus()`);
                t.check(
                    `${kind}键盘聚焦也能看详情`,
                    await ui.waitFor(`!!document.querySelector('.detail-tip.on')`),
                );
                await cdp.key('Escape');
                await ui.waitFor(`!document.querySelector('.detail-tip.on')`);
                t.check('关闭浮层后仓库仍在', await ui.exists('.warehouse-toolbar'));
                await ui.clickLabel(`查看并修改 ${name}`);
                await ui.waitFor(`!!document.querySelector('[aria-label="删除仓库物品"]')`);
                await ui.waitFor(warehouseIdle);
                t.check('进入编辑后收起悬停详情', !(await ui.exists('.detail-tip.on')));
                await ui.clickLabel('删除仓库物品');
                await ui.waitFor(`!!document.querySelector('.confirm-title')`);
                t.check(
                    '确认窗共用底层遮罩，不再次压暗背景',
                    await cdp.evaluate(`(() => {
                    const mask = document.querySelector('.modal-mask-nested');
                    return !!mask && getComputedStyle(mask).backgroundColor === 'rgba(0, 0, 0, 0)' &&
                        getComputedStyle(mask.querySelector('.modal-backdrop')).visibility === 'hidden' &&
                        !document.querySelector('.modal-panel:not([inert])')?.contains(document.querySelector('.warehouse-editor-page'));
                })()`),
                );
                await ui.clickLabel('取消');
                t.check('取消删除保留编辑内容', await ui.exists('[aria-label="删除仓库物品"]'));
                await ui.clickLabel('删除仓库物品');
                await ui.waitFor(`!!document.querySelector('.confirm-title')`);
                await ui.clickLabel('确认删除');
                await ui.waitFor(`!!document.querySelector('.warehouse-toolbar')`);
                await ui.waitFor(warehouseIdle);
                t.check(
                    '删除后回列表，筛选中不再有该物品',
                    await ui.waitFor(`${warehouseItems(name)}.length === 0`),
                );
                if (kind === '召唤兽') await ui.fill('搜索仓库物品', '');
            }
            await ui.clickLabel('关闭仓库');
            t.check('关闭仓库不残留详情浮层', !(await ui.exists('.detail-tip.on')));
        });

        await t.step('藏宝阁买卖默认渠道与卖出实得预览', async () => {
            for (const title of ['买入游戏币', '卖出游戏币', '卖出装备', '卖出召唤兽']) {
                await ui.clickLabelPrefix(title + '，');
                await ui.waitFor(`!!document.querySelector('input[aria-label="成交金额"]')`);
                t.check(
                    title + '默认藏宝阁',
                    await cdp.evaluate(
                        `document.querySelector('[aria-label="交易渠道"]')?.textContent.includes('藏宝阁')`,
                    ),
                );
                if (title === '买入游戏币') {
                    t.check('买入不扣费', !(await ui.exists('.fee-preview')));
                } else {
                    await ui.fill('成交金额', '100.3');
                    t.check(
                        title + '向上取分并展示实得',
                        await cdp.waitFor(
                            `document.querySelector('.fee-amounts')?.textContent.includes('5.02') && document.querySelector('.fee-amounts')?.textContent.includes('95.28')`,
                        ),
                    );
                    await ui.fill('成交金额', '0.01');
                    t.check(
                        '实得为零禁止记入',
                        await cdp.evaluate(
                            `document.querySelector('button[aria-label="记入账本"]')?.disabled === true`,
                        ),
                    );
                    t.check(
                        '手续费两格开关在价格下方居中，默认是，只显示手续费与实得',
                        await cdp.evaluate(`(() => {
                        const group = document.querySelector('.fee-switch [aria-label="手续费"]');
                        const amount = document.querySelector('.amount-row input');
                        const row = document.querySelector('.amount-row');
                        const control = group?.closest('.trade-switches');
                        const box = control?.getBoundingClientRect();
                        const rowBox = row?.getBoundingClientRect();
                        return group?.classList.contains('cost-switch') &&
                            group.querySelectorAll('[role="radio"]').length === 2 &&
                            [...group.querySelectorAll('[role="radio"]')].some((one) => one.textContent.trim() === '是' && one.getAttribute('aria-checked') === 'true') &&
                            row?.querySelector('.amount-field')?.nextElementSibling === control &&
                            box && rowBox && Math.abs(box.left + box.width / 2 - rowBox.left - rowBox.width / 2) <= 1 &&
                            row.querySelectorAll('.fee-preview p').length === 1 &&
                            !row.querySelector('.fee-preview .note') &&
                            amount && amount.getBoundingClientRect().bottom <= group.getBoundingClientRect().top;
                    })()`),
                    );
                    await ui.waitFor(`!document.querySelector('.modal-panel-sizing')`);
                    t.check(
                        '手续费提示收起时弹窗平滑缩高，结束后恢复自然高度',
                        await cdp.evaluate(`(async () => {
                        const panel = document.querySelector('.modal-panel');
                        const before = panel.getBoundingClientRect().height;
                        const heights = [];
                        const off = Array.from(document.querySelectorAll('[aria-label="手续费"] button'))
                            .find((button) => button.textContent.trim() === '否');
                        off.click();
                        await new Promise((resolve) => {
                            const start = performance.now();
                            function sample() {
                                heights.push(panel.getBoundingClientRect().height);
                                if (performance.now() - start > 1500 ||
                                    (heights.length > 1 && !panel.classList.contains('modal-panel-sizing'))) resolve();
                                else requestAnimationFrame(sample);
                            }
                            requestAnimationFrame(sample);
                        });
                        const after = panel.getBoundingClientRect().height;
                        const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
                        return !panel.classList.contains('modal-panel-sizing') &&
                            !panel.style.height && !panel.querySelector('.fee-preview') &&
                            after <= before + 1 && (reduced || Math.abs(before - after) <= 1 ||
                            heights.some((height) => height > after + 1 && height < before - 1));
                    })()`),
                    );
                    await ui.waitFor(`!!document.querySelector('input[aria-label="实得金额"]')`);
                    await ui.fill('实得金额', '95.28');
                    t.check('可直接填写实得且不再扣费', !(await ui.exists('.fee-preview')));
                    await ui.clickLabel('交易渠道');
                    await ui.clickText('[role="option"]', '游戏内', { exact: true });
                    t.check('游戏内交易不展示手续费', !(await ui.exists('[aria-label="手续费"]')));
                }
                await ui.clickLabel('关闭账目编辑');
                await ui.waitFor(`!document.querySelector('[role="dialog"]')`);
            }
        });

        /* 记一笔真账，走完整的写库路径，最后自己删干净。
         * 用 `⚠E2E` 开头的备注做标记：删的时候按它定位，不会误删用户的记录。 */
        const MARK = '⚠E2E账号';

        await t.step('记一笔人民币支出：弹窗 → 填数 → 入账', async () => {
            await ui.clickText('.shortcut', '其他收支');
            const opened = await ui.waitFor(`!!document.querySelector('[role="dialog"]')`, {
                timeout: 3000,
            });
            t.check('记一笔的弹窗开了', opened);

            t.check(
                '角色单选胶囊在方向日期上方，默认不指定',
                await cdp.evaluate(`(() => {
                const group = document.querySelector('[aria-label="这笔账记给哪个角色"]');
                const selected = group?.querySelectorAll('[aria-checked="true"]');
                const direction = document.querySelector('[aria-label="收支方向"]');
                const characterField = group?.closest('.form-field');
                return group?.getAttribute('role') === 'radiogroup' && group.classList.contains('wrap') &&
                    selected?.length === 1 && selected[0].textContent.trim() === '不指定' &&
                    group.querySelectorAll('[role="radio"]').length >= 1 &&
                    !group.querySelector('[aria-haspopup="listbox"]') &&
                    characterField?.nextElementSibling === direction?.closest('.form-pair');
            })()`),
            );
            const characterCount = await ui.count(
                '[aria-label="这笔账记给哪个角色"] [role="radio"]',
            );
            if (characterCount > 1) {
                await cdp.evaluate(
                    `document.querySelector('[aria-label="这笔账记给哪个角色"] [role="radio"]:nth-child(2)')?.click()`,
                );
                t.check(
                    '选择角色后仍只选中一枚胶囊',
                    await cdp.evaluate(
                        `document.querySelectorAll('[aria-label="这笔账记给哪个角色"] [aria-checked="true"]').length === 1 && document.querySelector('[aria-label="这笔账记给哪个角色"] [role="radio"]:nth-child(2)')?.getAttribute('aria-checked') === 'true'`,
                    ),
                );
                await ui.clickText('[aria-label="这笔账记给哪个角色"] button', '不指定', {
                    exact: true,
                });
            }

            await ui.fill('备注', MARK);
            await ui.fill('成交金额', '12.');
            t.check(
                '金额输入小数点时保留草稿',
                await cdp.evaluate(`document.activeElement?.value === '12.'`),
            );
            await ui.fill('成交金额', '');
            t.check(
                '清空金额立即禁止记入',
                await cdp.evaluate(
                    `document.querySelector('button[aria-label="记入账本"]')?.disabled === true`,
                ),
            );
            await ui.fill('成交金额', '12.5');
            t.check(
                '金额未失焦即可记入',
                await cdp.evaluate(
                    `document.activeElement?.getAttribute('aria-label') === '成交金额' && document.querySelector('button[aria-label="记入账本"]')?.disabled === false`,
                ),
            );
            await sleep(150);
            await ui.clickText('button', '记入', { exact: true });
            await sleep(500);

            const closed = await cdp.evaluate(`!document.querySelector('[role="dialog"]')`);
            t.check('记完弹窗自己关了', closed);

            /* 默认币种人民币、默认方向支出，所以第一行应该是 `−12.5 元`。
             * 这条同时钉住「金额按币种格式化」：写成 `12.5 万` 就说明币种串了。 */
            const first = await cdp.evaluate(`(() => {
                const row = [...document.querySelectorAll('.recent-row')].find((one) => one.getAttribute('aria-label')?.includes('⚠E2E账号'));
                if (!row) return null;
                return ['.recent-date', '.recent-title', '.recent-channel', '.recent-who', '.recent-amount'].map((selector) => row.querySelector(selector)?.textContent.trim() ?? '');
            })()`);
            t.check('最近记录里出现这一条', Boolean(first), '一行都没有');
            t.check(
                '金额是 −12.5 元（人民币按元、支出带负号）',
                Boolean(first) && first[first.length - 1] === '−12.5 元',
                `实际「${first ? first[first.length - 1] : ''}」`,
            );
        });

        await t.step('柱图悬停与键盘显示渠道收支明细', async () => {
            t.check(
                '柱图整数刻度中心与参考线对齐',
                await cdp.evaluate(`(() => {
                const labels = [...document.querySelectorAll('.channel-card .bar-axis > span')];
                const guides = [...document.querySelectorAll('.channel-card .column-guides > span')];
                return labels.length >= 2 && labels.length === guides.length && labels.every((label, index) => {
                    const box = label.getBoundingClientRect();
                    return Math.abs(box.top + box.height / 2 - guides[index].getBoundingClientRect().top) <= 1;
                });
            })()`),
            );
            const point = await cdp.evaluate(`(() => {
                const group = document.querySelector('.channel-card .column-group');
                if (!group) return null;
                group.scrollIntoView({ block: 'center' });
                const box = group.getBoundingClientRect();
                return { x: box.left + box.width / 2, y: box.top + 90 };
            })()`);
            if (!point) throw new Error('缺少刚入账的渠道柱组');
            await cdp.send('Input.dispatchMouseEvent', {
                type: 'mouseMoved',
                ...point,
                button: 'none',
                buttons: 0,
            });
            t.check(
                '悬停立即显示收支金额',
                await cdp.waitFor(
                    "document.querySelectorAll('.channel-card .chart-tooltip .tooltip-row').length >= 2",
                    { timeout: 2000 },
                ),
            );
            const before = await cdp.evaluate(
                "document.querySelector('.channel-card .chart-tooltip').getBoundingClientRect().left",
            );
            await cdp.send('Input.dispatchMouseEvent', {
                type: 'mouseMoved',
                x: point.x + 6,
                y: point.y,
                button: 'none',
                buttons: 0,
            });
            t.check(
                '明细随鼠标移动并留在图表内',
                await cdp.waitFor(
                    `(() => {
                const tip = document.querySelector('.channel-card .chart-tooltip');
                const host = document.querySelector('.channel-card .bar-chart');
                if (!tip || !host) return false;
                const box = tip.getBoundingClientRect();
                const frame = host.getBoundingClientRect();
                return Math.abs(box.left - ${before}) > 1 && box.left >= frame.left && box.right <= frame.right
                    && box.top >= frame.top && box.bottom <= frame.bottom;
            })()`,
                    { timeout: 2000 },
                ),
            );
            t.check(
                '纵轴刻度只显示整数',
                await cdp.evaluate(`(() => {
                const labels = [...document.querySelectorAll('.channel-card .bar-axis > span')].map((el) => el.textContent.trim());
                return labels.length >= 2 && labels.every((label) => /^[−-]?[\\d,]+ (元|万|分|时)$/.test(label));
            })()`),
            );
            await cdp.evaluate("document.querySelector('.channel-card .column-group').focus()");
            t.check(
                '柱组可用键盘查看',
                await cdp.evaluate("!!document.activeElement?.getAttribute('aria-describedby')"),
            );
            await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape' });
            await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape' });
            t.check(
                'Esc 收起柱图明细',
                await cdp.waitFor("!document.querySelector('.chart-tooltip')", { timeout: 2000 }),
            );
            await cdp.evaluate('document.activeElement?.blur()');
        });

        await t.step('人民币卡上的支出跟着变了', async () => {
            const out = await cdp.evaluate(`(() => {
                const book = [...document.querySelectorAll('.books .book')]
                    .find((one) => (one.textContent || '').includes('人民币'));
                if (!book) return null;
                return [...book.querySelectorAll('[data-stat-id] .v')].map((b) => b.textContent.trim());
            })()`);
            // 相对现有账目检查增量，不假定测试前是空账。
            t.check(
                '人民币支出增加 12.5',
                Boolean(out) &&
                    Math.round((rmbNumber(out[1]) - rmbNumber(baseline[1])) * 100) === 1250,
                `实际 ${out && out[1]}`,
            );
            t.check(
                '人民币差额减少 12.5',
                Boolean(out) &&
                    Math.round((rmbNumber(out[2]) - rmbNumber(baseline[2])) * 100) === -1250,
                `实际 ${out && out[2]}`,
            );
        });

        await t.step('在全部记录里把它删掉', async () => {
            await ui.reload();
            await ui.gotoReady('账号');
            t.check(
                '记录重载后仍在',
                await cdp.evaluate(
                    "[...document.querySelectorAll('.recent-row')].some((one) => one.getAttribute('aria-label')?.includes('⚠E2E账号'))",
                ),
            );
            await ui.clickLabel('查看账号历史记录');
            const opened = await ui.waitFor(`!!document.querySelector('[role="dialog"]')`, {
                timeout: 3000,
            });
            t.check('全部记录弹窗开了', opened);
            t.check(
                '账号历史沿用固定外框，内容内部滚动且表头固定',
                await cdp.evaluate(`(() => {
                    const frame = document.querySelector('.account-history .record-table-frame');
                    const scroll = frame?.querySelector('.income-log-scroll');
                    const table = scroll?.querySelector('.income-table');
                    const head = table?.querySelector('thead th');
                    return frame && scroll && table && head &&
                        frame !== scroll && getComputedStyle(frame).overflow === 'hidden' &&
                        parseFloat(getComputedStyle(frame).borderTopWidth) > 0 &&
                        getComputedStyle(scroll).overflowY === 'auto' &&
                        getComputedStyle(head).position === 'sticky';
                })()`),
            );
            t.check(
                '账号历史共用筛选、汇总和页脚读数',
                await cdp.evaluate(
                    "!!document.querySelector('[role=dialog] .record-filters') && !!document.querySelector('[role=dialog] .record-summary') && !!document.querySelector('[role=dialog] .record-foot-note')",
                ),
            );
            t.check(
                '账号历史默认只展示日期和搜索，细分条件折叠在筛选入口',
                await cdp.evaluate(`(() => {
                    const toggle = document.querySelector('[aria-label="展开或收起账号筛选"]');
                    const panel = document.getElementById(toggle?.getAttribute('aria-controls'));
                    return toggle?.getAttribute('aria-expanded') === 'false' && panel &&
                        getComputedStyle(panel).display === 'none' &&
                        !!document.querySelector('.account-record-search .date-range-field') &&
                        !!document.querySelector('.account-record-search [aria-label="搜索记录"]');
                })()`),
            );
            await ui.clickLabel('展开或收起账号筛选');
            t.check(
                '历史下拉与日期等宽，搜索限宽，主题筛选和普通重置靠右',
                await cdp.evaluate(`(() => {
                    const dialog = document.querySelector('.account-history');
                    const search = dialog?.querySelector('.account-record-search');
                    const grid = dialog?.querySelector('.account-record-filter-grid');
                    const totals = [...(dialog?.querySelectorAll('.account-record-total') ?? [])];
                    if (!search || !grid || totals.length !== 2) return false;
                    const fields = [...grid.querySelectorAll('.select-field')];
                    const rect = grid.getBoundingClientRect();
                    const dateWidth = search.querySelector('.date-field').getBoundingClientRect().width;
                    const keyword = search.querySelector('[aria-label="搜索记录"]');
                    const scale = Number(getComputedStyle(search).getPropertyValue('--fs-scale')) || 1;
                    const actions = dialog.querySelector('.account-record-actions');
                    const toggle = actions?.querySelector('[aria-label="展开或收起账号筛选"]');
                    const reset = actions?.querySelector('[aria-label="清空筛选"]');
                    return !!search.querySelector('.date-range-field') &&
                        !!keyword && keyword.getBoundingClientRect().width <= 210 * scale + 1 &&
                        toggle?.classList.contains('seal') && !!toggle.querySelector('.press-tile') &&
                        !!reset?.querySelector('.press-tile') && !search.contains(toggle) &&
                        Math.abs(actions.getBoundingClientRect().right - dialog.querySelector('.account-record-toolbar').getBoundingClientRect().right) < 1 &&
                        !search.querySelector('[aria-label="来源筛选"]') && fields.length === 6 &&
                        getComputedStyle(grid).display === 'flex' &&
                        fields.every((one) => {
                            const box = one.getBoundingClientRect();
                            return box.left >= rect.left - 1 && box.right <= rect.right + 1 &&
                                Math.abs(box.width - dateWidth) < 1;
                        }) && totals.every((one) =>
                            one.classList.contains('folded-card') && one.dataset.spine === 'left' &&
                            !!one.querySelector('.stats-heading-icon') &&
                            [...one.querySelectorAll('.cap')].map((label) => label.textContent).join('/') === '收入/支出/差额' &&
                            one.querySelectorAll('[data-stat-id] .v').length === 3);
                })()`),
            );

            t.check(
                '历史支持日期和来源筛选',
                await cdp.evaluate(
                    '!!document.querySelector(\'[aria-label^="账号历史开始日期"]\') && !!document.querySelector(\'[aria-label^="账号历史结束日期"]\') && !!document.querySelector(\'[aria-label="来源筛选"]\')',
                ),
            );
            t.check(
                '账号历史的起止日期位于同一组且各自只有一个入口',
                await cdp.evaluate(`(() => {
                    const range = document.querySelector('[role="dialog"] .date-range-field');
                    return range?.querySelectorAll('.date-field').length === 2 &&
                        !!range.querySelector('[aria-label^="账号历史开始日期"]') &&
                        !!range.querySelector('[aria-label^="账号历史结束日期"]');
                })()`),
            );
            await ui.clickLabel('方向筛选');
            await ui.clickText('[role="option"]', '收入', { exact: true });
            const selectedRows = await cdp.evaluate(`document.querySelectorAll('.rec-table tbody tr').length`);
            await ui.clickLabel('展开或收起账号筛选');
            t.check(
                '收起筛选仍显示已选条件并保留筛选结果',
                await cdp.evaluate(`document.querySelector('.account-record-active')?.textContent.includes('收入') &&
                    document.querySelector('[aria-label="展开或收起账号筛选"]').textContent.includes('1') &&
                    document.querySelectorAll('.rec-table tbody tr').length === ${selectedRows}`),
            );
            await ui.clickLabel('展开或收起账号筛选');
            await ui.clickLabel('方向筛选');
            await ui.clickText('[role="option"]', '全部方向', { exact: true });
            await ui.clickLabel('展开或收起账号筛选');
            await ui.fill('搜索记录', MARK);
            await sleep(250);
            await cdp.key('Escape');
            await ui.waitFor(`!document.querySelector('[role="dialog"]')`);
            await ui.clickLabel('查看账号历史记录');
            await ui.waitFor(`!!document.querySelector('[aria-label="搜索记录"]')`);
            t.check(
                '关闭重开保留账号历史搜索条件',
                await cdp.evaluate(
                    `document.querySelector('[aria-label="搜索记录"]').value === ${JSON.stringify(MARK)}`,
                ),
            );
            const hits = await cdp.evaluate(
                `[...document.querySelectorAll('.rec-table tbody tr')]
                    .filter((row) => (row.textContent || '').includes('⚠E2E账号')).length`,
            );
            t.check('搜到刚记的那一条', hits >= 1, `搜到 ${hits} 条`);

            /* **删到一条不剩**，不是「删一条」。
             * 上一次跑挂掉时留下的记录会一直累积，而「删一条之后还剩几条」取决于上一次跑得多干净——
             * 那会让这条断言在「第一次跑」和「第 N 次跑」上给出不同答案。 */
            let left = hits;
            let askedOnce = false;
            for (let round = 0; round < 6 && left > 0; round += 1) {
                await ui.clickIn('.rec-table tbody tr', MARK, { label: '删这一条' });
                await sleep(300);
                /* 删除要二次确认——这一步在账号页是必要的：一条记录挂了很久才发现记错，
                 * 而删掉之后没有任何地方能找回来。 */
                if (
                    !askedOnce &&
                    (await cdp.evaluate(`!!document.querySelector('[role="dialog"]')`))
                ) {
                    askedOnce = true;
                    t.check('删除前问了那句', true);
                }
                await ui.clickText('button', '删除', { exact: true });
                await sleep(400);
                left = await cdp.evaluate(
                    `[...document.querySelectorAll('.rec-table tbody tr')]
                        .filter((row) => (row.textContent || '').includes('⚠E2E账号')).length`,
                );
            }
            t.check('删干净了', left === 0, `还剩 ${left} 条`);

            await cdp.key('Escape');
            await sleep(300);
        });

        await t.step('回到账号页：记录已经不在', async () => {
            await ui.reload();
            await ui.gotoReady('账号');
            const still = await cdp.evaluate(`(() => {
                return [...document.querySelectorAll('.recent-row')].some((one) => one.getAttribute('aria-label')?.includes('⚠E2E账号'));
            })()`);
            t.check('页面上不再有那一笔', still === false, '还能看到 E2E 那条');
        });

        await t.step('物品买卖快照、已卖出查看及删除卖出后回仓', async () => {
            for (const kind of ['装备', '召唤兽']) {
                const name = `E2E交易${kind}-${Date.now()}`;
                const names = [name, `${name}-第二件`];
                for (const itemName of names) {
                    await ui.clickText('.shortcut', `买入${kind}`);
                    await ui.waitFor(`!!document.querySelector('[aria-label="是否关联仓库物品"]')`);
                    await ui.fill('成交金额', '100');
                    await ui.clickText('[aria-label="是否关联仓库物品"] button', '是');
                    await ui.waitFor(
                        `!!document.querySelector('.account-asset') && !document.querySelector('.modal-panel-sizing')`,
                    );
                    t.check(
                        `${kind}无手续费时关联开关居中`,
                        await cdp.evaluate(`(() => {
                        const row = document.querySelector('.trade-switches').getBoundingClientRect();
                        const group = document.querySelector('.asset-switch').getBoundingClientRect();
                        return !document.querySelector('[aria-label="手续费"]') &&
                            Math.abs(row.left + row.width / 2 - group.left - group.width / 2) <= 1;
                    })()`),
                    );
                    t.check(
                        `${kind}关联后必须先录入资料`,
                        await cdp.evaluate(
                            `document.querySelector('[aria-label="记入账本"]')?.disabled === true`,
                        ),
                    );
                    t.check(
                        `${kind}买入关联区同时提供录入和选择`,
                        await cdp.evaluate(`!!document.querySelector('.account-asset-actions [aria-label="录入交易物品"]') &&
                            !!document.querySelector('.account-asset-actions [aria-label="设置交易关联物品"]')`),
                    );
                    await ui.clickLabel('设置交易关联物品');
                    await ui.waitFor(`!!document.querySelector('.warehouse-content')`);
                    await ui.clickLabel('关闭仓库');
                    await ui.waitFor(`!document.querySelector('.warehouse-content')`);
                    await ui.clickLabel('录入交易物品');
                    await ui.waitFor(`!!document.querySelector('.warehouse-editor-page')`);
                    if (kind === '装备') {
                        await ui.fillSel('.gear-name-input', itemName);
                    } else {
                        await ui.fill('召唤兽名称', itemName);
                        await ui.fill('召唤兽气血', '3456');
                    }
                    await ui.clickLabel('确认交易物品资料');
                    await ui.waitFor(`!document.querySelector('.warehouse-editor-page')`);
                    t.check(
                        `${kind}核对资料返回账目草稿`,
                        await cdp.evaluate(
                            `!!document.querySelector('.account-asset-list [aria-label="查看物品属性 ${itemName}"]')`,
                        ),
                    );
                    await ui.clickLabel('记入账本');
                    await ui.waitFor(`!document.querySelector('.modal-mask')`);
                    await ui.reload();
                    await ui.gotoReady('账号');
                }
                await ui.clickText('.shortcut', `卖出${kind}`);
                await ui.fill('成交金额', '150');
                await ui.clickText('[aria-label="是否关联仓库物品"] button', '是');
                await ui.waitFor(
                    `!!document.querySelector('.account-asset') && !document.querySelector('.modal-panel-sizing')`,
                );
                t.check(
                    `${kind}手续费与关联开关同排且顺序正确`,
                    await cdp.evaluate(`(() => {
                    const [fee, asset] = document.querySelectorAll('.trade-switches > .fee-switch');
                    if (!fee || !asset) return false;
                    const a = fee.getBoundingClientRect();
                    const b = asset.getBoundingClientRect();
                    return Math.abs(a.top - b.top) <= 1 && a.right < b.left &&
                        fee.querySelector('.field-label').textContent.trim() === '手续费';
                })()`),
                );
                t.check(
                    `${kind}卖出关联区同时提供录入和选择`,
                    await cdp.evaluate(`!!document.querySelector('.account-asset-actions [aria-label="录入交易物品"]') &&
                        !!document.querySelector('.account-asset-actions [aria-label="设置交易关联物品"]')`),
                );
                await ui.clickLabel('录入交易物品');
                await ui.waitFor(`!!document.querySelector('.warehouse-editor-page')`);
                await ui.clickLabel('取消本次物品录入');
                await ui.waitFor(`!document.querySelector('.warehouse-editor-page')`);
                await ui.clickLabel('设置交易关联物品');
                await ui.waitFor(`!!document.querySelector('.warehouse-content')`);
                await narrowWarehouse(kind, name);
                await ui.waitFor(
                    `${warehouseItems(name)}.length === 2`,
                );
                t.check(
                    `${kind}仓库标题横排且装饰条独立`,
                    await cdp.evaluate(`(() => {
                    const title = document.querySelector('.warehouse-pick-heading');
                    const [mark, text] = title.children;
                    const a = mark.getBoundingClientRect();
                    const b = text.getBoundingClientRect();
                    return !mark.textContent.trim() && b.width > a.width * 4 &&
                        Math.abs(a.top + a.height / 2 - b.top - b.height / 2) <= 1 &&
                        getComputedStyle(title).whiteSpace === 'nowrap';
                })()`),
                );
                for (const itemName of names) await ui.clickLabel(`选择卖出 ${itemName}`);
                t.check(
                    `${kind}可同时勾选两件，选择窗保留到确认`,
                    await cdp.evaluate(
                        `document.querySelectorAll('.warehouse-content [aria-pressed="true"]').length === 2`,
                    ),
                );
                await ui.clickLabel('确认选择交易物品');
                await ui.waitFor(`!document.querySelector('.warehouse-content')`);
                t.check(
                    `${kind}已选区使用紧凑图标，选择按钮靠右且自适应`,
                    await cdp.evaluate(`(() => {
                    const host = document.querySelector('.account-asset');
                    const button = host.querySelector('.account-asset-choose').getBoundingClientRect();
                    const head = host.querySelector('.account-asset-head').getBoundingClientRect();
                    const tile = host.querySelector('.warehouse-gear-icon, .warehouse-pet-icon').getBoundingClientRect();
                    const cell = host.querySelector('.warehouse-item').getBoundingClientRect();
                    return host.classList.contains('board') &&
                        !!host.querySelector('.account-asset-tray.well') &&
                        !host.querySelector('.account-asset-hint') &&
                        !host.textContent.includes('点击右上角') &&
                        !host.textContent.includes('记账后移出仓库') &&
                        host.querySelectorAll('.account-asset-list .warehouse-item').length === 2 &&
                        Math.abs(tile.width - 44) <= 1 && Math.abs(tile.height - 44) <= 1 &&
                        Math.abs(cell.width - 52) <= 1 &&
                        host.querySelector('.account-asset-tray').getBoundingClientRect().height <= 133 &&
                        button.width < head.width / 2 && Math.abs(button.right - head.right) <= 1;
                })()`),
                );
                await ui.clickLabel(`查看物品属性 ${names[0]}`);
                t.check(
                    `${kind}图标悬停不向上位移`,
                    await cdp.evaluate(`(() => {
                        const item = [...document.querySelectorAll('.account-asset-list .warehouse-item')]
                            .find((one) => one.getAttribute('aria-label') === ${JSON.stringify(`查看物品属性 ${names[0]}`)});
                        const icon = item?.querySelector('.warehouse-gear-icon, .warehouse-pet-icon');
                        return icon && getComputedStyle(icon).transform === 'none';
                    })()`),
                );
                t.check(
                    `${kind}已选图标可查看属性`,
                    await ui.waitFor(
                        `!!document.querySelector('.detail-tip.on[aria-hidden="false"]')`,
                    ),
                );
                t.check(
                    `${kind}属性浮层边框等距，滚动条不挤占外框`,
                    await cdp.evaluate(`(() => {
                    const tip = document.querySelector('.detail-tip.on[aria-hidden="false"]');
                    const content = tip.querySelector(':scope > .tip-content');
                    const style = getComputedStyle(tip);
                    const rule = getComputedStyle(tip, '::before');
                    const borders = parseFloat(style.borderLeftWidth) + parseFloat(style.borderRightWidth);
                    return !!content &&
                        Math.abs(parseFloat(rule.left) - parseFloat(rule.right)) <= 1 &&
                        Math.abs(parseFloat(rule.top) - parseFloat(rule.bottom)) <= 1 &&
                        Math.abs(tip.getBoundingClientRect().width - tip.clientWidth - borders) <= 1 &&
                        tip.scrollHeight <= tip.clientHeight + 1;
                })()`),
                );
                await cdp.key('Escape');
                await ui.clickLabel('设置交易关联物品');
                await ui.waitFor(`!!document.querySelector('.warehouse-content')`);
                t.check(
                    `${kind}重开保留两件勾选`,
                    await cdp.evaluate(
                        `document.querySelectorAll('.warehouse-content [aria-pressed="true"]').length === 2`,
                    ),
                );
                await ui.clickLabel(`选择卖出 ${names[0]}`);
                await ui.clickLabel('关闭仓库');
                await ui.waitFor(`!document.querySelector('.warehouse-content')`);
                t.check(
                    `${kind}取消选择不改变账目草稿`,
                    await cdp.evaluate(
                        `document.querySelectorAll('.account-asset-list .warehouse-item').length === 2`,
                    ),
                );
                await ui.clickLabel('记入账本');
                await ui.waitFor(`!document.querySelector('.modal-mask')`);
                await ui.reload();
                await ui.gotoReady('账号');
                await ui.clickLabel('打开装备和召唤兽仓库');
                await ui.waitFor(`!!document.querySelector('.warehouse-toolbar')`);
                await ui.clickText('[aria-label="仓库分类"] button', kind);
                await narrowWarehouse(kind, name);
                t.check(
                    `${kind}全部包含两件已售出快照，状态只使用下方文字`,
                    await ui.waitFor(`${warehouseItems(name)}.length === 2 &&
                        ${warehouseItems(name)}.every((one) => {
                            const style = getComputedStyle(one);
                            const state = one.querySelector('.warehouse-item-state');
                            return one.classList.contains('warehouse-item-sold') &&
                                state?.dataset.state === 'sold' && state.textContent.trim() === '已售出' &&
                                state.classList.contains('num-tag') && state.classList.contains('num-slot') &&
                                getComputedStyle(state).fontWeight === '400' &&
                                style.backgroundColor === 'rgba(0, 0, 0, 0)' &&
                                style.borderTopColor === 'rgba(0, 0, 0, 0)';
                        })`),
                );
                await ui.clickLabel(`查看已售出 ${names[0]}`);
                t.check(
                    `${kind}全部中的售出物品同样只查看属性`,
                    await ui.waitFor(`!!document.querySelector('.detail-tip.on') &&
                        !document.querySelector('.warehouse-editor-page')`),
                );
                await cdp.key('Escape');
                await ui.clickText('[aria-label="仓库状态"] button', '未穿戴');
                t.check(
                    `${kind}已售出不会混入可交易库存`,
                    await ui.waitFor(`${warehouseItems(name)}.length === 0`),
                );
                await ui.clickText('[aria-label="仓库状态"] button', '已售出');
                t.check(
                    `${kind}已卖出分类保留两件快照且不能新增或修改`,
                    await ui.waitFor(
                        `${warehouseItems(name)}.length === 2 &&
                     !document.querySelector('[data-warehouse-add]')`,
                    ),
                );
                await ui.clickLabel(`查看已售出 ${names[0]}`);
                t.check(
                    `${kind}已卖出仅查看属性`,
                    await ui.waitFor(
                        `!!document.querySelector('.detail-tip.on') &&
                     !document.querySelector('.warehouse-editor-page')`,
                    ),
                );
                await cdp.key('Escape');
                await ui.clickLabel('关闭仓库');
                await ui.clickLabel('查看账号历史记录');
                await ui.waitFor(`!!document.querySelector('[aria-label="搜索记录"]')`);
                await ui.fill('搜索记录', name);
                t.check(
                    `${kind}两次买入和批量卖出都保留历史快照`,
                    await cdp.evaluate(
                        `document.querySelectorAll('.rec-table tbody tr').length === 3 &&
                     document.querySelectorAll('.record-assets').length === 3`,
                    ),
                );
                await ui.clickIn('.rec-table tbody tr:has(.c-num.in)', name, { label: '删这一条' });
                t.check(
                    `${kind}删除卖出前提示关联物品回仓`,
                    await ui.waitFor(
                        `document.querySelector('.confirm-note')?.textContent.includes('返回仓库') === true`,
                    ),
                );
                await ui.clickLabel('确认删除');
                await ui.waitFor(`document.querySelectorAll('.rec-table tbody tr').length === 2`);
                for (let index = 0; index < 2; index += 1) {
                    await ui.clickIn('.rec-table tbody tr', name, { label: '删这一条' });
                    await ui.clickLabel('确认删除');
                    await ui.waitFor(
                        `document.querySelectorAll('.rec-table tbody tr').length === ${1 - index}`,
                    );
                }
                await cdp.key('Escape');
                await ui.waitFor(`!document.querySelector('.modal-mask')`);
                await ui.reload();
                await ui.gotoReady('账号');
                await ui.clickLabel('打开装备和召唤兽仓库');
                await ui.waitFor(`!!document.querySelector('.warehouse-toolbar')`);
                await ui.clickText('[aria-label="仓库分类"] button', kind);
                await narrowWarehouse(kind, name);
                t.check(
                    `${kind}删除卖出后重载回仓，删除买入不再改变库存`,
                    await ui.waitFor(`${warehouseItems(name)}.length === 2`),
                );
                await ui.clickText('[aria-label="仓库状态"] button', '已售出');
                t.check(
                    `${kind}回仓后已卖出列表清空`,
                    await ui.waitFor(`${warehouseItems(name)}.length === 0`),
                );
                await ui.clickText('[aria-label="仓库状态"] button', '未穿戴');
                for (const itemName of names) {
                    await ui.clickLabel(`查看并修改 ${itemName}`);
                    await ui.waitFor(`!!document.querySelector('[aria-label="删除仓库物品"]')`);
                    await ui.waitFor(warehouseIdle);
                    await ui.clickLabel('删除仓库物品');
                    await ui.clickLabel('确认删除');
                    await ui.waitFor(`!!document.querySelector('.warehouse-toolbar')`);
                    await ui.waitFor(warehouseIdle);
                }
                t.check(
                    `${kind}回仓测试物品已清理`,
                    await ui.waitFor(`${warehouseItems(name)}.length === 0`),
                );
                await ui.clickLabel('关闭仓库');
            }
        });
    }
}
