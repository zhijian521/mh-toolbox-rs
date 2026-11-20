/* ============================ 1. 导航 ============================ */
import { importLoaded } from '../cdp.mjs';

export default async function run(ctx) {
    const { cdp, ui, t, want, sleep, charsInDb } = ctx;

    const NAV = [
        ['总览', '#/overview'],
        ['收益', '#/income'],
        ['账号', '#/accounts'],
        ['角色', '#/characters'],
        ['物价', '#/prices'],
        ['目标', '#/goals'],
        ['工具', '#/tools'],
        ['设置', '#/settings'],
    ];

    if (want('导航')) {
        t.section('1 导航与首页 · 左栏八项 + 工作台');
        for (const [label, expected] of NAV) {
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
                if (state.body.includes('这一页还没开始')) throw new Error('正式导航出现占位页');
                if (
                    !(await cdp.evaluate(
                        `document.querySelector('main.app')?.getAttribute('aria-busy') === 'false' && !document.querySelector('.app-startup')`,
                    ))
                )
                    throw new Error(`「${label}」仍停留在数据加载状态`);
                t.pass(`进入「${label}」`, `${state.href} · ${state.body.length} 字`);
            });
        }

        await t.step('总览每一错误来源都有可达的恢复入口', async () => {
            await ui.gotoReady('总览');
            await cdp.evaluate(`(async () => {
                const { useRoster } = await ${importLoaded('/src/views/characters/roster.ts')};
                const { useIncome } = await ${importLoaded('/src/views/income/income-store.ts')};
                const { useAccounts } = await ${importLoaded('/src/views/accounts/accounts-store.ts')};
                const { useGoals } = await ${importLoaded('/src/views/goals/goals-store.ts')};
                const { useOnline } = await ${importLoaded('/src/views/income/online-store.ts')};
                const refs = [useRoster(), useIncome(), useAccounts(), useGoals(), useOnline()]
                    .map(source => source.loadError);
                const before = refs.map(one => one.value);
                window.__restoreOverviewErrors = () => refs.forEach((one, i) => one.value = before[i]);
                refs.forEach(one => one.value = 'E2E来源读取失败');
            })()`);
            try {
                for (const [source, page, hash] of [
                    ['角色', '角色', '#/characters'], ['收益', '收益', '#/income'],
                    ['账号', '账号', '#/accounts'], ['目标', '目标', '#/goals'],
                    ['上线', '收益', '#/income'], ['自动记账', '收益', '#/income'],
                ]) {
                    const label = `前往${page}页面处理${source}错误`;
                    await ui.clickLabel(label);
                    t.check(`${source}错误前往对应恢复页面`, await cdp.waitFor(
                        `location.hash === ${JSON.stringify(hash)}`,
                    ));
                    await ui.gotoReady('总览');
                }
            } finally {
                await cdp.evaluate(`(() => {
                    window.__restoreOverviewErrors?.();
                    delete window.__restoreOverviewErrors;
                })()`);
            }
            t.check('恢复后来源提示消失', await cdp.waitFor(
                `!document.querySelector('.source-error')`,
            ));
            t.check('工作台按实际内容宽度收列', await cdp.evaluate(`(async () => {
                const root = document.querySelector('.overview');
                const before = root.style.width;
                try {
                    root.style.width = '480px';
                    await new Promise(resolve => requestAnimationFrame(resolve));
                    const single = selector => getComputedStyle(root.querySelector(selector))
                        .gridTemplateColumns.split(' ').length === 1;
                    return getComputedStyle(root).containerName === 'overview' &&
                        single('.day-hero') && single('.day-grid') && single('.workbench-readouts');
                } finally {
                    root.style.width = before;
                }
            })()`));
        });

        const shortcutPreference = await cdp.evaluate("localStorage.getItem('mh-home-shortcuts')");
        try {
            // 入口允许用户隐藏和排序；仅此节临时使用默认配置，结束后恢复本机偏好。
            await cdp.evaluate("localStorage.removeItem('mh-home-shortcuts')");
            await ui.reload();
            await t.step(
                '工作台：周月概览、功能入口、养成目标、我的队伍和收益趋势',
                async () => {
                    await ui.gotoReady('总览');
                    const shape = await cdp.evaluate(`(() => ({
                hero: !!document.querySelector('.day-hero'),
                heroTitle: document.querySelector('.day-intro h2')?.textContent.trim(),
                overviewActions: !document.querySelector('[aria-label="查看收益历史"]') &&
                    !document.querySelector('.goals-section [aria-label="查看全部目标"]') &&
                    !document.querySelector('.team-section [aria-label="管理全部角色"]') &&
                    !document.querySelector('.team-section [aria-label="新建角色"]'),
                customizeTextButton: !!document.querySelector('.shortcuts-section .text-btn[aria-label="自定义常用功能"]'),
                solidBoards: [...document.querySelectorAll('.overview .board')].every(el =>
                    getComputedStyle(el).backgroundImage === 'none' &&
                    getComputedStyle(el).boxShadow !== 'none'),
                stats: document.querySelectorAll('.workbench-today .stat').length,
                cashflow: document.querySelectorAll('.workbench-accounts .stat').length,
                foldedReadouts: (() => {
                    const container = document.querySelector('.workbench-readouts');
                    const tickets = [...(container?.querySelectorAll(':scope > .stats-embedded') ?? [])];
                    return container && container.getBoundingClientRect().width <= 617 &&
                        getComputedStyle(container).boxShadow === 'none' &&
                        tickets.length === 2 && tickets.every(el => {
                            const head = el.querySelector('.stats-head');
                            return head && !el.querySelector('.board') &&
                                el.getBoundingClientRect().width <= 301 &&
                                !!head.querySelector('.stats-heading-icon[aria-hidden=true]') &&
                                !el.querySelector('.stats-watermark') &&
                                head.querySelectorAll('.app-icon').length === 1 &&
                                getComputedStyle(el).borderTopWidth === '0px' &&
                                el.classList.contains('folded-card') && el.dataset.spine === 'right' &&
                                !!el.querySelector('.folded-spine[aria-hidden=true]') &&
                                Math.abs(Number.parseFloat(getComputedStyle(el).paddingRight) -
                                    Number.parseFloat(getComputedStyle(el).paddingLeft) - 14) < 0.1 &&
                                getComputedStyle(el).filter === 'none' &&
                                getComputedStyle(head).borderBottomStyle === 'dashed' &&
                                getComputedStyle(el, '::before').maskImage === 'none' &&
                                getComputedStyle(el, '::after').content !== 'none' &&
                                getComputedStyle(el, '::after').boxShadow === 'none';
                        });
                })(),
                foldedDirections: (() => {
                    const original = document.querySelector('.workbench-today.folded-card');
                    if (!original) return false;
                    const left = original.cloneNode(true);
                    left.dataset.spine = 'left';
                    Object.assign(left.style, {
                        position: 'fixed', left: '-10000px', top: '0', visibility: 'hidden',
                        width: original.getBoundingClientRect().width + 'px',
                    });
                    original.parentElement.append(left);
                    try {
                        const rightStyle = getComputedStyle(original);
                        const leftStyle = getComputedStyle(left);
                        const paper = getComputedStyle(left, '::before');
                        const leftRect = left.getBoundingClientRect();
                        const leftSpine = left.querySelector('.folded-spine').getBoundingClientRect();
                        const rightRect = original.getBoundingClientRect();
                        const rightSpine = original.querySelector('.folded-spine').getBoundingClientRect();
                        return Math.abs(leftSpine.left - leftRect.left) < 0.1 &&
                            Math.abs(rightSpine.right - rightRect.right) < 0.1 &&
                            leftStyle.paddingLeft === rightStyle.paddingRight &&
                            leftStyle.paddingRight === rightStyle.paddingLeft &&
                            paper.left === '14px' && paper.right === '0px' &&
                            leftStyle.transform === 'none' &&
                            getComputedStyle(left.querySelector('.stats-head')).transform === 'none' &&
                            left.textContent === original.textContent;
                    } finally {
                        left.remove();
                    }
                })(),
                ticketCorners: (() => {
                    const radius = Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--r-ticket'));
                    const surfaces = [...document.querySelectorAll('.overview .ticket-card, .overview .folded-card')]
                        .map(el => getComputedStyle(el));
                    return radius > 0 && surfaces.length >= 2 && surfaces.every(style =>
                        ['borderTopLeftRadius', 'borderTopRightRadius', 'borderBottomLeftRadius', 'borderBottomRightRadius']
                            .every(corner => Math.abs(Number.parseFloat(style[corner]) - radius) < 0.1));
                })(),
                teamFoldedCards: (() => {
                    const cards = [...document.querySelectorAll('.team-person')];
                    const reference = document.querySelector('.workbench-today.folded-card');
                    if (!reference) return false;
                    const paper = getComputedStyle(reference, '::before');
                    const edge = getComputedStyle(reference, '::after');
                    const spine = getComputedStyle(reference.querySelector('.folded-spine'));
                    const rule = getComputedStyle(reference.querySelector('.stats-head'), '::after');
                    return cards.every(card => {
                        const face = getComputedStyle(card, '::before');
                        const bottom = getComputedStyle(card, '::after');
                        const fold = card.querySelector('.folded-spine[aria-hidden=true]');
                        if (!fold) return false;
                        return card.classList.contains('folded-card') && card.dataset.spine === 'left' &&
                            getComputedStyle(card).filter === 'none' &&
                            face.backgroundColor === paper.backgroundColor &&
                            face.backgroundImage === paper.backgroundImage &&
                            face.boxShadow === paper.boxShadow && face.maskImage === 'none' &&
                            face.boxShadow.includes('inset') &&
                            bottom.backgroundColor === edge.backgroundColor &&
                            bottom.backgroundImage === edge.backgroundImage &&
                            bottom.maskImage === 'none' &&
                            bottom.top === '1px' && bottom.left === '14px' && bottom.right === '0px' &&
                            bottom.bottom === '-2px' && bottom.boxShadow === 'none' &&
                            getComputedStyle(fold).backgroundImage === spine.backgroundImage &&
                            getComputedStyle(fold).boxShadow === spine.boxShadow &&
                            ['.team-identity', '.team-slip-footer'].every(selector =>
                                getComputedStyle(card.querySelector(selector), '::after').maskImage === rule.maskImage) &&
                            ['.team-identity', '.team-records', '.team-slip-footer'].every(selector =>
                                card.querySelector(selector).getBoundingClientRect().left >=
                                    fold.getBoundingClientRect().right + 15);
                    });
                })(),
                pairedCards: (() => {
                    const shortcuts = document.querySelector('.shortcuts-section')?.getBoundingClientRect();
                    const goals = document.querySelector('.goals-section')?.getBoundingClientRect();
                    return shortcuts && goals && (Math.abs(shortcuts.top - goals.top) > 1 ||
                        Math.abs(shortcuts.bottom - goals.bottom) < 1);
                })(),
                weekTitle: document.querySelector('.workbench-today h3')?.textContent.trim(),
                monthTitle: document.querySelector('.workbench-accounts h3')?.textContent.trim(),
                periodControls: document.querySelectorAll('.workbench-accounts [role=radio]').length,
                pairedReadouts: (() => {
                    const today = document.querySelector('.workbench-today')?.getBoundingClientRect();
                    const accounts = document.querySelector('.workbench-accounts')?.getBoundingClientRect();
                    return today && accounts && Math.abs(today.top - accounts.top) < 1 && today.right <= accounts.left;
                })(),
                chars: document.querySelectorAll('.team-person').length,
                names: [...document.querySelectorAll('.team-name')].map(el => el.getAttribute('href')),
                teamCards: [...document.querySelectorAll('.team-person')].every(el =>
                    !!el.querySelector('.team-level') &&
                    [...el.querySelectorAll('.team-record h3')].map(title => title.textContent.trim()).join(',') === '最近上线,最近收益,账号收支' &&
                    !el.querySelector('.team-actions, .team-facts, .role-avatar')),
                teamNameFlow: [...document.querySelectorAll('.team-person')].every(card => {
                    const name = card.querySelector('.team-name');
                    const level = card.querySelector('.team-level');
                    const row = card.querySelector('.team-name-row');
                    const print = card.querySelector('.team-slip-print');
                    const school = card.querySelector('.team-school-name');
                    return name && level && school && row && print && name.parentElement === row &&
                        level.parentElement === row && school.parentElement === row &&
                        getComputedStyle(name).whiteSpace === 'normal' &&
                        getComputedStyle(level).whiteSpace === 'nowrap' &&
                        print.getBoundingClientRect().bottom <= row.getBoundingClientRect().top + 1 &&
                        row.getBoundingClientRect().bottom <= card.querySelector('.team-identity').getBoundingClientRect().bottom;
                }),
                paperTeam: (() => {
                    const strip = document.querySelector('.team-strip');
                    if (!strip) return true;
                    const section = document.querySelector('.team-section');
                    return getComputedStyle(strip).backgroundImage === 'none' &&
                        [...strip.querySelectorAll('.team-person')].every(card => {
                            const paper = getComputedStyle(card, '::before');
                            const cast = getComputedStyle(card, '::after');
                            const records = [...card.querySelectorAll('.team-record')];
                            if (!card.classList.contains('folded-card') || card.querySelector('.team-slip-clip')) return false;
                            const cardBox = card.getBoundingClientRect();
                            const stripBox = strip.getBoundingClientRect();
                            return cardBox.top - stripBox.top <= 9 &&
                                stripBox.bottom - cardBox.bottom <= 13 &&
                                section.getBoundingClientRect().bottom - cardBox.bottom <= 24 &&
                                paper.backgroundColor !== 'rgba(0, 0, 0, 0)' &&
                                cast.filter === 'none' &&
                                cast.transform === 'none' &&
                                cast.boxShadow === 'none' &&
                                records.every(record => getComputedStyle(record).boxShadow === 'none') &&
                                records.slice(1).every(record => getComputedStyle(record).borderTopStyle === 'dotted');
                        });
                })(),
                teamAligned: (() => {
                    const strip = document.querySelector('.team-strip');
                    const first = strip?.querySelector('.team-person');
                    const chart = document.querySelector('.trend-section .chart-surface');
                    return !first || (chart && Math.abs(first.getBoundingClientRect().left +
                        strip.scrollLeft - chart.getBoundingClientRect().left) < 1);
                })(),
                teamScroll: (() => {
                    const strip = document.querySelector('.team-strip');
                    if (!strip) return true;
                    const cards = [...strip.querySelectorAll('.team-person')];
                    const page = document.querySelector('.overview');
                    return page.scrollWidth <= page.clientWidth + 1 &&
                        getComputedStyle(strip).overflowX === 'auto' &&
                        getComputedStyle(strip).scrollbarWidth === 'none' &&
                        (cards.length < 2 || Math.abs(cards[1].getBoundingClientRect().left -
                            cards[0].getBoundingClientRect().right - 16) < 1) &&
                        cards.every(card => {
                            const body = card.querySelector('.team-records');
                            return Math.abs(card.getBoundingClientRect().top - cards[0].getBoundingClientRect().top) < 1 &&
                                Math.abs(card.getBoundingClientRect().height - 374 * Number(getComputedStyle(card).getPropertyValue('--fs-scale'))) < 1 &&
                                getComputedStyle(body).overflowY === 'auto' &&
                                body.scrollHeight <= body.clientHeight + 1 &&
                                [...card.querySelectorAll('.record-label')].every(label => getComputedStyle(label).whiteSpace === 'nowrap');
                        });
                })(),
                teamSizes: [...document.querySelectorAll('.team-records')].map(body => ({
                    available: body.clientHeight,
                    content: body.scrollHeight,
                })),
                shortcuts: [...document.querySelectorAll('.workbench-shortcut')].map(el => ({ name: el.querySelector('.shortcut-name')?.textContent.trim(), id: el.dataset.shortcutId })),
                punchedShortcuts: [...document.querySelectorAll('.workbench-shortcut')].every(el => {
                    const face = el.querySelector('.shortcut-face');
                    if (!face || el.querySelector('.shortcut-copy small')) return false;
                    const scale = Number(getComputedStyle(face).getPropertyValue('--fs-scale'));
                    const icon = face.querySelector('.shortcut-icon .app-icon');
                    const name = face.querySelector('.shortcut-name');
                    if (!icon || !name || face.getBoundingClientRect().height < 70 * scale - 1 ||
                        icon.getBoundingClientRect().width < 23 * scale - 1 ||
                        Number.parseFloat(getComputedStyle(name).fontSize) < 13.5 * scale - 0.1) return false;
                    const binding = face.querySelector('.paper-tag-binding[aria-hidden=true]');
                    const content = face.querySelector('.paper-tag-content');
                    const mask = getComputedStyle(face, '::before').maskImage;
                    return binding && content && mask !== 'none' &&
                        (mask.match(/radial-gradient/g) ?? []).length === 2 &&
                        getComputedStyle(face, '::after').maskImage === mask &&
                        getComputedStyle(face).backgroundColor === 'rgba(0, 0, 0, 0)' &&
                        getComputedStyle(face).boxShadow === 'none' &&
                        getComputedStyle(binding, '::before').content !== 'none' &&
                        getComputedStyle(binding, '::after').content !== 'none' &&
                        getComputedStyle(content, '::before').maskImage.includes('repeating-linear-gradient') &&
                        getComputedStyle(content, '::before').backgroundImage.includes('linear-gradient') &&
                        getComputedStyle(content, '::before').width === '2px' &&
                        !!face.querySelector('.shortcut-arrow') && !!el.title;
                }),
                shortcutColumns: (() => {
                    const grid = document.querySelector('.shortcut-grid');
                    if (!grid) return false;
                    const columns = getComputedStyle(grid).gridTemplateColumns.split(' ').length;
                    return columns >= 1 && columns <= 3 && grid.scrollWidth <= grid.clientWidth + 1 &&
                        [...grid.querySelectorAll('.workbench-shortcut')].every(button =>
                            button.getBoundingClientRect().width <= Number.parseFloat(getComputedStyle(button).maxWidth) + 1) &&
                        [...grid.querySelectorAll('.shortcut-name')].every(name =>
                            getComputedStyle(name).whiteSpace === 'nowrap');
                }),
                quickForm: !!document.querySelector('.overview form'),
                chart: document.querySelectorAll('.trend-section .trend').length,
                chartPigment: (() => {
                    const swatch = document.querySelector('.trend-section .swatch');
                    if (!swatch) return false;
                    const canvas = document.createElement('canvas');
                    canvas.width = canvas.height = 1;
                    const context = canvas.getContext('2d');
                    if (!context) return false;
                    context.fillStyle = getComputedStyle(swatch).backgroundColor;
                    context.fillRect(0, 0, 1, 1);
                    const alpha = context.getImageData(0, 0, 1, 1).data[3] / 255;
                    return Math.abs(alpha - 0.65) < 0.01;
                })(),
                raisedChart: (() => {
                    const section = document.querySelector('.trend-section');
                    const chart = section?.querySelector('.chart-panel');
                    const surface = chart?.querySelector('.chart-surface');
                    const legend = chart?.querySelector('.chart-legend-shelf');
                    const column = chart?.querySelector('.chart-bar-face');
                    const reference = document.querySelector('.shortcuts-section');
                    return section && chart && surface && legend && column &&
                        reference && section.classList.contains('board') &&
                        section.classList.contains('chart-section') &&
                        parseFloat(getComputedStyle(section).paddingBottom) === 8 &&
                        !!section.querySelector('.section-head h2') &&
                        !section.querySelector('.section-head .hint') &&
                        !document.querySelector('.team-section > .section-head .hint') &&
                        getComputedStyle(section).boxShadow !== 'none' &&
                        getComputedStyle(section).boxShadow === getComputedStyle(reference).boxShadow &&
                        getComputedStyle(chart).boxShadow === 'none' &&
                        getComputedStyle(surface, '::after').boxShadow.includes('inset') &&
                        Math.abs(surface.getBoundingClientRect().height - 220) < 1 &&
                        getComputedStyle(chart.querySelector('.chart-scroll')).overflowX === 'auto' &&
                        getComputedStyle(chart.querySelector('.chart-scroll')).scrollbarWidth === 'none' &&
                        section.getBoundingClientRect().bottom - legend.getBoundingClientRect().bottom <= 9 &&
                        getComputedStyle(legend).borderTopWidth === '0px' &&
                        getComputedStyle(legend).boxShadow === 'none' &&
                        Math.abs(legend.getBoundingClientRect().left - surface.getBoundingClientRect().left) < 1 &&
                        getComputedStyle(legend).paddingLeft === '0px' &&
                        parseFloat(getComputedStyle(legend).marginTop) + parseFloat(getComputedStyle(legend).paddingTop) === 12 &&
                        getComputedStyle(legend).backgroundColor === 'rgba(0, 0, 0, 0)' &&
                        getComputedStyle(legend).backgroundImage === 'none' &&
                        getComputedStyle(column).getPropertyValue('--chart-depth').trim() === '6px';
                })(),
                trendBeforeTeam: document.querySelector('.trend-section')?.nextElementSibling?.classList.contains('team-section'),
                trendTitle: document.querySelector('.overview > .trend-section .section-head h2')?.textContent.trim(),
                duplicateSections: [...document.querySelectorAll('.overview .section-head h2')]
                    .filter(el => ['最近收益', '本月收支'].includes(el.textContent.trim())).length,
                goals: document.querySelectorAll('.goal-list .goal-row').length,
                ticks: document.querySelectorAll('.goal-list .goal-progress.ticks').length,
                goalTitle: document.querySelector('.goals-section .section-head h2')?.textContent.trim(),
                tickStyles: [...document.querySelectorAll('.goal-list .goal-progress.ticks')].every(el => {
                    const style = getComputedStyle(el);
                    return el.querySelectorAll('.tick').length === 10 &&
                        el.classList.contains('progress-adaptive') &&
                        Math.round(Number.parseFloat(style.getPropertyValue('--progress-ratio'))) === Number(el.getAttribute('aria-valuenow')) &&
                        style.getPropertyValue('--progress-color').includes('color-mix') &&
                        [...el.querySelectorAll('.tick i')].every(fill => getComputedStyle(fill).backgroundImage !== 'none');
                }),
                links: [...document.querySelectorAll('.goal-row')].every(el => el.getAttribute('href')?.includes('action=update')),
            }))()`);
                    t.check('顶部显示四项近一周概览', shape.hero && shape.stats === 4);
                    t.check('总览省去历史、队伍新增和管理、目标全部按钮', shape.overviewActions);
                    t.check('常用功能自定义采用文字按钮', shape.customizeTextButton);
                    t.check('首页外层卡片使用纯色背景并保留立体阴影', shape.solidBoards);
                    t.check('趋势柱与图例的共用色保留适度透明度', shape.chartPigment);
                    t.check('周月统计采用限宽侧折纸卡，标题保留小图标并为纸脊留空', shape.foldedReadouts);
                    t.check('侧折纸卡支持左右换向，正文不镜像且两侧留白互换', shape.foldedDirections);
                    t.check('周月统计与队伍小票的四角共用同一圆角', shape.ticketCorners);
                    t.check('队伍使用左侧纸脊，与周月共用侧折材质，内容避开折边', shape.teamFoldedCards);
                    t.check('常用功能与目标并排时卡片等高', shape.pairedCards);
                    t.check(
                        '工作台并排展示近一周概览和四项双币种收支',
                        shape.heroTitle === '工作台' &&
                            shape.cashflow === 4 &&
                            shape.pairedReadouts,
                    );
                    t.check(
                        '两个区块使用固定周月标题，不再提供范围切换',
                        shape.weekTitle === '近一周' &&
                            shape.monthTitle === '近一个月' &&
                            shape.periodControls === 0,
                    );
                    t.check('队伍小票保留身份与三类最近记录', shape.teamCards);
                    t.check('队伍签头独立一行，名称、等级与门派在分隔线上方同排', shape.teamNameFlow);
                    const teamLongName = await cdp.evaluate(`(() => {
                        const card = document.querySelector('.team-person');
                        if (!card) return false;
                        const name = card.querySelector('.team-name');
                        const original = name.textContent;
                        try {
                            // 只暂改展示文字，检查自然换行与滚动边界；不修改名册或落盘。
                            name.textContent = '星河长名字角色'.repeat(4);
                            const nameBox = name.getBoundingClientRect();
                            const levelBox = card.querySelector('.team-level').getBoundingClientRect();
                            const schoolBox = card.querySelector('.team-school-name').getBoundingClientRect();
                            const identity = card.querySelector('.team-identity');
                            const body = card.querySelector('.team-records');
                            const footer = card.querySelector('.team-slip-footer');
                            const lineHeight = Number.parseFloat(getComputedStyle(name).lineHeight);
                            return nameBox.height > lineHeight * 1.5 &&
                                name.scrollWidth <= name.clientWidth + 1 &&
                                nameBox.right <= levelBox.left + 1 && levelBox.right <= schoolBox.left + 1 &&
                                levelBox.bottom <= nameBox.top + lineHeight + 1 &&
                                card.scrollWidth <= card.clientWidth + 1 &&
                                identity.getBoundingClientRect().bottom <= body.getBoundingClientRect().top + 1 &&
                                nameBox.left >= card.querySelector('.folded-spine').getBoundingClientRect().right + 15 &&
                                getComputedStyle(body).overflowY === 'auto' &&
                                body.getBoundingClientRect().bottom <= footer.getBoundingClientRect().top + 1;
                        } finally {
                            name.textContent = original;
                        }
                    })()`);
                    t.check('长名称完整换行，等级、门派避开纸脊，底部状态不被挤出', teamLongName);
                    t.check('队伍只保留清晰薄纸底边，没有模糊投影', shape.paperTeam);
                    t.check('队伍首张卡片与收益趋势绘图区左边界对齐', shape.teamAligned);
                    t.check(
                        '队伍单排紧凑横滚、卡高固定、记录单行且默认完整展示',
                        shape.teamScroll,
                        JSON.stringify(shape.teamSizes),
                    );
                    t.check(
                        '我的队伍与角色名册一致，每个档案可定位',
                        shape.chars === charsInDb &&
                            shape.names.every((href) => href.includes('character=')),
                    );
                    t.check(
                        '首页使用功能按钮，默认包含仓库入口',
                        !shape.quickForm && shape.shortcuts.some((one) => one.id === 'warehouse'),
                    );
                    t.check('常用功能使用双孔纸签、装订虚线和右侧箭头，说明保留在悬停提示', shape.punchedShortcuts);
                    t.check('常用功能按宽度排一至三列，按钮限宽且名称不换行', shape.shortcutColumns);
                    const shortcutPoint = await cdp.evaluate(`(() => {
                        const button = document.querySelector('.workbench-shortcut');
                        const face = button?.querySelector('.shortcut-face');
                        if (!button || !face) return null;
                        button.scrollIntoView({ block: 'center' });
                        const box = button.getBoundingClientRect();
                        const initial = face.getBoundingClientRect();
                        return { x: box.left + box.width / 2, y: box.top + box.height / 2,
                            left: initial.left, top: initial.top };
                    })()`);
                    if (shortcutPoint) {
                        await cdp.send('Input.dispatchMouseEvent', {
                            type: 'mouseMoved', x: shortcutPoint.x, y: shortcutPoint.y,
                        });
                        const hoveredShortcut = await cdp.evaluate(`new Promise(resolve => {
                            requestAnimationFrame(() => requestAnimationFrame(() => {
                                const face = document.querySelector('.workbench-shortcut .shortcut-face');
                                const box = face.getBoundingClientRect();
                                resolve({ left: box.left, top: box.top, transform: getComputedStyle(face).transform });
                            }));
                        })`);
                        t.check('常用功能悬停时按钮保持原位',
                            hoveredShortcut.transform === 'none' &&
                            Math.abs(hoveredShortcut.left - shortcutPoint.left) < 0.1 &&
                            Math.abs(hoveredShortcut.top - shortcutPoint.top) < 0.1);
                        await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 0, y: 0 });
                    } else t.check('常用功能悬停时按钮保持原位', false);
                    t.check(
                        '添加物价入口保留稳定标识',
                        shape.shortcuts.some(
                            (one) => one.name === '添加物价' && one.id === 'price-new',
                        ),
                    );
                    t.check(
                        '捉鬼助手、闹钟和活动日历入口就绪',
                        ['tool-ghost', 'tool-alarm', 'tool-activities'].every((id) =>
                            shape.shortcuts.some((one) => one.id === id),
                        ),
                    );
                    t.check(
                        '趋势与队伍省去副标题，趋势图例融入纸卡且不显示分隔线',
                        shape.chart === 1 && shape.trendTitle === '收益趋势' && shape.raisedChart,
                    );
                    t.check('收益趋势位于我的队伍上方', shape.trendBeforeTeam);
                    t.check('移除底部重复的最近收益和本月收支区块', shape.duplicateSections === 0);
                    t.check(
                        '最多三项目标并直达更新',
                        shape.goals <= 3 && shape.goals === shape.ticks && shape.links,
                    );
                    t.check(
                        '目标保留十格刻度，颜色随进度过渡并保留轻高光',
                        shape.goalTitle === '目标' && shape.tickStyles,
                    );
                },
            );

            await t.step('工作台固定周月统计与源记录一致', async () => {
                const result = await cdp.evaluate(`(async () => {
                        const { useAccounts } = await ${importLoaded('/src/views/accounts/accounts-store.ts')};
                        const { accountValueText } = await ${importLoaded('/src/views/accounts/account-analysis.ts')};
                        const { useIncome } = await ${importLoaded('/src/views/income/income-store.ts')};
                        const { useOnline } = await ${importLoaded('/src/views/income/online-store.ts')};
                        const { onlineTotalsOf, clockText } = await ${importLoaded('/src/views/income/online.ts')};
                        const { useMinuteNow } = await ${importLoaded('/src/composables/use-minute-now.ts')};
                        const { todayText, daysAgo, parseDay, ledgerMoneyText } = await ${importLoaded('/src/services/format.ts')};
                        const today = todayText();
                        const weekFrom = daysAgo(6, parseDay(today));
                        const weekly = document.querySelector('.workbench-today');
                        const weekNet = useIncome().entries.value
                            .filter(row => row.date >= weekFrom && row.date <= today)
                            .reduce((sum, row) => sum + (row.kind === 'expense' ? -row.amount : row.amount), 0);
                        const online = onlineTotalsOf(useOnline().sessions.value, weekFrom, today, useMinuteNow().value);
                        const weekValues = [...weekly.querySelectorAll('.stat .v')].slice(0, 3).map(el => el.textContent.trim());
                        const section = document.querySelector('.workbench-accounts');
                        const [from, to] = section.querySelector('header').title.split(' 至 ');
                        const cells = [...section.querySelectorAll('.stat')];
                        return {
                            weekRangeValid: weekly.querySelector('header').title === weekFrom + ' 至 ' + today,
                            weekValuesMatch: JSON.stringify(weekValues) === JSON.stringify([
                                ledgerMoneyText(weekNet, 'cash', { sign: 'auto' }),
                                clockText(online.minutes),
                                ledgerMoneyText(online.cost, 'cash'),
                            ]),
                            rangeValid: Boolean(from) && from < to && to === today,
                            valuesMatch: cells.length === 4 && cells.every(cell => {
                                const [currency, kind] = cell.dataset.statId.split('-');
                                const amount = useAccounts().entries.value
                                    .filter(row => row.currency === currency && row.kind === kind && (!from || row.date >= from) && row.date <= to)
                                    .reduce((sum, row) => sum + row.amount, 0);
                                return cell.querySelector('.v').textContent.trim() === accountValueText(amount, currency);
                            }),
                        };
                    })()`);
                t.check('近一周包含今日及此前六天', result.weekRangeValid);
                t.check('近一周速记、在线和点卡读数与源记录一致', result.weekValuesMatch);
                t.check('近一个月日期有效且截至今天', result.rangeValid);
                t.check('近一个月双币种收支与原始账目一致', result.valuesMatch);
            });

            await t.step('常用功能自定义：取消不生效，保存顺序后重载保留', async () => {
                const ids = () =>
                    cdp.evaluate(
                        "[...document.querySelectorAll('.workbench-shortcut')].map(el => el.dataset.shortcutId)",
                    );
                const draftIds = () => cdp.evaluate(
                    "[...document.querySelectorAll('.selected-list > li')].map(el => el.dataset.shortcutId)",
                );
                const waitForDrop = () => cdp.waitFor(
                    "!document.querySelector('.shortcut-editor [data-dnd-dragging], .shortcut-editor [data-dnd-dropping]')",
                );
                const dragFirstTileAfterSecond = async () => {
                    const before = await draftIds();
                    const points = await cdp.evaluate('(() => {' +
                        'const list = document.querySelector(".selected-list"); list.scrollTop = 0;' +
                        'const rows = list.querySelectorAll("li");' +
                        'const source = rows[0].querySelector(".shortcut-name").getBoundingClientRect();' +
                        'const target = rows[1].getBoundingClientRect();' +
                        'return { x: source.left + source.width / 2, y: source.top + source.height / 2,' +
                        'toX: target.left + target.width / 2, toY: target.top + target.height / 2 }; })()');
                    await cdp.send('Input.dispatchMouseEvent', {
                        type: 'mouseMoved', x: points.x, y: points.y,
                    });
                    await cdp.send('Input.dispatchMouseEvent', {
                        type: 'mousePressed', x: points.x, y: points.y, button: 'left', buttons: 1, clickCount: 1,
                    });
                    await cdp.send('Input.dispatchMouseEvent', {
                        type: 'mouseMoved', x: points.x + 9, y: points.y, buttons: 1,
                    });
                    await cdp.waitFor("!!document.querySelector('.shortcut-editor [data-dnd-dragging]')");
                    t.check('dnd-kit 拿起条目后保留原位占位',
                        await ui.exists('.selected-list [data-dnd-placeholder]'));
                    for (let step = 1; step <= 6; step++) {
                        await cdp.send('Input.dispatchMouseEvent', {
                            type: 'mouseMoved', buttons: 1,
                            x: points.x + (points.toX - points.x) * step / 6,
                            y: points.y + (points.toY - points.y) * step / 6,
                        });
                        await sleep(60);
                    }
                    await cdp.waitFor('document.querySelector(".selected-list > li").dataset.shortcutId === ' + JSON.stringify(before[1]));
                    await cdp.send('Input.dispatchMouseEvent', {
                        type: 'mouseReleased', x: points.toX, y: points.toY, button: 'left', buttons: 0, clickCount: 1,
                    });
                    await waitForDrop();
                    const after = await draftIds();
                    t.check('拖动卡片正文可排序，其他项相对顺序不变',
                        JSON.stringify(after) === JSON.stringify([before[1], before[0], ...before.slice(2)]));
                    return after;
                };
                const cancelKeyboardSort = async () => {
                    const before = await draftIds();
                    const direction = await cdp.evaluate('(() => {' +
                        'const rows = document.querySelectorAll(".selected-list > li");' +
                        'rows[0].scrollIntoView({block:"nearest"}); rows[0].focus();' +
                        'return Math.abs(rows[0].getBoundingClientRect().top - rows[1].getBoundingClientRect().top) < 5 ? "ArrowRight" : "ArrowDown"; })()');
                    await cdp.key('Enter');
                    await cdp.waitFor("!!document.querySelector('.shortcut-editor [data-dnd-dragging]')");
                    await cdp.key(direction);
                    await cdp.key('Escape');
                    await waitForDrop();
                    t.check('拖动时 Esc 只取消排序，保留弹窗和原顺序',
                        await ui.exists('.shortcut-editor') && JSON.stringify(await draftIds()) === JSON.stringify(before));
                };
                const original = await ids();
                await ui.clickLabel('自定义常用功能');
                t.check('功能目录分组展示，已添加项保持明确状态', await cdp.evaluate(`(() => {
                    const added = [...document.querySelectorAll('.catalog-item.is-added')];
                    return !!document.querySelector('.catalog-group .catalog-items') &&
                        added.length === document.querySelectorAll('.selected-list > li').length &&
                        added.every(button => button.disabled && !!button.querySelector('.catalog-state'));
                })()`));
                t.check('排序草稿与首页沿用相同双孔纸签', await cdp.evaluate(`(() => {
                    const reference = document.querySelector('.workbench-shortcut .shortcut-face');
                    const drafts = [...document.querySelectorAll('.selected-list .shortcut-face')];
                    return reference && drafts.length > 0 && drafts.every(face =>
                        !!face.querySelector('.paper-tag-binding[aria-hidden=true]') &&
                        getComputedStyle(face, '::before').maskImage === getComputedStyle(reference, '::before').maskImage &&
                        getComputedStyle(face.querySelector('.shortcut-name')).fontSize ===
                            getComputedStyle(reference.querySelector('.shortcut-name')).fontSize);
                })()`));
                const expandedWidth = await cdp.evaluate("document.querySelector('.selected-pane').getBoundingClientRect().width");
                await cdp.click('.catalog-toggle');
                t.check('收起功能库后编排区铺开', await cdp.evaluate('(() => {' +
                    'return getComputedStyle(document.querySelector(".catalog-pane")).display === "none" &&' +
                    'document.querySelector(".catalog-toggle").getAttribute("aria-expanded") === "false" &&' +
                    'document.querySelector(".selected-pane").getBoundingClientRect().width >= ' + expandedWidth + '; })()'));
                await cdp.click('.catalog-toggle');
                t.check('功能库可重新展开', await cdp.evaluate("document.querySelector('.catalog-toggle').getAttribute('aria-expanded') === 'true'"));
                await cancelKeyboardSort();
                await ui.clickLabel('移除：记一笔');
                await ui.clickLabel('添加：新增闹钟');
                const draft = await dragFirstTileAfterSecond();
                await ui.clickLabel('取消自定义常用功能');
                t.check('取消保留原入口', JSON.stringify(await ids()) === JSON.stringify(original));
                await ui.clickLabel('自定义常用功能');
                await ui.clickLabel('移除：记一笔');
                await ui.clickLabel('添加：新增闹钟');
                await dragFirstTileAfterSecond();
                await ui.clickLabel('保存常用功能');
                await ui.reload();
                await ui.gotoReady('总览');
                t.check(
                    '保存后入口与排序跨重载保留',
                    JSON.stringify(await ids()) === JSON.stringify(draft),
                );
                await ui.clickLabelPrefix('新增闹钟：');
                const alarmLimit = await cdp.evaluate(`(async () => {
                    const { useAlarms } = await ${importLoaded('/src/views/tools/alarm-store.ts')};
                    const { MAX_ALARMS } = await ${importLoaded('/src/views/tools/alarms.ts')};
                    return useAlarms().alarms.value.length >= MAX_ALARMS;
                })()`);
                await cdp.waitFor(
                    alarmLimit
                        ? "!!document.querySelector('.notice.is-error')"
                        : "!!document.querySelector('[role=dialog]')",
                );
                t.check(
                    '新增闹钟直达弹窗，上限时给出说明，并消费动作',
                    (await ui.hash()).startsWith('#/tools/alarm') &&
                        !(await ui.hash()).includes('action=') &&
                        (alarmLimit
                            ? await ui.exists('.notice.is-error')
                            : await ui.exists('[role=dialog]')),
                );
                await ui.gotoReady('总览');
                await ui.clickLabel('自定义常用功能');
                await ui.clickLabel('恢复默认常用功能');
                await ui.clickLabel('保存常用功能');
                t.check(
                    '恢复默认入口顺序',
                    JSON.stringify(await ids()) === JSON.stringify(original),
                );
            });

            await t.step('工作台上线、记一笔和仓库入口接入原有流程', async () => {
                await ui.gotoReady('总览');
                t.check('工作台只展示上线、记一笔、仓库', await cdp.evaluate(`
                    JSON.stringify([...document.querySelectorAll('.hero-actions button')]
                        .map(button => button.textContent.trim())) === JSON.stringify(['上线', '记一笔', '仓库'])
                `));
                await ui.clickLabel('记一笔账号收支');
                await cdp.waitFor("!!document.querySelector('.modal-panel .amount-row')");
                t.check('记一笔打开账号新增表单', (await ui.hash()).startsWith('#/accounts'));
                await cdp.click('.modal-panel[aria-modal=true] [data-modal-close]');
                await cdp.waitFor("!document.querySelector('.modal-panel')");
                await ui.gotoReady('总览');
                const homeHash = await ui.hash();
                await ui.clickLabel('打开工作台仓库');
                await cdp.waitFor("!!document.querySelector('.modal-panel[aria-modal=true] .warehouse-pages')");
                t.check('工作台仓库原地打开且只有一个实例', await cdp.evaluate(`
                    document.querySelectorAll('.warehouse-pages').length === 1
                `) && await ui.hash() === homeHash);
                await ui.clickLabel('关闭仓库');
                await cdp.waitFor("!document.querySelector('.modal-panel')");
                t.check('关闭后焦点回到工作台仓库', await cdp.evaluate(
                    "document.activeElement?.getAttribute('aria-label') === '打开工作台仓库'",
                ));
            });

            await t.step('首页仓库直接弹出，关闭与再次打开均保留首页', async () => {
                await ui.gotoReady('总览');
                const homeHash = await ui.hash();
                const warehouseVisible =
                    "!!document.querySelector('.modal-panel[aria-modal=true] .warehouse-pages')";
                await ui.clickLabelPrefix('仓库：');
                await cdp.waitFor(warehouseVisible);
                t.check('仓库复用完整管理弹窗且首页地址不变',
                    await ui.hash() === homeHash && await ui.exists('.warehouse-tabs'));
                await ui.clickLabel('关闭仓库');
                await cdp.waitFor("!document.querySelector('.modal-panel')");
                t.check('关闭后回到仓库快捷按钮', await cdp.evaluate(
                    "document.activeElement?.matches('.workbench-shortcut[data-shortcut-id=warehouse]')",
                ));
                await ui.clickLabelPrefix('仓库：');
                await cdp.waitFor(warehouseVisible);
                await cdp.click('.modal-panel[aria-modal=true] [data-modal-close]');
                await cdp.waitFor("!document.querySelector('.modal-panel')");
                t.check('可再次打开并用右上角关闭，仍停留首页', await ui.hash() === homeHash);
            });

            await t.step('我的队伍定位对应角色档案', async () => {
                await ui.gotoReady('总览');
                const name = await cdp.evaluate(
                    "document.querySelector('.team-name')?.getAttribute('aria-label') ?? ''",
                );
                if (!name) return;
                await ui.clickLabel(name);
                await sleep(500);
                const located = await cdp.evaluate(`(() => {
                const id = new URLSearchParams(location.hash.split('?')[1] ?? '').get('character');
                const card = document.getElementById('character-' + id);
                return !!card && card.classList.contains('is-linked') && document.activeElement === card;
            })()`);
                t.check('完整档案聚焦并突出对应角色', located);
            });

            await t.step('工具入口进入正确功能页', async () => {
                for (const [prefix, expected] of [
                    ['捉鬼助手：', '#/tools/ghost'],
                    ['闹钟：', '#/tools/alarm'],
                    ['活动日历：', '#/tools/activities'],
                ]) {
                    await ui.gotoReady('总览');
                    await ui.clickLabelPrefix(prefix);
                    await cdp.waitFor('location.hash === ' + JSON.stringify(expected));
                    t.check(prefix + '跳转正确', (await ui.hash()) === expected);
                }
            });

            await t.step('首页快捷操作打开业务弹窗，关闭后不重复打开', async () => {
                for (const prefix of ['记一笔：', '添加物价：', '补记在线：', '新增目标：']) {
                    await ui.gotoReady('总览');
                    await ui.clickLabelPrefix(prefix);
                    await cdp.waitFor("!!document.querySelector('[role=dialog]')");
                    t.check(
                        prefix + '已打开业务弹窗',
                        await cdp.evaluate("!!document.querySelector('[role=dialog]')"),
                    );
                    t.check('快捷动作参数已消费', !(await ui.hash()).includes('action='));
                    const hash = await ui.hash();
                    const closeButton = await cdp.evaluate(`(() => {
                        const panel = document.querySelector('.modal-panel[aria-modal="true"]');
                        const button = panel?.querySelector('.modal-head [data-modal-close]');
                        if (!panel || !button) return null;
                        const box = panel.getBoundingClientRect();
                        const close = button.getBoundingClientRect();
                        return {
                            right: box.right - close.right,
                            top: close.top - box.top,
                            width: close.width,
                            height: close.height,
                            focused: document.activeElement === button,
                        };
                    })()`);
                    t.check(
                        prefix + '关闭图标位于弹窗右上角',
                        !!closeButton &&
                            closeButton.width > 0 &&
                            closeButton.height > 0 &&
                            closeButton.right >= 0 &&
                            closeButton.right <= 24 &&
                            closeButton.top >= 0 &&
                            closeButton.top <= 20,
                    );
                    t.check(prefix + '关闭图标不抢初始焦点', closeButton?.focused === false);
                    await cdp.click('.modal-panel[aria-modal="true"] [data-modal-close]');
                    t.check(
                        prefix + '点击右上角关闭弹窗',
                        await ui.waitFor('!document.querySelector(".modal-panel")'),
                    );
                    await ui.gotoReady('总览');
                    await cdp.evaluate('location.hash = ' + JSON.stringify(hash));
                    await sleep(400);
                    t.check(
                        prefix + '再次进入不重开弹窗',
                        await cdp.evaluate("!document.querySelector('[role=dialog]')"),
                    );
                }
            });

            /* 默认落地页：`#/` 会重定向到 `DEFAULT_PATH`。2026-11-05 从设置页改成了总览，
             * 这条断言盯的就是那个改动——回退回去会立刻红。 */
            await t.step('打开应用落在总览（不是设置页）', async () => {
                await cdp.evaluate(`location.hash = '#/'`);
                await sleep(500);
                const landed = await ui.hash();
                t.check('默认页是总览', landed === '#/overview', `实际 ${landed}`);
            });
        } finally {
            await ui.dismiss();
            await cdp.evaluate(
                shortcutPreference === null
                    ? "localStorage.removeItem('mh-home-shortcuts')"
                    : "localStorage.setItem('mh-home-shortcuts', " +
                          JSON.stringify(shortcutPreference) +
                          ')',
            );
            await ui.reload();
        }
    }
}
