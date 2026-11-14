/* ============================ 1. 导航 ============================ */
import { importLoaded } from '../cdp.mjs';

export default async function run(ctx) {
    const { cdp, ui, t, want, sleep, charsInDb } = ctx;

    const NAV = [
        ['总览', '#/overview', 'page'],
        ['收益', '#/income', 'page'],
        ['账号', '#/accounts', 'page'],
        ['角色', '#/characters', 'page'],
        ['物价', '#/prices', 'page'],
        ['目标', '#/goals', 'page'],
        ['工具', '#/tools', 'page'],
        ['设置', '#/settings', 'page'],
    ];

    if (want('导航')) {
        t.section('1 导航与首页 · 左栏八项 + 今日工作台');
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

        const shortcutPreference = await cdp.evaluate("localStorage.getItem('mh-home-shortcuts')");
        try {
            // 入口允许用户隐藏和排序；仅此节临时使用默认配置，结束后恢复本机偏好。
            await cdp.evaluate("localStorage.removeItem('mh-home-shortcuts')");
            await ui.reload();
            await t.step('今日工作台：今日概览、功能入口、养成目标和我的队伍', async () => {
                await ui.gotoReady('总览');
                const shape = await cdp.evaluate(`(() => ({
                hero: !!document.querySelector('.day-hero'),
                stats: document.querySelectorAll('.day-stats > div').length,
                chars: document.querySelectorAll('.team-person').length,
                names: [...document.querySelectorAll('.team-name')].map(el => el.getAttribute('href')),
                teamCards: [...document.querySelectorAll('.team-person')].every(el =>
                    !!el.querySelector('.team-level') &&
                    [...el.querySelectorAll('.team-record h3')].map(title => title.textContent.trim()).join(',') === '最近上线,最近收益,账号收支' &&
                    !el.querySelector('.team-actions, .team-facts, .role-avatar')),
                teamScroll: (() => {
                    const strip = document.querySelector('.team-strip');
                    if (!strip) return true;
                    const cards = [...strip.querySelectorAll('.team-person')];
                    const page = document.querySelector('.overview');
                    return page.scrollWidth <= page.clientWidth + 1 &&
                        getComputedStyle(strip).overflowX === 'auto' &&
                        cards.every(card => {
                            const body = card.querySelector('.team-records');
                            return Math.abs(card.getBoundingClientRect().top - cards[0].getBoundingClientRect().top) < 1 &&
                                Math.abs(card.getBoundingClientRect().height - 300 * Number(getComputedStyle(card).getPropertyValue('--fs-scale'))) < 1 &&
                                getComputedStyle(body).overflowY === 'auto' &&
                                body.scrollHeight <= body.clientHeight + 1 &&
                                [...card.querySelectorAll('.record-label')].every(label => getComputedStyle(label).whiteSpace === 'nowrap');
                        });
                })(),
                shortcuts: [...document.querySelectorAll('.workbench-shortcut')].map(el => ({ name: el.querySelector('.shortcut-name')?.textContent.trim(), id: el.dataset.shortcutId })),
                quickForm: !!document.querySelector('.overview form'),
                chart: document.querySelectorAll('.week-section .trend').length,
                books: [...document.querySelectorAll('.accounts-section .book')].map(el => el.dataset.currency),
                raisedCells: document.querySelectorAll('.book-values .book-cell.press-tile.still').length,
                goals: document.querySelectorAll('.goal-list .goal-row').length,
                ticks: document.querySelectorAll('.goal-list .goal-progress.ticks').length,
                goalTitle: document.querySelector('.goals-section .section-head h2')?.textContent.trim(),
                tickStyles: [...document.querySelectorAll('.goal-list .goal-progress.ticks')].every(el => {
                    const style = getComputedStyle(el);
                    return el.querySelectorAll('.tick').length === 10 &&
                        style.getPropertyValue('--progress-color').trim() === style.getPropertyValue('--ochre').trim() &&
                        [...el.querySelectorAll('.tick i')].every(fill => getComputedStyle(fill).backgroundImage !== 'none');
                }),
                links: [...document.querySelectorAll('.goal-row')].every(el => el.getAttribute('href')?.includes('action=update')),
            }))()`);
                t.check('B 方案顶部显示四项今日概览', shape.hero && shape.stats === 4);
                t.check('队伍卡仅保留身份与三类最近记录，采用 B 分区浅槽', shape.teamCards);
                t.check('队伍单排横滚、卡高固定、记录单行且默认完整展示', shape.teamScroll);
                t.check(
                    '我的队伍与角色名册一致，每个档案可定位',
                    shape.chars === charsInDb &&
                        shape.names.every((href) => href.includes('character=')),
                );
                t.check(
                    '移除首页记账表单，改为八项功能按钮',
                    !shape.quickForm && shape.shortcuts.length === 8,
                );
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
                t.check('最近收益复用公共柱图', shape.chart === 1);
                t.check(
                    '本月收支保留双币种和六格立体读数',
                    shape.books.join(',') === 'rmb,cash' && shape.raisedCells === 6,
                );
                t.check(
                    '最多三项目标并直达更新',
                    shape.goals <= 3 && shape.goals === shape.ticks && shape.links,
                );
                t.check(
                    '目标标题及十格立体刻度与目标页一致',
                    shape.goalTitle === '目标' && shape.tickStyles,
                );
            });

            await t.step('常用功能自定义：取消不生效，保存顺序后重载保留', async () => {
                const ids = () =>
                    cdp.evaluate(
                        "[...document.querySelectorAll('.workbench-shortcut')].map(el => el.dataset.shortcutId)",
                    );
                const original = await ids();
                await ui.clickLabel('自定义常用功能');
                await ui.clickLabel('移除：记一笔');
                await ui.clickLabel('添加：新增闹钟');
                await ui.clickLabel('上移：新增闹钟');
                const draft = await cdp.evaluate(
                    "[...document.querySelectorAll('.selected-list > li')].map(el => el.dataset.shortcutId)",
                );
                await ui.clickLabel('取消自定义常用功能');
                t.check('取消保留原入口', JSON.stringify(await ids()) === JSON.stringify(original));
                await ui.clickLabel('自定义常用功能');
                await ui.clickLabel('移除：记一笔');
                await ui.clickLabel('添加：新增闹钟');
                await ui.clickLabel('上移：新增闹钟');
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
                    await ui.dismiss();
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
