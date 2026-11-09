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
            '新建共用带截图入口的修改窗口，名称为空不能保存',
            await cdp.evaluate(`!!document.querySelector('.editor .ocr-shot') &&
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

        /* 换部位后，详情纸片和选中图标同时更新。 */
        await ui.clickText('.gear-editor .gear-slot', '武器');
        await sleep(250);
        const heading = await cdp.evaluate(
            `document.querySelector('.editor .gear-name .field-label')?.textContent?.trim() ?? ''`,
        );
        t.check('右侧切到武器', heading === '武器', `标题是「${heading}」`);

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

        /* 版心那七行摘要（2026-11-06）：它**全从十二件装备的 detail 现算**，不另存。
         * 这一只角色只填了「武器」的装备名、没有详情的状态行，所以七行该全是淡「—」
         * ——这正是最容易写错的一处：没数据时要么整块不画，要么把「空」当成值。 */
        const brief = await cdp.evaluate(`(() => {
                const card = [...document.querySelectorAll('.roster .char')]
                    .find((c) => (c.textContent || '').includes('E2E改名后'));
                const rows = [...(card?.querySelectorAll('.gear-stage .brief-row') ?? [])];
                return rows.map((row) => ({
                    k: row.querySelector('dt')?.textContent.trim() ?? '',
                    v: row.querySelector('dd')?.textContent.trim() ?? '',
                }));
            })()`);
        t.check('版心画出七行摘要', brief.length === 7, `实际 ${brief.length} 行`);
        t.check(
            '七行是效果 / 段数 / 奇袭三组',
            brief.map((row) => row.k).join('/') === '特技/套装/宝石/灵饰/钟灵石/玉魄/奇袭',
            `实际：${brief.map((row) => row.k).join('/')}`,
        );
        t.check(
            '没录的项落成淡「—」',
            brief.every((row) => row.v === '—'),
            JSON.stringify(brief.map((row) => row.v)),
        );
    });

    /* 装备清空只影响当前这一件，十二个部位图标保留。召唤兽仍用原有左栏删除。 */
    await t.step('装备：清空当前件，十二部位保留', async () => {
        await ui.clickIn('.roster .char', 'E2E改名后', { label: '编辑这个角色' });
        if (!(await ui.waitFor(`!!document.querySelector('.editor')`, { timeout: 3000 }))) {
            throw new Error('编辑态没打开');
        }
        await ui.clickText('.ocr-tabs button', '装备');
        await sleep(300);

        /* 清空只在当前部位有内容时出现。 */
        const kills = await ui.count('.gear-editor button[aria-label^="清空"]');
        t.check('当前有内容的武器显示清空', kills === 1, `实际 ${kills} 枚`);

        await ui.clickLabelPrefix('清空武器');
        await sleep(350);

        const rows = await ui.count('.gear-editor .gear-slot');
        t.check('清空后十二部位保留', rows === 12, `实际 ${rows} 行`);
        const head = (await ui.text('.gear-editor .gear-count')).replace(/\s+/g, ' ').trim();
        t.check('清空后计数归零', head.includes('0 / 12'), head);
        t.check(
            '清空后清空按钮消失',
            (await ui.count('.gear-editor button[aria-label^="清空"]')) === 0,
            `还剩 ${await ui.count('.gear-editor button[aria-label^="清空"]')} 枚`,
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
        await ui.fillSel('.pet-block input[aria-label="召唤兽名称"]', '临时甲');
        await ui.clickLabel('新增召唤兽');
        await ui.fillSel('.pet-block input[aria-label="召唤兽名称"]', '临时乙');
        await ui.fillSel('.pet-block input[aria-label="等级"]', '22');
        await ui.clickLabel('编辑第 1 只召唤兽：临时甲');
        await ui.fillSel('.pet-block input[aria-label="等级"]', '11');
        await ui.clickLabel('编辑第 2 只召唤兽：临时乙');
        t.check(
            '切换召唤兽保留各自修改',
            await cdp.evaluate(
                `document.querySelector('.pet-block input[aria-label="等级"]').value === '22' &&
                document.querySelectorAll('.pet-choice')[0].textContent.includes('11')`,
            ),
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
                document.querySelector('.pet-block textarea[aria-label="已学技能，顿号或逗号分隔"]').value === '吸血、必杀、偷袭、夜战'
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
        // 技能是 textarea + `@change`（失焦才解析），所以下面那一记点击同时起「失焦」作用。
        await ui.fillSel(
            '.pet-block textarea[aria-label="已学技能，顿号或逗号分隔"]',
            '连击、必杀',
        );

        await ui.clickText('.ocr-tabs button', '属性', { exact: true });
        await ui.clickText('.ocr-tabs button', '召唤兽', { exact: true });
        t.check(
            '切页后姓名、成长和技能草稿仍在',
            await cdp.evaluate(
                `document.querySelector('.pet-block input[aria-label="召唤兽名称"]').value === 'E2E兽' &&
                document.querySelector('.pet-block input[aria-label="成长"]').value === '1.254' &&
                document.querySelector('.pet-block textarea[aria-label="已学技能，顿号或逗号分隔"]').value === '连击、必杀'`,
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

        const stats = await inCard(`card.querySelectorAll('.plate .s').length`);
        t.check('一块牌展示全部七项战斗属性', stats === 7, `实际 ${stats} 格`);

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
        const slots = await ui.count('[role="dialog"] .slot');
        t.check('详情窗只有技能格，不再画内丹格', slots === 12, `实际 ${slots} 格`);

        const filled = await ui.count('[role="dialog"] .slot:not(.off)');
        t.check('其中 2 格是学了的技能', filled === 2, `实际 ${filled} 格`);

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

        // Esc 只关这一层（`use-modal` 的冒泡口径），卡片本身不动。
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
