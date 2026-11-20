import { importLoaded } from '../../cdp.mjs';
import { CONFIRM_DELETE } from '../shared.mjs';
import { checkButtonTheme } from './theme.mjs';

export async function setup(ctx) {
    const { cdp, ui, t, sleep, baseline } = ctx;
    t.section('2 角色 · 新建 → 重载 → 编辑 → Esc → 删除');

    await t.step('清掉上次遗留的 E2E 角色', async () => {
        await ui.goto('角色');
        let purged = 0;
        for (let i = 0; i < 8; i += 1) {
            try {
                await ui.clickIn('.roster .char', 'E2E', { label: '删除这个角色' });
            } catch {
                break;
            }
            await sleep(350);
            await ui.clickText(CONFIRM_DELETE, '删除', { exact: true });
            await sleep(600);
            purged += 1;
        }
        t.info('清理结果', `清掉 ${purged} 个遗留角色`);
    });

    baseline.chars = await ui.count('.roster .char');
    t.info('名册现有角色', `${baseline.chars} 个`);

    await t.step('新建：点「新增」并填字段', async () => {
        await ui.clickLabel('新建角色');
        if (!(await ui.waitFor(`!!document.querySelector('.editor')`, { timeout: 3000 }))) {
            throw new Error('编辑器没打开');
        }
        t.pass('点「新建角色」打开编辑器');
        t.check(
            '属性修改未访问装备与召唤兽时不创建对应编辑器',
            !(await ui.exists('.editor .gear-editor, .editor .pet-editor')),
        );
        t.check(
            '未提交的角色草稿可以编辑，取消可用',
            await cdp.evaluate(
                "!document.querySelector('.editor .ocr').inert && !document.querySelector('.editor [data-modal-cancel]').disabled",
            ),
        );
        t.check(
            '新建共用带截图入口的修改窗口，名称为空不能保存',
            await cdp.evaluate(`!!document.querySelector('.editor .ocr-standard .upload-preview') &&
                document.querySelector('button[aria-label="保存这个角色"]').disabled`),
        );

        const focused = await cdp.evaluate(
            `document.activeElement?.getAttribute('aria-label') ?? document.activeElement?.tagName`,
        );
        t.check('焦点一开始就在名字格里', focused === '角色名', `实际：${focused}`);

        await ui.fill('角色名', 'E2E测试角色');
        await ui.fill('区服', '测试区 · 测服');
        const typed = await cdp.evaluate(
            `document.querySelector('input[aria-label="角色名"]').value`,
        );
        t.check('名字格收到了文字', typed === 'E2E测试角色', `实际：${typed}`);

        await ui.clickText('.ocr-tabs button', '师门');
        await sleep(300);
        const paneShown = await cdp.evaluate(`(() => {
                const pane = document.querySelector('.ocr-card .pane[aria-label="师门"]');
                return !!pane && pane.offsetParent !== null;
            })()`);
        t.check('切到「师门」分区', paneShown);

        await ui.clickLabel('保存这个角色');
        await sleep(600);
        t.check('保存后编辑器收起', !(await ui.exists('.editor')));

        const after = await ui.count('.roster .char');
        t.check('名册多出一格', after === baseline.chars + 1, `${baseline.chars} → ${after}`);
        t.check('新角色画在页面上', (await ui.text()).includes('E2E测试角色'));
    });

    await t.step('角色页入口集中，属性卡随字号完整显示', async () => {
        t.check(
            '角色页新增和仓库集中在页头，正文直接展示角色卡片',
            (await ui.exists('.page-head [aria-label="打开装备和召唤兽仓库"]')) &&
                (await ui.exists('.page-head [aria-label="新建角色"]')) &&
                !(await ui.exists('.page-filters, .char-blank')),
        );
        const layout = await cdp.evaluate(`(async () => {
            const card = [...document.querySelectorAll('.roster .char')]
                .find((el) => el.textContent.includes('E2E测试角色'));
            const body = card.querySelector('.char-body');
            const experience = body.querySelector('.exp-row');
            const tabs = [...card.querySelectorAll('[role="tab"]')];
            const style = document.documentElement.style;
            const previousScale = style.getPropertyValue('--fs-scale');
            const sizes = [];
            try {
                for (const scale of [0.92, 1, 1.1]) {
                    style.setProperty('--fs-scale', String(scale));
                    tabs[0].click();
                    await Promise.resolve();
                    const attrs = card.getBoundingClientRect();
                    const bottomGap = attrs.bottom - experience.getBoundingClientRect().bottom;
                    const overflow = body.scrollHeight - body.clientHeight;
                    const heights = [];
                    for (const tab of tabs.slice(1)) {
                        tab.click();
                        await Promise.resolve();
                        heights.push(card.getBoundingClientRect().height);
                    }
                    sizes.push({ scale, overflow, bottomGap, height: attrs.height, heights });
                }
                return sizes;
            } finally {
                tabs[0].click();
                if (previousScale) style.setProperty('--fs-scale', previousScale);
                else style.removeProperty('--fs-scale');
            }
        })()`);
        t.check(
            '三个字号档位下属性完整可见，切换各分区卡片保持等高',
            layout.every(
                ({ overflow, bottomGap, height, heights }) =>
                    overflow <= 1 &&
                    bottomGap >= 0 &&
                    bottomGap <= 24 &&
                    heights.length === 5 &&
                    heights.every((one) => Math.abs(one - height) <= 1),
            ),
            JSON.stringify(layout),
        );
    });

    await t.step('鼠标放在属性卡上时，滚轮直接滚动角色页面', async () => {
        const state = await cdp.evaluate(`(() => {
            const card = [...document.querySelectorAll('.roster .char')]
                .find((el) => el.textContent.includes('E2E测试角色'));
            const body = card.querySelector('.char-body');
            const page = card.closest('.page-content');
            const original = { page: page.scrollTop, body: body.scrollTop };
            const spacer = document.createElement('div');
            spacer.dataset.e2eScroll = '';
            spacer.style.height = '100vh';
            page.append(spacer);
            card.scrollIntoView({ block: 'start' });
            body.scrollTop = body.scrollHeight;
            const rect = body.getBoundingClientRect();
            return {
                original, pageTop: page.scrollTop,
                x: rect.left + rect.width / 2,
                y: Math.min(rect.top + 40, page.getBoundingClientRect().bottom - 10),
            };
        })()`);
        try {
            await cdp.send('Input.dispatchMouseEvent', {
                type: 'mouseWheel',
                x: state.x,
                y: state.y,
                deltaX: 0,
                deltaY: 120,
            });
            await sleep(350);
            t.check(
                '指针停在角色卡上，页面仍可继续向下滚动',
                await cdp.evaluate(
                    `document.querySelector('.page-content').scrollTop > ${state.pageTop}`,
                ),
            );
        } finally {
            await cdp.evaluate(`(() => {
                document.querySelector('[data-e2e-scroll]')?.remove();
                const page = document.querySelector('.page-content');
                page.scrollTop = ${state.original.page};
                const card = [...page.querySelectorAll('.roster .char')]
                    .find((el) => el.textContent.includes('E2E测试角色'));
                card.querySelector('.char-body').scrollTop = ${state.original.body};
            })()`);
        }
    });

    await t.step('角色卡按钮底色跟随门派和亮暗主题', async () => {
        const palettes = await cdp.evaluate(`(() => {
            const card = [...document.querySelectorAll('.roster .char')]
                .find((el) => el.textContent.includes('E2E测试角色'));
            const root = document.documentElement;
            const originalSchool = card.getAttribute('data-school');
            const originalDark = root.classList.contains('dark');
            const style = document.createElement('style');
            style.textContent = '.roster .char .press-tile { transition: none !important; }';
            document.head.append(style);
            try {
                return [false, true].map((dark) => {
                    root.classList.toggle('dark', dark);
                    return ['', '大唐官府', '龙宫'].map((school) => {
                        card.setAttribute('data-school', school);
                        return [...card.querySelectorAll('.head-actions .press-btn-tile')]
                            .map((tile) => getComputedStyle(tile).backgroundColor);
                    });
                });
            } finally {
                if (originalSchool === null) card.removeAttribute('data-school');
                else card.setAttribute('data-school', originalSchool);
                root.classList.toggle('dark', originalDark);
                style.remove();
            }
        })()`);
        t.check(
            '编辑和删除按钮同色，空门派与不同门派底色有区分',
            palettes.every(
                (schools) =>
                    schools.every((colors) => colors.length === 2 && new Set(colors).size === 1) &&
                    new Set(schools.map((colors) => colors[0])).size === 3,
            ),
            JSON.stringify(palettes),
        );
        t.check(
            '按钮底色随亮暗主题切换',
            palettes[0].every((colors, index) => colors[0] !== palettes[1][index][0]),
        );
        t.check(
            '卡头只保留修改和删除两个入口',
            await cdp.evaluate(`(() => {
                const card = [...document.querySelectorAll('.roster .char')]
                    .find((one) => one.textContent.includes('E2E测试角色'));
                return [...card.querySelectorAll('.head-actions button')]
                    .map((button) => button.getAttribute('aria-label')).join('/') ===
                    '编辑这个角色/删除这个角色';
            })()`),
        );
    });

    /* 重载：这一条是整个测试最要紧的——前面的绿都可能是内存里的绿。 */
    await t.step('重载页面后角色还在（真的落库了）', async () => {
        await ui.reload();
        const drawn = await ui.waitText('E2E测试角色', { timeout: 8000 });
        t.check('重载后角色仍在名册上', drawn);
        t.info('重载后地址', await ui.hash());
    });

    await t.step('编辑：改个名字再存', async () => {
        await ui.clickIn('.roster .char', 'E2E测试角色', { label: '编辑这个角色' });
        if (!(await ui.waitFor(`!!document.querySelector('.editor')`, { timeout: 3000 }))) {
            throw new Error('编辑态没打开');
        }
        t.pass('编辑态打开');
        await ui.clickText('.ocr-tabs button', '属性', { exact: true });
        const originalLevel = await cdp.evaluate(
            `document.querySelector('input[aria-label="角色等级"]').value`,
        );
        t.check(
            '未修改角色时禁止保存',
            await cdp.evaluate(
                `document.querySelector('button[aria-label="保存这个角色"]').disabled`,
            ),
        );
        await ui.fill('角色等级', String(Number(originalLevel) + 1));
        t.check(
            '只改等级且未失焦即可保存',
            await cdp.evaluate(
                `document.activeElement?.getAttribute('aria-label') === '角色等级' && !document.querySelector('button[aria-label="保存这个角色"]').disabled`,
            ),
        );
        await ui.fill('角色等级', originalLevel);
        t.check(
            '恢复原等级立即回到未修改状态',
            await cdp.evaluate(
                `document.querySelector('button[aria-label="保存这个角色"]').disabled`,
            ),
        );
        await ui.clickText('.ocr-tabs button', '辅助', { exact: true });
        t.check(
            '修改页辅助按钮统一为新增并保留图标',
            await cdp.evaluate(`(() => {
                const buttons = [...document.querySelectorAll('.ocr-card .assist-add')];
                return buttons.length === 2 && buttons.every((button) =>
                    button.textContent.trim() === '新增' && button.querySelector('svg'));
            })()`),
        );
        await checkButtonTheme(ctx, '.editor', 'E2E测试角色');
        await ui.clickText('.ocr-tabs button', '属性', { exact: true });
        await ui.fill('角色名', 'E2E改名后');
        await ui.clickLabel('保存这个角色');
        await sleep(600);
        t.check('改名生效', (await ui.text()).includes('E2E改名后'));
    });

    await t.step('保存失败不收表单，重试后重载仍保留改动', async () => {
        await ui.clickIn('.roster .char', 'E2E改名后', { label: '编辑这个角色' });
        await ui.fill('区服', 'E2E重试区');
        await cdp.evaluate(`(async () => {
                const { commands } = await ${importLoaded('/src/services/bindings.ts')};
                window.__e2eCharacterSave = commands.charactersSave;
                commands.charactersSave = async () => { throw new Error('E2E 模拟写盘失败'); };
            })()`);
        try {
            await ui.clickLabel('保存这个角色');
            await ui.waitFor(
                `document.querySelector('.note.error')?.textContent.includes('没写进数据库')`,
            );
            t.check('失败后编辑器仍然打开', await ui.exists('.editor'));
            t.check(
                '失败原因和重试入口可见',
                await cdp.evaluate(`document.querySelector('.editor .save-error')?.textContent.includes('没写进数据库') &&
                    document.querySelector('.editor [aria-label="保存这个角色"]')?.textContent.includes('重试保存')`),
            );
            const expected = cdp.errors.findIndex(
                (one) => one.includes('写入角色名册失败') && one.includes('E2E 模拟写盘失败'),
            );
            t.check('预期的写盘错误已被服务捕获', expected >= 0);
            if (expected >= 0) cdp.errors.splice(expected, 1);
        } finally {
            await cdp.evaluate(`(async () => {
                    const { commands } = await ${importLoaded('/src/services/bindings.ts')};
                    commands.charactersSave = window.__e2eCharacterSave;
                    delete window.__e2eCharacterSave;
                })()`);
        }
        await cdp.key('Escape');
        await ui.clickLabel('重试保存未落盘的改动');
        await ui.waitFor(`!document.querySelector('[aria-label="重试保存未落盘的改动"]')`);
        await ui.reload();
        t.check('重试保存落库且重载后区服仍在', await ui.waitText('E2E重试区'));
    });

    await t.step('慢写期间保持表单与禁用状态，写入完成才收起', async () => {
        await ui.clickIn('.roster .char', 'E2E改名后', { label: '编辑这个角色' });
        await ui.fill('区服', 'E2E慢写区');
        await cdp.evaluate(`(async () => {
            const { commands } = await ${importLoaded('/src/services/bindings.ts')};
            window.__e2eSave = commands.charactersSave;
            commands.charactersSave = (...args) => new Promise((resolve, reject) => {
                let released = false;
                window.__e2eReleaseSave = () => {
                    if (released) return;
                    released = true;
                    return window.__e2eSave(...args).then(resolve, reject);
                };
            });
        })()`);
        try {
            await ui.clickLabel('保存这个角色');
            await ui.waitFor('typeof window.__e2eReleaseSave === "function"');
            t.check('慢写未完成时原表单保留', await ui.exists('.editor'));
            await cdp.key('Escape');
            t.check(
                '慢写期间 Esc 不关闭表单，保存按钮禁用',
                await cdp.evaluate(`
                document.querySelector('.editor [aria-label="保存这个角色"]')?.disabled === true`),
            );
            await cdp.click('.modal-panel[aria-modal="true"] [data-modal-close]');
            t.check(
                '慢写期间右上角关闭图标不绕过保存保护',
                await cdp.evaluate(`!!document.querySelector('.editor') &&
                    document.querySelector('.editor [aria-label="保存这个角色"]')?.disabled === true`),
            );
            await cdp.evaluate('window.__e2eReleaseSave()');
            t.check(
                '真实写入完成后表单收起',
                await ui.waitFor(`!document.querySelector('.editor')`),
            );
        } finally {
            await cdp.evaluate(`(async () => {
                const { commands } = await ${importLoaded('/src/services/bindings.ts')};
                await window.__e2eReleaseSave?.();
                commands.charactersSave = window.__e2eSave;
                delete window.__e2eSave; delete window.__e2eReleaseSave;
            })()`);
        }
        await cdp.key('Escape');
        await ui.reload();
        t.check('慢写也确实落库，重载后仍在', await ui.waitText('E2E慢写区'));
    });

    /* ---- 装备编辑：十二个部位图标常驻（2026-11-08） ----
     * 这一节以前是空的：装备整条路径一条断言都没有。改版之后交互全换了
     * （部位图标 + 原图和详情），所以钉住三件事：十二格在不在、
     * 点一格右侧是否跟着换、填进去的名字保存后是否落到卡上。
     *
     * **只填「装备名」、不填全名**——这是最常见的一种录法，也是判据最容易写错的一处：
     * 卡上「有没有这件」认的是 `detail` 或 `caption`，任一边漏了，名字就会存着却看不见。 */
    await t.step('装备：十二部位图标，选中即编，保存后上卡', async () => {
        await ui.clickIn('.roster .char', 'E2E改名后', { label: '编辑这个角色' });
        if (!(await ui.waitFor(`!!document.querySelector('.editor')`, { timeout: 3000 }))) {
            throw new Error('编辑态没打开');
        }
        await ui.clickText('.ocr-tabs button', '装备');
        await sleep(300);

        const rails = await ui.count('.gear-editor .gear-slot');
        t.check('十二个部位图标', rails === 12, `实际 ${rails}`);

        // 空白折叠在两个空格之间可能变成一个换行，比之前先压平。
        const head = async () =>
            (await ui.text('.gear-editor .gear-count')).replace(/\s+/g, ' ').trim();
        t.check('顶端计数从 0 起', (await head()).includes('0 / 12'), await head());

        /* 换部位后，详情纸片和选中图标同时更新。
         * 按 aria-label 点：格子里不再写部位名（2026-11-10 去掉），只剩图标。 */
        await ui.clickLabel('编辑武器的装备');
        await sleep(250);
        const heading = await cdp.evaluate(
            `document.querySelector('.editor input[aria-label="武器 的装备名"]')?.placeholder ?? ''`,
        );
        t.check('右侧切到武器', heading === '武器装备名', `占位是「${heading}」`);

        await ui.fillSel('.editor input[aria-label="武器 的装备名"]', 'E2E刀');
        await sleep(200);
        t.check('填完计数变 1', (await head()).includes('1 / 12'), await head());

        await ui.clickLabel('保存这个角色');
        await sleep(700);
        t.check('保存后编辑器收起', !(await ui.exists('.editor')));

        // 卡上那格：名字要真的画出来（这一条会抓住「有 caption 无 detail」的口径漏洞）。
        await ui.clickIn('.roster .char', 'E2E改名后', { text: '装备' });
        await sleep(320);
        const names = await cdp.evaluate(`(() => {
                const card = [...document.querySelectorAll('.roster .char')]
                    .find((c) => (c.textContent || '').includes('E2E改名后'));
                return [...(card?.querySelectorAll('.gear-name') ?? [])].map((e) => e.textContent.trim());
            })()`);
        t.check(
            '卡上武器那格显示 E2E刀',
            Array.isArray(names) && names.includes('E2E刀'),
            JSON.stringify(names),
        );

        /* 版心那六行摘要（2026-11-10 从七行压到五行，同日补回「特效」）：它**全从十二
         * 件装备的 detail 现算**，不另存。这一只角色只填了「武器」的装备名、没有详情
         * 的状态行，于是特技 / 特效 / 套装该是淡「—」，而三行段数**照样六个 / 四个 /
         * 两个格全画出来、全是 0**——「没录」与「还没练」在段数这一档是同一件事，
         * 写 0 才数得出缺几件。宝石那行六个格排三列两行（用户要的「一行三个对齐」）。 */
        const brief = await cdp.evaluate(`(() => {
                const card = [...document.querySelectorAll('.roster .char')]
                    .find((c) => (c.textContent || '').includes('E2E改名后'));
                const rows = [...(card?.querySelectorAll('.gear-stage .brief-row') ?? [])];
                return rows.map((row) => ({
                    k: row.querySelector('dt')?.textContent.trim() ?? '',
                    v: row.querySelector('dd')?.textContent.trim() ?? '',
                    n: row.querySelectorAll('.brief-item').length,
                    tags: row.querySelectorAll('dd .brief-tag').length,
                    cols: row.querySelector('dd')?.style.getPropertyValue('--brief-cols') ?? '',
                    font: Number.parseFloat(getComputedStyle(
                        row.querySelector('.brief-tag') ?? row.querySelector('dd')
                    ).fontSize),
                }));
            })()`);
        t.check('版心画出六行摘要', brief.length === 6, `实际 ${brief.length} 行`);
        t.check(
            '六行是特技 / 特效 / 套装 / 宝石 / 灵饰 / 玉魄',
            brief.map((row) => row.k).join('/') === '特技/特效/套装/宝石/灵饰/玉魄',
            `实际：${brief.map((row) => row.k).join('/')}`,
        );
        t.check(
            '没录的特技 / 特效 / 套装落成淡「—」',
            brief.slice(0, 3).every((row) => row.v === '—'),
            JSON.stringify(brief.slice(0, 3).map((row) => row.v)),
        );
        t.check(
            '段数三行一件一格：六 / 四 / 二，全是 0',
            brief
                .slice(3)
                .map((row) => row.n)
                .join('/') === '6/4/2' && brief.slice(3).every((row) => !/[1-9]/.test(row.v)),
            JSON.stringify(brief.slice(3).map((row) => `${row.n}:${row.v}`)),
        );
        t.check(
            '读数三行都进等宽栅格，列数是三 / 四 / 二',
            brief[3]?.cols === '3' && brief[4]?.cols === '4' && brief[5]?.cols === '2',
            JSON.stringify(brief.slice(3).map((row) => row.cols)),
        );
        /* 段数三行每一格都包进数值签（`NumTag` 渲成 `.num-tag`），名字三行不包。 */
        t.check(
            '段数三行每格一枚数值签，效果三行不包',
            brief.slice(3).every((row) => row.tags === row.n) &&
                brief.slice(0, 3).every((row) => row.tags === 0),
            JSON.stringify(brief.map((row) => `${row.k}:${row.tags}/${row.n}`)),
        );
        t.check(
            '宝石、灵饰、玉魄读数字号统一小于效果正文',
            brief.slice(3).every((row) => row.font > 0 && row.font < brief[0].font) &&
                brief[3]?.font === brief[4]?.font &&
                brief[4]?.font === brief[5]?.font,
            JSON.stringify(brief.map((row) => ({ label: row.k, font: row.font }))),
        );
    });

    /* 卸下只解除角色归属，装备仍保留固定的十二部位。 */
    await t.step('装备：名称后卸下当前件，十二部位保留', async () => {
        await ui.clickIn('.roster .char', 'E2E改名后', { label: '编辑这个角色' });
        if (!(await ui.waitFor(`!!document.querySelector('.editor')`, { timeout: 3000 }))) {
            throw new Error('编辑态没打开');
        }
        await ui.clickText('.ocr-tabs button', '装备');
        await sleep(300);

        const clearState = `(() => {
            const btn = document.querySelector('.gear-editor .gear-identity button[aria-label^="卸下"]');
            if (!btn) return 'missing';
            const style = getComputedStyle(btn);
            return style.visibility + '/' + (btn.disabled ? 'off' : 'on');
        })()`;
        const headHeight = `document.querySelector('.gear-editor .gear-parts-head').getBoundingClientRect().height`;
        const heightBefore = await cdp.evaluate(headHeight);
        t.check('当前有内容的武器可卸下', (await cdp.evaluate(clearState)) === 'visible/on');
        t.check(
            '卸下按钮位于右栏装备名称后，左侧提供仓库选择',
            await cdp.evaluate(`document.querySelector('.gear-editor .gear-name-row button[aria-label="卸下武器这件装备"]') &&
                !!document.querySelector('.gear-parts-head button[aria-label="从仓库选择装备"]')`),
        );

        await ui.clickLabel('卸下武器这件装备');
        await sleep(350);

        const rows = await ui.count('.gear-editor .gear-slot');
        t.check('清空后十二部位保留', rows === 12, `实际 ${rows} 行`);
        const head = (await ui.text('.gear-editor .gear-count')).replace(/\s+/g, ' ').trim();
        t.check('清空后计数归零', head.includes('0 / 12'), head);
        t.check('空部位保留卸下按钮且禁用', (await cdp.evaluate(clearState)) === 'visible/off');
        t.check(
            '删除前后左栏计数高度不变',
            Math.abs((await cdp.evaluate(headHeight)) - heightBefore) < 1,
            `前 ${heightBefore} / 后 ${await cdp.evaluate(headHeight)}`,
        );

        await ui.clickLabel('保存这个角色');
        await sleep(700);
        const stillThere = await cdp.evaluate(`(() => {
                const card = [...document.querySelectorAll('.roster .char')]
                    .find((c) => (c.textContent || '').includes('E2E改名后'));
                return [...(card?.querySelectorAll('.gear-name') ?? [])]
                    .some((e) => e.textContent.includes('E2E刀'));
            })()`);
        t.check('清空落到库里：卡上不再有 E2E刀', !stillThere);
    });
}
