import { importLoaded } from '../../cdp.mjs';
import { CONFIRM_DELETE } from '../shared.mjs';
import { checkButtonTheme } from './theme.mjs';
import petSamples from '../../fixtures/pet-panel-cases.json' with { type: 'json' };

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

    await t.step('新建：点「新角色」并填字段', async () => {
        await ui.clickLabel('新建角色');
        if (!(await ui.waitFor(`!!document.querySelector('.editor')`, { timeout: 3000 }))) {
            throw new Error('编辑器没打开');
        }
        t.pass('点「新建角色」打开编辑器');
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

    await t.step('卡内滚动到边缘后，滚轮继续滚动角色页面', async () => {
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
                await ui.exists('[aria-label="重试保存未落盘的改动"]'),
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

    await t.step('慢写回执只收起原表单，不收掉后来打开的表单', async () => {
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
            await ui.clickIn('.roster .char', 'E2E改名后', { label: '编辑这个角色' });
            await cdp.evaluate('window.__e2eReleaseSave()');
            await sleep(500);
            t.check('旧写入完成后新表单仍然打开', await ui.exists('.editor'));
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
    });

    /* 装备和召唤兽都从右栏名称后删除，装备仍保留固定的十二部位。 */
    await t.step('装备：名称后删除当前件，十二部位保留', async () => {
        await ui.clickIn('.roster .char', 'E2E改名后', { label: '编辑这个角色' });
        if (!(await ui.waitFor(`!!document.querySelector('.editor')`, { timeout: 3000 }))) {
            throw new Error('编辑态没打开');
        }
        await ui.clickText('.ocr-tabs button', '装备');
        await sleep(300);

        const clearState = `(() => {
            const btn = document.querySelector('.gear-editor .gear-identity button[aria-label^="删除"]');
            if (!btn) return 'missing';
            const style = getComputedStyle(btn);
            return style.visibility + '/' + (btn.disabled ? 'off' : 'on');
        })()`;
        const headHeight = `document.querySelector('.gear-editor .gear-parts-head').getBoundingClientRect().height`;
        const heightBefore = await cdp.evaluate(headHeight);
        t.check('当前有内容的武器可删除', (await cdp.evaluate(clearState)) === 'visible/on');
        t.check(
            '删除按钮位于右栏装备名称后，左侧没有删除按钮',
            await cdp.evaluate(`document.querySelector('.gear-editor .gear-name-row button[aria-label="删除武器这件装备"]') &&
                !document.querySelector('.gear-parts-head button')`),
        );

        await ui.clickLabel('删除武器这件装备');
        await sleep(350);

        const rows = await ui.count('.gear-editor .gear-slot');
        t.check('清空后十二部位保留', rows === 12, `实际 ${rows} 行`);
        const head = (await ui.text('.gear-editor .gear-count')).replace(/\s+/g, ' ').trim();
        t.check('清空后计数归零', head.includes('0 / 12'), head);
        t.check('空部位保留删除按钮且禁用', (await cdp.evaluate(clearState)) === 'visible/off');
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
export async function pets(ctx) {
    const { cdp, ui, t, sleep } = ctx;
    await t.step('召唤兽修改跟随当前分区，多只切换、删除与取消保留正确草稿', async () => {
        await ui.clickIn('.roster .char', 'E2E改名后', { text: '召唤兽' });
        await ui.clickIn('.roster .char', 'E2E改名后', { label: '编辑这个角色' });
        await ui.waitFor(`!!document.querySelector('.editor')`);
        t.check(
            '修改直接进入召唤兽分区',
            await cdp.evaluate(
                `document.querySelector('.ocr-tabs [aria-checked="true"]')?.textContent.trim() === '召唤兽'`,
            ),
        );
        t.check(
            '没有选中召唤兽时不能靠识别新增',
            await cdp.evaluate(
                `document.querySelector('.pet-editor input[aria-label="召唤兽截图文件"]')?.disabled === true`,
            ),
        );
        await ui.clickLabel('新增召唤兽');
        t.check(
            '整体修改新增无名召唤兽时禁止保存',
            await cdp.evaluate(
                `document.querySelector('button[aria-label="保存这个角色"]').disabled`,
            ),
        );
        await ui.clickText('.ocr-tabs button', '属性', { exact: true });
        t.check(
            '切到其他分区仍说明保存被哪只未命名召唤兽阻塞',
            (await ui.text('.editor-validation')).includes('第 1 只召唤兽尚未命名'),
        );
        await ui.clickLabel('定位未填写的名称');
        t.check(
            '去填写切回召唤兽并聚焦缺名输入框',
            await cdp.evaluate(`document.querySelector('.ocr-tabs [aria-checked="true"]')
                ?.textContent.trim() === '召唤兽' &&
                document.activeElement?.matches('.pet-block input[aria-label="召唤兽名称"]')`),
        );
        await ui.fillSel('.pet-block input[aria-label="召唤兽名称"]', '   ');
        t.check(
            '空白名称也不能保存，草稿仍保留',
            await cdp.evaluate(`document.querySelector('button[aria-label="保存这个角色"]').disabled &&
                document.querySelectorAll('.pet-choice').length === 1`),
        );
        await ui.fillSel('.pet-block input[aria-label="召唤兽名称"]', '临时甲');
        t.check(
            '命名后恢复保存',
            await cdp.evaluate(
                `!document.querySelector('button[aria-label="保存这个角色"]').disabled`,
            ),
        );
        await ui.clickLabel('新增召唤兽');
        await ui.fillSel('.pet-block input[aria-label="召唤兽名称"]', '临时乙');
        await ui.fillSel('.pet-block input[aria-label="等级"]', '22');
        await ui.clickLabel('编辑第 1 只召唤兽：临时甲');
        await ui.fillSel('.pet-block input[aria-label="等级"]', '11');
        await ui.clickLabel('编辑第 2 只召唤兽：临时乙');
        /* 左栏一格只剩**头像 / 朱印 / 名字**（2026-11-10 用户：去掉等级和删除按钮），
         * 所以「另一只的等级 11」不再出现在格子里——改读格子上那只的名字，
         * 等级仍按右侧表单里当前这只的输入值判。 */
        t.check(
            '切换召唤兽保留各自修改',
            await cdp.evaluate(
                `document.querySelector('.pet-block input[aria-label="等级"]').value === '22' &&
                document.querySelectorAll('.pet-choice').length === 2 &&
                document.querySelectorAll('.pet-choice')[0].textContent.includes('临时甲')`,
            ),
        );
        /* 删除按钮挪到右侧名字输入后面，只服务**当前选中**那一只——要删第一只，
         * 先点回第一只（2026-11-10 结构改动，不再是每格各留一枚）。点回去顺带补一条：
         * 格子上不再写等级，那只的 11 只能从这里读，否则「各自修改」只验了一半。 */
        await ui.clickLabel('编辑第 1 只召唤兽：临时甲');
        await sleep(200);
        t.check(
            '切回第一只，它自己的等级仍在',
            (await cdp.evaluate(
                `document.querySelector('.pet-block input[aria-label="等级"]').value`,
            )) === '11',
        );
        await ui.clickLabel('删除第 1 只召唤兽：临时甲');
        t.check(
            '删除前项后仍选中原召唤兽',
            await cdp.evaluate(
                `document.querySelectorAll('.pet-choice').length === 1 &&
                document.querySelector('.pet-block input[aria-label="召唤兽名称"]').value === '临时乙'`,
            ),
        );
        await ui.clickText('.ocr-tabs button', '属性', { exact: true });
        await ui.clickText('.ocr-tabs button', '召唤兽', { exact: true });
        t.check(
            '切分区保留召唤兽草稿',
            await cdp.evaluate(
                `document.querySelector('.pet-block input[aria-label="等级"]').value === '22'`,
            ),
        );
        await ui.clickLabel('放弃这次修改');
        await ui.waitFor(`!document.querySelector('.editor')`);
        await ui.clickIn('.roster .char', 'E2E改名后', { label: '编辑这个角色' });
        await ui.waitFor(`!!document.querySelector('.editor')`);
        t.check('取消不写入临时召唤兽', (await ui.count('.pet-choice')) === 0);
        await cdp.key('Escape');
        await ui.waitFor(`!document.querySelector('.editor')`);
    });

    // 召唤兽：原图识别 → 手工修正 → 保存 → 卡片与详情 → 重载。
    await t.step('召唤兽：加一只 → 概览牌 → 详情窗 → Esc', async () => {
        await ui.clickIn('.roster .char', 'E2E改名后', { label: '编辑这个角色' });
        if (!(await ui.waitFor(`!!document.querySelector('.editor')`, { timeout: 3000 }))) {
            throw new Error('编辑态没打开');
        }
        await ui.clickText('.ocr-tabs button', '召唤兽');
        await sleep(300);
        await ui.clickLabel('新增召唤兽');
        await sleep(250);

        /* 编辑页 2026-11-05 改成左栏目录（方案 P3）：加一只之后左栏应有一行，
         * 而右侧只渲染**选中那一只**的表单——旧版是一只一行、一次展开一只。
         * 两条一起验，才能区分「结构换了」与「只是换了个样式」。 */
        const railItems = await ui.count('.pet-editor .pet-choice');
        t.check('编辑页左栏列出全部召唤兽', railItems === 1, `实际 ${railItems} 行`);
        t.check(
            '召唤兽目录与详情头像共用主题阴影，选中标记保持短线',
            await cdp.evaluate(`(() => {
                const choice = document.querySelector('.pet-choice[aria-pressed="true"]');
                const tile = choice?.querySelector('.press-tile');
                const portrait = document.querySelector('.pet-block .portrait-picker summary .press-tile');
                if (!tile || !portrait) return false;
                const first = getComputedStyle(tile);
                const second = getComputedStyle(portrait);
                const mark = choice.querySelector('.pet-mark').getBoundingClientRect();
                const emptyMark = document.querySelector('.pet-add .pet-mark');
                return first.boxShadow !== 'none' && first.boxShadow === second.boxShadow &&
                    Math.abs(tile.getBoundingClientRect().width - 52) < 1 &&
                    Math.abs(mark.width - 22) < 1 && Math.abs(mark.height - 2) < 1 &&
                    getComputedStyle(choice.querySelector('.pet-mark')).backgroundColor !==
                        getComputedStyle(emptyMark).backgroundColor;
            })()`),
        );
        const nameInputs = await ui.count('.pet-block input[aria-label="召唤兽名称"]');
        t.check('右侧只渲染选中那一只', nameInputs === 1, `实际 ${nameInputs} 个名字框`);

        await cdp.evaluate(`(async () => {
            const response = await fetch('/tools/e2e/fixtures/pet-panel.png');
            if (!response.ok) throw new Error('召唤兽截图样本加载失败');
            const transfer = new DataTransfer();
            transfer.items.add(new File([await response.blob()], 'pet-panel.png', { type: 'image/png' }));
            const input = document.querySelector('.pet-editor input[aria-label="召唤兽截图文件"]');
            input.files = transfer.files;
            input.dispatchEvent(new Event('change', { bubbles: true }));
        })()`);
        const recognized = await ui.waitFor(
            `document.querySelector('.pet-block input[aria-label="召唤兽攻击"]').value === '2016' && document.querySelector('.pet-screenshot')?.getAttribute('aria-busy') === 'false'`,
            { timeout: 30000 },
        );
        t.check('召唤兽原图识别完成', recognized);
        t.check(
            '成长、寿命和全部普通技能填入草稿',
            await cdp.evaluate(`
                document.querySelector('.pet-block input[aria-label="成长"]').value === '1.264' &&
                document.querySelector('.pet-block input[aria-label="寿命"]').value === '4385' &&
                [...document.querySelectorAll('.pet-block .skill-icons .skill-picker small')]
                    .map((e) => e.textContent.trim()).join('、') === '吸血、必杀、偷袭、夜战'
            `),
        );
        t.check(
            '上限、资质、加点分别填入，零潜能保留',
            await cdp.evaluate(`
            document.querySelector('.pet-block input[aria-label="召唤兽魔法"]').value === '931' &&
            document.querySelector('.pet-block input[aria-label="召唤兽力量"]').value === '763' &&
            document.querySelector('.pet-block input[aria-label="召唤兽潜能"]').value === '0' &&
            document.querySelector('.pet-block input[aria-label="攻击资质"]').value === '1616'
        `),
        );
        t.check(
            '截图识别入口没有内丹表单',
            !(await ui.exists('.pet-block textarea[aria-label="内丹名，顿号或逗号分隔"]')),
        );

        for (const sample of petSamples) {
            const result = await cdp.evaluate(
                `(async () => {
                const response = await fetch('/tools/e2e/fixtures/' + ${JSON.stringify(sample.file)});
                if (!response.ok) throw new Error('召唤兽样本加载失败');
                const bitmap = await createImageBitmap(await response.blob());
                const { imageDataOf, base64Of, swapToBgra } = await ${importLoaded('/src/views/characters/ocr/pixels.ts')};
                const image = imageDataOf(bitmap);
                bitmap.close();
                const { ocrFrame } = await ${importLoaded('/src/services/ocr.ts')};
                const outcome = await ocrFrame(base64Of(swapToBgra(image.data)), image.width, image.height);
                if (outcome.status !== 'ok') throw new Error(outcome.error);
                const { recognizePetPanel } = await ${importLoaded('/src/views/characters/ocr/pet-recognition.ts')};
                return recognizePetPanel(outcome.lines, image);
            })()`,
                { timeout: 60000 },
            );
            t.check(
                `${sample.name} 原图成长、寿命与全部技能`,
                result.patch.life === sample.expected.life &&
                    result.patch.growth === sample.expected.growth &&
                    JSON.stringify(result.patch.skills) === JSON.stringify(sample.expected.skills),
                JSON.stringify(result.patch),
            );
            if (sample.name === 'dog')
                t.check('查看第二只时不取黄色参战兽的等级', result.patch.level === 123);
        }

        /* 选择器必须带 `.pet-block`：`等级` 这个 aria-label 在编辑器里不止一处
         * （角色自己也有一格），`ui.fill()` 只取文档里第一个匹配。 */
        await ui.fillSel('.pet-block input[aria-label="召唤兽名称"]', 'E2E兽');
        await ui.fillSel('.pet-block input[aria-label="等级"]', '120');
        await ui.fillSel('.pet-block input[aria-label="参战等级"]', '145');
        await ui.fillSel('.pet-block input[aria-label="成长"]', '1.254');
        /* 技能自 2026-11-10 起是「一格一枚图标 + 末尾一枚 + 号」，没有裸文本框了：
         * 先把截图识别填进来的四招逐个清掉，再点两次 + 各选一招。清掉而不是直接改，
         * 是因为这一版没有「覆盖名单」的入口——一格只认自己那一招。 */
        for (let guard = 0; guard < 20; guard += 1) {
            if (!(await ui.exists('.pet-block .skill-picker'))) break;
            await ui.clickLabelPrefix('第 1 个技能：');
            await sleep(120);
            await ui.clickLabel('清除第 1 个技能');
            await sleep(120);
        }
        for (const name of ['连击', '必杀']) {
            /* 「+」不是添一个空格子，而是直接落进清单里第一招还没学的（用户：「点击图标
             * 添加默认技能」）——所以新那一格的标签是「第 N+1 个技能：某招」而不是「未选择」。
             * 先数已有几格定 N，再按前缀点开它，搜名字换成想要的那一招。 */
            const count = await ui.count('.pet-block .skill-picker');
            await ui.clickLabel('添加一个技能格');
            await sleep(120);
            await ui.clickLabelPrefix(`第 ${count + 1} 个技能：`);
            await ui.fillSel('.pet-block .skill-panel input[aria-label="搜索召唤兽技能"]', name);
            await ui.clickLabel(`选择技能：${name}`);
            await sleep(160);
        }
        t.check(
            '技能格点开下拉选完就落进草稿',
            (await cdp.evaluate(
                `[...document.querySelectorAll('.pet-block .skill-icons .skill-picker small')]
                    .map((e) => e.textContent.trim()).join('、')`,
            )) === '连击、必杀',
        );
        t.check(
            '选完技能焦点返回入口',
            await cdp.evaluate(`document.activeElement?.matches('.pet-block .skill-trigger')`),
        );
        for (const index of [1, 2]) {
            await ui.clickLabelPrefix(`第 ${index} 个技能：`);
            const placement = await cdp.evaluate(`(() => {
                const content = document.querySelector('.pet-block .pet-content');
                const panel = content.querySelector('.skill-panel');
                const grid = panel.querySelector('.skill-grid');
                const bounds = content.getBoundingClientRect();
                const box = panel.getBoundingClientRect();
                return {
                    inside: box.left >= bounds.left + content.clientLeft - 1 &&
                        box.right <= bounds.left + content.clientLeft + content.clientWidth + 1 &&
                        box.top >= bounds.top + content.clientTop - 1 &&
                        box.bottom <= bounds.top + content.clientTop + content.clientHeight + 1,
                    height: box.height,
                    maxHeight: parseFloat(getComputedStyle(panel).maxHeight),
                    noOverflow: !!grid && grid.scrollWidth <= grid.clientWidth + 1,
                };
            })()`);
            t.check(
                `第 ${index} 格技能浮层完整位于详情可见区且列表无横向溢出`,
                placement.inside &&
                    placement.height > 0 &&
                    placement.maxHeight > 0 &&
                    placement.noOverflow,
                JSON.stringify(placement),
            );
            await cdp.key('Escape');
            await sleep(120);
            t.check(
                `第 ${index} 格技能 Esc 只关闭选择器并恢复焦点`,
                (await ui.exists('.editor')) &&
                    !(await ui.exists('.pet-block .skill-panel')) &&
                    (await cdp.evaluate(
                        `document.activeElement?.matches('.pet-block .skill-trigger')`,
                    )),
            );
        }

        await ui.clickText('.ocr-tabs button', '属性', { exact: true });
        await ui.clickText('.ocr-tabs button', '召唤兽', { exact: true });
        t.check(
            '切页后姓名、成长和技能草稿仍在',
            await cdp.evaluate(
                `document.querySelector('.pet-block input[aria-label="召唤兽名称"]').value === 'E2E兽' &&
                document.querySelector('.pet-block input[aria-label="成长"]').value === '1.254' &&
                [...document.querySelectorAll('.pet-block .skill-icons .skill-picker small')]
                    .map((e) => e.textContent.trim()).join('、') === '连击、必杀'`,
            ),
        );

        await ui.clickLabel('保存这个角色');
        await sleep(600);
        t.check('保存后编辑器收起', !(await ui.exists('.editor')));

        /* 切页签必须**指到这张卡**：名册里并排两三张卡，每张都有自己的六个页签，
         * `ui.clickText('.char .step-opt', '召唤兽')` 会点中第一张卡的那个，
         * 而剩下的卡还停在「属性」——它的兽牌在 DOM 里但 `display:none`，
         * 于是「尺寸为 0，点不到」。（第一次跑就是这么红的。） */
        await ui.clickIn('.roster .char', 'E2E改名后', { text: '召唤兽' });
        await sleep(320);

        /* 同理，所有计数都限定在**这张卡**里：`v-show` 让隐藏页签的内容仍然在 DOM 里，
         * 文档级 `.char .plate` 会把别人的兽也算进来（实测 8 块 / 40 格）。 */
        const inCard = (expr) =>
            cdp.evaluate(`(() => {
                    const card = [...document.querySelectorAll('.roster .char')]
                        .find((c) => (c.textContent || '').includes('E2E改名后'));
                    return card ? ${expr} : null;
                })()`);

        const plates = await inCard(`card.querySelectorAll('.plate').length`);
        t.check('卡上画出兽牌', plates === 1, `实际 ${plates} 块`);

        const visible = await inCard(
            `[...card.querySelectorAll('.plate')].filter((p) => p.offsetParent !== null).length`,
        );
        t.check('兽牌在可见的页签里', visible === 1, `实际 ${visible} 块可见`);

        /* 外面那一层不是纸（2026-11-11 用户：「召唤兽列表卡片外面那一层 class="plate"
         * 这个可以去掉 不要这个样式了，直接透明展示里面的即可」）。
         * 只量外层自己的计算样式：牌里那枚头像块与八张票都还带材质，不能拿子元素冒充。 */
        const shell = await inCard(`(() => {
                const one = card.querySelector('.plate');
                if (!one) return { found: false };
                const style = getComputedStyle(one);
                return {
                    found: true,
                    background: style.backgroundColor,
                    boxShadow: style.boxShadow,
                    padding: style.paddingLeft,
                    borderRadius: style.borderRadius,
                };
            })()`);
        t.check(
            '兽牌外框透明：没有底色、没有落影、没有内边距',
            shell.found &&
                /rgba\(0, 0, 0, 0\)|transparent/.test(shell.background) &&
                (shell.boxShadow === 'none' || shell.boxShadow === '') &&
                shell.padding === '0px',
            JSON.stringify(shell),
        );

        /* 卡面固定六项、按用户定的顺序（2026-11-11：「召唤兽的展示属性 按照 气血 攻击 防御
         * 法伤 速度 成长 来展示，原本的法防不要了」）：库里仍是全套属性，只是牌上按白名单挑
         * 五项战斗属性 + 一项成长，正好两行三列。 */
        const stats = await inCard(`(() => {
                const cells = [...card.querySelectorAll('.plate .s')];
                const tops = [...new Set(cells.map((one) => Math.round(one.getBoundingClientRect().top)))];
                return {
                    count: cells.length,
                    labels: cells.map((one) => (one.querySelector('.slip-name')?.textContent || '').trim()),
                    rows: tops.length,
                };
            })()`);
        t.check(
            '兽牌固定六项：气血 / 攻击 / 防御 / 法伤 / 速度 / 成长，两行三列',
            stats.count === 6 &&
                stats.rows === 2 &&
                stats.labels.join(',') === '气血,攻击,防御,法伤,速度,成长',
            JSON.stringify(stats),
        );

        /* 头顶一行（2026-11-11 用户第四轮：「都不行都不用，把名字 和 技能的样式 同步为
         * 下面属性一样的 即可」）：名字（含等级）与技能各是一张 `.slip-row.sm`，
         * 与下面六张属性票**同一套材质**（面、棱、影、28 高、圆角、签宽），
         * 上下排在头像块右边，28 + 8 + 28 = 64 与块等高。 */
        const head = await inCard(`(() => {
                const plate = card.querySelector('.plate .beast-plate');
                const id = card.querySelector('.plate .beast-id');
                const nameRow = card.querySelector('.plate .name-row');
                const skillRow = card.querySelector('.plate .skill-line');
                const name = card.querySelector('.plate .beast-name');
                const lv = card.querySelector('.plate .beast-id .lv');
                const skills = card.querySelector('.plate .skill-icons');
                const stat = card.querySelector('.plate .stats .slip-row');
                if (!plate || !id || !nameRow || !skillRow || !name || !lv || !skills || !stat)
                    return { found: false };
                const box = (one) => one.getBoundingClientRect();
                const p = box(plate);
                const nr = box(nameRow);
                const sr = box(skillRow);
                const n = box(name);
                const l = box(lv);
                const s = box(skills);
                const style = (one) => getComputedStyle(one);
                const statStyle = style(stat);
                const firstIcon = skills.querySelector('.pet-image');
                return {
                    found: true,
                    plate: [Math.round(p.width), Math.round(p.height)],
                    rows: [Math.round(nr.height), Math.round(sr.height)],
                    /* 两张都是属性行那一档：带 slip-row 与 sm。 */
                    tickets:
                        nameRow.classList.contains('slip-row') &&
                        nameRow.classList.contains('sm') &&
                        skillRow.classList.contains('slip-row') &&
                        skillRow.classList.contains('sm'),
                    /* 材质与属性票逐项对比：面、圆角、影。 */
                    sameFace: style(nameRow).backgroundColor === statStyle.backgroundColor,
                    sameSkillFace: style(skillRow).backgroundColor === statStyle.backgroundColor,
                    sameRadius: style(nameRow).borderRadius === statStyle.borderRadius,
                    sameShadow: style(nameRow).boxShadow === statStyle.boxShadow,
                    /* 名字在左、等级签在右，同一行；等级用属性票同款签宽。 */
                    inline: Math.abs(n.top + n.height / 2 - (l.top + l.height / 2)) < 2,
                    tagW: Math.round(l.parentElement.getBoundingClientRect().width),
                    statTagW: Math.round(
                        stat.querySelector('.num-tag').getBoundingClientRect().width,
                    ),
                    /* 两张票上下排在块右边，合起来与块等高。 */
                    stacked: nr.top > p.top - 1 && sr.top > nr.bottom - 1,
                    beside: nr.left > p.right - 1,
                    totalHeight: Math.round(sr.bottom - nr.top),
                    /* 名字那张只占右半列的一半（2026-11-11 用户：「名字和等级 现在一行撑满了，
                     * 你优化下，占据一半空间即可」），技能那张仍是通栏。 */
                    idWidth: Math.round(box(id).width),
                    nameWidth: Math.round(nr.width),
                    skillWidth: Math.round(sr.width),
                    /* 技能只一排：图标 18、封顶 18 高，第二排整排裁掉。 */
                    iconSize: firstIcon ? Math.round(box(firstIcon).width) : -1,
                    skillHeight: Math.round(s.height),
                    skillLines: new Set(
                        [...skills.querySelectorAll('.pet-image')].map((one) =>
                            Math.round(box(one).top),
                        ),
                    ).size,
                };
            })()`);
        t.check(
            '兽牌头像块 64，名字占半列、技能通栏，与块等高、技能只一排',
            head.found &&
                head.plate[0] === 64 &&
                head.plate[1] === 64 &&
                head.tickets &&
                head.sameFace &&
                head.sameSkillFace &&
                head.sameRadius &&
                head.sameShadow &&
                head.rows[0] === 28 &&
                head.rows[1] === 28 &&
                head.inline &&
                head.tagW === head.statTagW &&
                head.stacked &&
                head.beside &&
                head.totalHeight === head.plate[1] &&
                Math.abs(head.nameWidth - head.idWidth / 2) <= 2 &&
                head.skillWidth === head.idWidth &&
                head.iconSize === 18 &&
                head.skillHeight <= 18 &&
                head.skillLines === 1,
            JSON.stringify(head),
        );

        const names = await inCard(
            `[...card.querySelectorAll('.plate .skill-line .pet-image')].map((one) => one.title).join('/')`,
        );
        t.check(
            '技能图标保留完整技能名称',
            names.includes('连击') && names.includes('必杀'),
            `实际：${names}`,
        );

        t.check(
            '兽牌有头像，列表不展示参战、资质和内丹',
            await inCard(
                `!!card.querySelector('.plate .portrait') && !card.querySelector('.plate .join, .plate .q-rows, .plate .pill')`,
            ),
        );

        await ui.clickIn('.roster .char', 'E2E兽', { label: '查看 E2E兽 的详情' });
        if (
            !(await ui.waitFor(`!!document.querySelector('[role="dialog"]')`, {
                timeout: 3000,
            }))
        ) {
            throw new Error('详情窗没打开');
        }
        /* 技能段改成一格一枚图标后，固定十二个虚线空格（`.slot.off`）一起撤了——
         * 那些格子点不动，读不出是「还能学几招」还是「漏识别」。现在这里只剩
         * 「学了的每一招一枚 + 末尾一枚 + 号」。 */
        const slots = await ui.count('[role="dialog"] .skill-icons .skill-picker');
        t.check('详情窗只画学了的技能，不再画内丹格', slots === 2, `实际 ${slots} 格`);
        t.check(
            '技能段末尾有一枚添加格',
            (await ui.count('[role="dialog"] .skill-icons .skill-add')) === 1,
        );

        const colHeads = await cdp.evaluate(
            `[...document.querySelectorAll('[role="dialog"] .pet-layout .group-head')]
                    .map((e) => e.textContent.trim())`,
        );
        t.check(
            '详情两列：属性与加点，资质独立成组',
            colHeads[0] === '属性' &&
                colHeads[1] === '加点' &&
                (await ui.count('[role="dialog"] [data-pet-group="quality"] .q-cell')) === 6,
            `实际：${colHeads.join(' / ')}`,
        );
        t.check(
            '点兽牌直接展示截图与可编辑详情',
            (await ui.exists('.pet-quick .pet-screenshot input[aria-label="召唤兽截图文件"]')) &&
                (await ui.exists('.pet-quick input[aria-label="召唤兽攻击"]')),
        );
        t.check(
            '属性与资质沿用角色属性的数值槽',
            await cdp.evaluate(`(() => {
            const rows = [...document.querySelectorAll('.pet-quick .pet-layout .slip-row')];
            return rows.length >= 22 && rows.every((row) => {
                const input = row.querySelector('input.field.num-slot');
                if (!input) return false;
                const scale = Number(getComputedStyle(row).getPropertyValue('--fs-scale'));
                const rect = input.getBoundingClientRect();
                const width = row.parentElement.classList.contains('pet-facts') ? 64 : 52;
                return Math.abs(rect.height - 18 * scale) < 1 &&
                    Math.abs(rect.width - width * scale) < 1;
            });
        })()`),
        );
        await ui.fillSel('.pet-quick input[aria-label="成长"]', '1.111');

        await ui.clickLabel('选择召唤兽头像');
        const portraitLabel = await cdp.evaluate(
            `document.querySelector('.pet-quick .portrait-grid button')?.getAttribute('aria-label')`,
        );
        if (!portraitLabel) throw new Error('召唤兽头像候选未加载');
        await ui.clickLabel(portraitLabel);
        t.check(
            '选中头像立即关闭浮层并将焦点返回入口',
            await cdp.evaluate(`!document.querySelector('.pet-quick .portrait-picker').open &&
                document.activeElement?.getAttribute('aria-label') === '选择召唤兽头像'`),
        );
        await ui.clickLabel('选择召唤兽头像');
        await cdp.key('Escape');
        await sleep(120);
        t.check(
            '头像选择器展开时 Esc 只关选择器并恢复焦点',
            await cdp.evaluate(`!!document.querySelector('.pet-quick') &&
                !document.querySelector('.pet-quick .portrait-picker').open &&
                document.activeElement?.getAttribute('aria-label') === '选择召唤兽头像'`),
        );

        // 第二次 Esc 从已经关闭的头像入口冒泡到详情窗。
        await cdp.key('Escape');
        await sleep(300);
        t.check('Esc 关掉详情窗', !(await ui.exists('[role="dialog"]')));
        t.check(
            '详情直接修改后取消，原记录保持不变',
            await cdp.evaluate(`(async () => {
            const { useRoster } = await ${importLoaded('/src/views/characters/roster.ts')};
            return useRoster().roster.value.find((one) => one.name === 'E2E改名后')?.pets[0]?.growth === '1.254';
        })()`),
        );
        t.check(
            '卡仍停在召唤兽页',
            (await inCard(
                `[...card.querySelectorAll('.plate')].filter((p) => p.offsetParent !== null).length`,
            )) === 1,
        );
    });

    await t.step('重载后召唤兽还在（详情走的是库里的数据）', async () => {
        await ui.reload();
        await ui.waitText('E2E改名后', { timeout: 8000 });
        await ui.clickIn('.roster .char', 'E2E改名后', { text: '召唤兽' });
        await sleep(320);
        const plates = await cdp.evaluate(
            `(() => {
                    const card = [...document.querySelectorAll('.roster .char')]
                        .find((c) => (c.textContent || '').includes('E2E改名后'));
                    if (!card) return 0;
                    return [...card.querySelectorAll('.plate')].filter((p) => p.offsetParent !== null)
                        .length;
                })()`,
        );
        t.check('重载后兽牌仍在', plates === 1, `实际 ${plates} 块可见`);
        t.check(
            '分组表单的成长与技能确实落库',
            await cdp.evaluate(`(async () => {
                const { useRoster } = await ${importLoaded('/src/views/characters/roster.ts')};
                const pet = useRoster().roster.value.find((one) => one.name === 'E2E改名后')?.pets[0];
                return pet?.growth === '1.254' && pet.skills.join('/') === '连击/必杀' &&
                    pet.attrs.find((row) => row.label === '魔法')?.value === '931' &&
                    pet.points.find((row) => row.label === '力量')?.value === '763';
            })()`),
        );
    });

    /* 快速修改：卡上点哪一项，就只改哪一项（2026-11-07）。
     *
     * 四个入口各走一遍——属性行、师门行、装备格、召唤兽牌。它们共用一个
     * 小窗与同一条写入路径（`update()`），但入口分别长在四个分区里，任何一处
     * 忘了接 `@click`，这一节都会红。
     *
     * 放在「删兽」之前：兽还在，才能验「兽牌 → 修改」。 */
}
export async function cleanup(ctx) {
    const { cdp, ui, t, sleep, baseline } = ctx;
    await t.step('召唤兽：左栏 × 真的删掉这一只', async () => {
        await ui.clickIn('.roster .char', 'E2E改名后', { label: '编辑这个角色' });
        if (!(await ui.waitFor(`!!document.querySelector('.editor')`, { timeout: 3000 }))) {
            throw new Error('编辑态没打开');
        }
        await ui.clickText('.ocr-tabs button', '召唤兽');
        await sleep(300);
        t.check(
            '删之前左栏有一只',
            (await ui.count('.pet-editor .pet-choice')) === 1,
            `实际 ${await ui.count('.pet-editor .pet-choice')} 行`,
        );

        await ui.clickLabelPrefix('删除第 1 只');
        await sleep(350);
        t.check(
            '删之后左栏空了',
            (await ui.count('.pet-editor .pet-choice')) === 0,
            `实际 ${await ui.count('.pet-editor .pet-choice')} 行`,
        );
        /* 一只都不剩时右侧不该还留着一张绑不上数据的表单——那是「删了但没删干净」。 */
        t.check('右侧回到空态', !(await ui.exists('.pet-block')));

        await ui.clickLabel('保存这个角色');
        await sleep(700);
        const plates = await cdp.evaluate(
            `(() => {
                    const card = [...document.querySelectorAll('.roster .char')]
                        .find((c) => (c.textContent || '').includes('E2E改名后'));
                    if (!card) return -1;
                    return card.querySelectorAll('.plate').length;
                })()`,
        );
        t.check('删掉的那只没有留在卡上', plates === 0, `实际 ${plates} 块兽牌`);
    });

    await t.step('Esc 只关编辑器，不穿透到别的层', async () => {
        await ui.clickLabel('新建角色');
        await sleep(350);
        await cdp.key('Escape');
        await sleep(300);
        t.check('Esc 关掉编辑器', !(await ui.exists('.editor')));
        t.check('没有残留遮罩', !(await ui.exists('.editor-mask')));
    });

    await t.step('删除：先 Esc 取消，再确认删掉', async () => {
        await ui.clickIn('.roster .char', 'E2E改名后', { label: '删除这个角色' });
        await sleep(400);
        t.check('删除前弹确认窗', await ui.exists('[role="dialog"]'));

        await cdp.key('Escape');
        await sleep(300);
        t.check('Esc 取消，角色还在', (await ui.text()).includes('E2E改名后'));

        await ui.clickIn('.roster .char', 'E2E改名后', { label: '删除这个角色' });
        /* 等弹窗**真的挂上**再点确认。这里原来是一记固定的 `sleep(350)`：单跑这一节
         * 一直绿，全量跑到这里却红过一次（「找不到含「删除」的 button」）——
         * 上一记 Esc 的退场与这一记的入场抢同一段 300ms，典型的时间差。 */
        if (
            !(await ui.waitFor(`!!document.querySelector('[role="dialog"]')`, {
                timeout: 3000,
            }))
        ) {
            throw new Error('确认窗没打开');
        }
        await ui.clickText(CONFIRM_DELETE, '删除', { exact: true });
        /* 删完等名册自己少一格，别再固定等 700：库写完 → 页面重画这一段长度不固定。 */
        await ui.waitFor(
            `document.querySelectorAll('.roster .char').length === ${baseline.chars}`,
            { timeout: 5000 },
        );
        const back = await ui.count('.roster .char');
        t.check(
            '确认后角色被删掉',
            back === baseline.chars,
            `期望 ${baseline.chars}，实际 ${back}`,
        );
    });

    await t.step('重载后确认删除也进了库', async () => {
        await ui.goto('角色');
        await ui.reload();
        t.check('重载后没有残留的 E2E 角色', !(await ui.text()).includes('E2E改名后'));
    });
}
