import { importLoaded } from '../../cdp.mjs';
import { checkButtonTheme } from './theme.mjs';

export async function quick(ctx) {
    const { cdp, ui, t, sleep } = ctx;
    await t.step('快速修改：点一行 / 一格，只改这一项', async () => {
        /* 只在这一张卡里找。名册并排两三张，文档级的 `.slip-row` 会抓到别人的行，
         * 点下去改的是另一张卡（那条坑在「召唤兽」那一节已经踩过一次）。 */
        const inCard = (expr) =>
            cdp.evaluate(`(() => {
                    const card = [...document.querySelectorAll('.roster .char')]
                        .find((c) => (c.textContent || '').includes('E2E改名后'));
                    return card ? ${expr} : null;
                })()`);

        const clickInCard = async (selector, predicate = 'true') => {
            const found = await ui.markFirst(`() => {
                    const card = [...document.querySelectorAll('.roster .char')]
                        .find((one) => one.textContent.includes('E2E改名后'));
                    return [...(card?.querySelectorAll(${JSON.stringify(selector)}) ?? [])]
                        .find((one) => ${predicate});
                }`);
            if (found) await cdp.click('[data-e2e="1"]');
            return found;
        };
        const clickRow = (label) =>
            clickInCard('.slip-row', `one.textContent.trim().startsWith(${JSON.stringify(label)})`);

        const readRow = (label) =>
            inCard(`([...card.querySelectorAll('.slip-row')]
                    .find((r) => (r.textContent || '').trim().startsWith(${JSON.stringify(label)}))
                    ?.querySelector('.lv')?.textContent.trim() ?? '')`);

        const dialogTitle = () =>
            cdp.evaluate(`document.querySelector('.modal-head h2')?.textContent.trim() ?? ''`);

        /* 填一格 + 回车提交。`NumberField` 只认 `change`（失焦），
         * 而 CDP 的 insertText 不会让格子失焦——不按这一下，保存读到的是旧值。 */
        const fillField = async (label, value) => {
            await ui.fillSel(`.modal-panel input[aria-label="${label}"]`, value);
            await cdp.key('Enter');
            await sleep(120);
        };

        const saveDialog = async () => {
            await cdp.evaluate(`(async () => {
                const { commands } = await ${importLoaded('/src/services/bindings.ts')};
                window.__e2eQuickSave = commands.charactersSave;
                commands.charactersSave = (...args) => new Promise((resolve, reject) => {
                    let released = false;
                    window.__e2eReleaseQuickSave = () => {
                        if (released) return;
                        released = true;
                        return window.__e2eQuickSave(...args).then(resolve, reject);
                    };
                });
            })()`);
            try {
                await ui.clickText('.modal-panel button', '保存');
                await ui.waitFor('typeof window.__e2eReleaseQuickSave === "function"');
                t.check(
                    '快速修改写入期间禁用保存',
                    await cdp.evaluate(`[...document.querySelectorAll('.modal-panel button')]
                        .find((button) => button.textContent.trim() === '保存')?.disabled === true`),
                );
            } finally {
                await cdp.evaluate(`(async () => {
                    const { commands } = await ${importLoaded('/src/services/bindings.ts')};
                    try {
                        await window.__e2eReleaseQuickSave?.();
                    } finally {
                        commands.charactersSave = window.__e2eQuickSave;
                        delete window.__e2eQuickSave;
                        delete window.__e2eReleaseQuickSave;
                    }
                })()`);
            }
            const closed = await ui.waitFor(`!document.querySelector('.modal-panel')`, {
                timeout: 3000,
            });
            await sleep(500);
            return closed;
        };

        // ---- ① 属性行 ----
        await ui.clickIn('.roster .char', 'E2E改名后', { text: '属性' });
        await sleep(260);
        t.check('属性行点得动', (await clickRow('气血')) === true);
        const opened = await ui.waitFor(`!!document.querySelector('.modal-panel')`, {
            timeout: 3000,
        });
        t.check('点属性行就开一个小窗', opened);
        t.check('小窗只写这一项', (await dialogTitle()) === '快速修改 · 气血', await dialogTitle());
        await checkButtonTheme(ctx, '.modal-panel');

        /* 加减印块：气血是四位数，步长按量级走（±100）。
         * 用「相对差」而不是写死 4016——前面几条 step 改过这一格的值，
         * 写死一个数会在别处一改就红，而红的原因与加减无关。 */
        const beforeStep = Number(
            await cdp.evaluate(`document.querySelector('.modal-panel .cf-input').value`),
        );
        const addLabel = await cdp.evaluate(`document.querySelector('.modal-panel .cf-step[aria-label^="加 "]')?.getAttribute('aria-label')`);
        const subtractLabel = await cdp.evaluate(`document.querySelector('.modal-panel .cf-step[aria-label^="减 "]')?.getAttribute('aria-label')`);
        const step = Number(addLabel?.replace('加 ', ''));
        await ui.clickLabel(addLabel);
        await sleep(150);
        const afterAdd = Number(
            await cdp.evaluate(`document.querySelector('.modal-panel .cf-input').value`),
        );
        await ui.clickLabel(subtractLabel);
        await sleep(150);
        const afterSub = Number(
            await cdp.evaluate(`document.querySelector('.modal-panel .cf-input').value`),
        );
        t.check('加号按一下走当前量级步长', afterAdd - beforeStep === step, `${beforeStep} → ${afterAdd}（步长 ${step}）`);
        t.check('减号按回来', afterSub === beforeStep, `${afterAdd} → ${afterSub}`);

        await fillField('气血', '4200');
        t.check('改完能存下去', await saveDialog());
        t.check('卡上气血变成 4200', (await readRow('气血')) === '4200', await readRow('气血'));

        // ---- ② 师门技能 ----
        await ui.clickIn('.roster .char', 'E2E改名后', { text: '师门' });
        await sleep(280);
        const skillName = await inCard(
            `(card.querySelector('.school-row .slip-name')?.textContent || '').trim()`,
        );
        t.check('师门页有技能行', Boolean(skillName), String(skillName));
        const skillClicked = await clickInCard('.school-row');
        t.check('技能行点得动', skillClicked === true);
        await ui.waitFor(`!!document.querySelector('.modal-panel')`, { timeout: 3000 });
        t.check(
            '技能小窗标题统一为快速修改',
            (await dialogTitle()) === '快速修改',
            await dialogTitle(),
        );
        const dialogSkillName = await cdp.evaluate(
            `document.querySelector('.modal-panel .quick-skill-name')?.textContent.trim() ?? ''`,
        );
        t.check('技能名显示在小窗正文', dialogSkillName === skillName, dialogSkillName);
        t.check(
            '师门小窗显示对应图标',
            await cdp.evaluate(`(() => {
                const image = document.querySelector('.modal-panel .quick-icon img');
                return Boolean(image?.complete && image.naturalWidth > 0);
            })()`),
        );
        /* 门派技能的上限恒为 180，那一格**不该出现**：摆出来只会问出
         * 「180 还是 160」的假问题。 */
        const skillFields = await cdp.evaluate(
            `[...document.querySelectorAll('.modal-panel .quick-field .field-label')]
                    .map((one) => one.textContent.trim())`,
        );
        t.check('师门技能不问上限', skillFields.join('/') === '等级', skillFields.join('/'));
        await fillField('等级', '42');
        t.check('技能等级存下去了', await saveDialog());
        t.check(
            '卡上第一项技能变成 42',
            (await readRow(skillName)) === '42',
            await readRow(skillName),
        );

        // ---- 辅助技能 ----
        await ui.clickIn('.roster .char', 'E2E改名后', { text: '辅助' });
        t.check('辅助行点得动', (await clickRow('强身术')) === true);
        await ui.waitFor(`!!document.querySelector('.modal-panel')`, { timeout: 3000 });
        t.check('辅助小窗标题统一为快速修改', (await dialogTitle()) === '快速修改');
        t.check(
            '辅助小窗正文显示名字和图标',
            await cdp.evaluate(`(() => {
                const name = document.querySelector('.modal-panel .quick-skill-name');
                const image = document.querySelector('.modal-panel .quick-icon img');
                return name?.textContent.trim() === '强身术' &&
                    Boolean(image?.complete && image.naturalWidth > 0);
            })()`),
        );
        t.check(
            '辅助小窗只编辑等级',
            await cdp.evaluate(`(() => {
                const fields = document.querySelectorAll('.modal-panel .quick-field');
                return fields.length === 1 &&
                    fields[0].querySelector('.field-label')?.textContent.trim() === '等级';
            })()`),
        );
        await fillField('等级', '100');
        t.check('辅助等级存下去了', await saveDialog());
        t.check('卡上强身术变成 100', (await readRow('强身术')) === '100');
        const assist = await cdp.evaluate(`(async () => {
            const { useRoster } = await ${importLoaded('/src/views/characters/roster.ts')};
            const one = useRoster().roster.value.find((row) => row.name === 'E2E改名后');
            return { ...one.assists.find((row) => row.kind === 'life' && row.name === '强身术') };
        })()`);
        t.check('辅助快捷修改保留已有上限', assist.level === 100 && assist.cap === 140);

        await ui.clickIn('.roster .char', 'E2E改名后', { text: '修炼' });
        t.check('修炼行点得动', (await clickRow('攻击修炼')) === true);
        await ui.waitFor(`!!document.querySelector('.modal-panel')`, { timeout: 3000 });
        t.check(
            '修炼快速修改只提供等级',
            await cdp.evaluate(`document.querySelectorAll('.quick-field').length === 1 &&
                document.querySelector('.quick-field .field-label')?.textContent.trim() === '等级'`),
        );
        await fillField('等级', '12');
        t.check('修炼等级存下去了', await saveDialog());
        t.check('修炼卡片只显示更新后的等级', (await readRow('攻击修炼')) === '12');

        // ---- ③ 装备格 ----
        await ui.clickIn('.roster .char', 'E2E改名后', { text: '装备' });
        await sleep(280);
        /* 空位也要能点：新角色十二格全是空的，而那正是最想填的一格。
         * 点「头」那一格（按部位名找，不按 index——版式表随时可能调）。 */
        const gearClicked = await clickInCard(
            '.gear-cell',
            "one.querySelector('.gear-part')?.textContent === '头'",
        );
        t.check('空装备格也点得动', gearClicked === true);
        await ui.waitFor(`!!document.querySelector('.modal-panel')`, { timeout: 3000 });
        t.check('小窗标题写着部位', (await dialogTitle()) === '快速修改 · 头', await dialogTitle());
        /* 快捷添加按部位提供，直接选择目标分类，不再先选分类下拉。 */
        const gearSections = await cdp.evaluate(
            `[...document.querySelectorAll('.gear-quick .gear-add > button')]
                    .map((s) => s.getAttribute('aria-label'))`,
        );
        t.check(
            '头部直接提供宝石、熔炼、160特性、特技、特效、套装、符石组合与状态行',
            gearSections.join('/') ===
                '添加宝石行/添加熔炼行/添加160特性行/添加特技行/添加特效行/添加套装行/添加符石组合行/添加状态行',
            JSON.stringify(gearSections),
        );
        /* 加一条状态再填——验的是「整份表单能加行」，这是四个格子给不了的。 */
        const headBasics = await cdp.evaluate(
            `[...document.querySelectorAll('.gear-quick [data-group="base"] .stat-fixed')].map((one) => one.textContent.trim())`,
        );
        t.check('手动录入头部自动显示防御和魔法', headBasics.join('/') === '防御/魔法');
        await fillField('防御属性值', '+45');
        t.check(
            '基础分组带类别签',
            await ui.exists('.gear-quick [data-group="base"] .property-label.tag'),
        );
        await ui.clickLabel('添加状态行');
        await sleep(160);
        await ui.clickLabel('状态名');
        await ui.clickText('.gear-quick .select-opt', '锻炼等级', { exact: true });
        await fillField('锻炼等级', '5');
        t.check(
            '状态名和状态值按2比1分格，行尾删除可见',
            await cdp.evaluate(`(() => {
                const row = document.querySelector('.gear-quick .condition-row');
                const name = row.querySelector('.row-name').getBoundingClientRect();
                const value = row.querySelector('.value-field').getBoundingClientRect();
                return Math.abs(name.width - value.width * 2) < 1 &&
                    Math.abs(name.height - value.height) < 1 &&
                    getComputedStyle(row.querySelector('.row-delete')).opacity === '1';
            })()`),
        );
        await fillField('头 的装备名', 'E2E头');
        t.check('装备名与状态都存下去了', await saveDialog());
        const gearName = await inCard(`(() => {
                const cell = [...card.querySelectorAll('.gear-cell')]
                    .find((c) => (c.querySelector('.gear-part')?.textContent || '') === '头');
                return (cell?.querySelector('.gear-name')?.textContent || '').trim();
            })()`);
        t.check('卡上那一格写上 E2E头', gearName === 'E2E头', gearName);

        // ---- ④ 召唤兽：兽牌直接进入截图修改 ----
        await ui.clickIn('.roster .char', 'E2E改名后', { text: '召唤兽' });
        await sleep(280);
        await ui.clickIn('.roster .char', 'E2E改名后', { label: '查看 E2E兽 的详情' });
        await ui.waitFor(`!!document.querySelector('.modal-panel')`, { timeout: 3000 });
        await sleep(200);
        const toQuick = await ui.waitFor(
            `(document.querySelector('.modal-head h2')?.textContent || '').includes('快速修改')`,
            { timeout: 3000 },
        );
        t.check('点兽牌直接进入快速修改', toQuick, await dialogTitle());
        /* 名 / 等级 / 参战等级三条都在头一段右侧那一列里（2026-11-10 起头像收成一枚，
         * 三条挪到它右边，`.id7 .id-cell` 那套标记随结构一起撤了）。改数这一列里的输入格。 */
        const petLayout = await cdp.evaluate(`(() => ({
                idCells: document.querySelectorAll('.modal-panel .pet-identity .pet-id input').length,
                quality: document.querySelectorAll('.modal-panel .q6 .q-cell').length,
                lists: document.querySelectorAll('.modal-panel .list-block').length,
                points: document.querySelectorAll('.modal-panel .points .id-cell').length,
                screenshot: !!document.querySelector('.modal-panel .pet-screenshot.screenshot-upload'),
            }))()`);
        t.check(
            '兽窗共用截图入口与四组表单，不展示内丹',
            petLayout.idCells === 3 &&
                petLayout.quality === 6 &&
                petLayout.lists === 1 &&
                petLayout.points === 6 &&
                petLayout.screenshot,
            JSON.stringify(petLayout),
        );
        for (const [file, count, attack] of [
            ['pet-panel-prince.png', 10, '3606'],
            ['pet-panel-dog.png', 2, '601'],
        ]) {
            await cdp.evaluate(`(async () => {
                const response = await fetch('/tools/e2e/fixtures/' + ${JSON.stringify(file)});
                if (!response.ok) throw new Error('召唤兽截图加载失败');
                const transfer = new DataTransfer();
                transfer.items.add(new File([await response.blob()], ${JSON.stringify(file)}, { type: 'image/png' }));
                const input = document.querySelector('.pet-quick input[aria-label="召唤兽截图文件"]');
                input.files = transfer.files;
                input.dispatchEvent(new Event('change', { bubbles: true }));
            })()`);
            const filled = await ui.waitFor(
                `document.querySelector('.pet-quick input[aria-label="召唤兽攻击"]').value === ${JSON.stringify(attack)} && document.querySelector('.pet-quick .pet-screenshot').getAttribute('aria-busy') === 'false'`,
                { timeout: 60000 },
            );
            /* 技能自 2026-11-10 起是一格一枚图标（末尾还能加一格），不再有那种顿号分隔的
             * 文本框：读每格下面那行名字，拼回同一种可读形状。 */
            const skills = await cdp.evaluate(
                `[...document.querySelectorAll('.pet-quick .skill-icons .skill-picker small')]
                    .map((e) => e.textContent.trim()).join('、')`,
            );
            t.check(
                `${file} 覆盖当前兽的属性和技能`,
                filled && skills.split('、').filter(Boolean).length === count,
                skills,
            );
        }
        t.check(
            '较少技能覆盖后不残留旧技能',
            await cdp.evaluate(
                `[...document.querySelectorAll('.pet-quick .skill-icons .skill-picker small')]
                    .map((e) => e.textContent.trim()).join('、') === '泰山压顶、高级驱鬼'`,
            ),
        );
        await fillField('召唤兽名称', '   ');
        t.check(
            '单只修改清空名称时禁止保存',
            await cdp.evaluate(
                `document.querySelector('button[aria-label="保存这只召唤兽"]').disabled`,
            ),
        );
        await fillField('召唤兽名称', 'E2E兽');
        await fillField('等级', '121');
        t.check('兽的等级存下去了', await saveDialog());
        const petLevel = await inCard(
            `(card.querySelector('.plate .lv')?.textContent || '').trim()`,
        );
        t.check('卡上兽牌变成 121 级', petLevel.includes('121'), petLevel);

        // ---- 重载：四项都得在库里 ----
        await ui.reload();
        await ui.waitText('E2E改名后', { timeout: 8000 });
        await ui.clickIn('.roster .char', 'E2E改名后', { text: '属性' });
        await sleep(260);
        t.check('重载后气血还是 4200', (await readRow('气血')) === '4200', await readRow('气血'));
        await ui.clickIn('.roster .char', 'E2E改名后', { text: '装备' });
        await sleep(260);
        const gearAfter = await inCard(`(() => {
                const cell = [...card.querySelectorAll('.gear-cell')]
                    .find((c) => (c.querySelector('.gear-part')?.textContent || '') === '头');
                return (cell?.querySelector('.gear-name')?.textContent || '').trim();
            })()`);
        t.check('重载后装备名还在', gearAfter === 'E2E头', gearAfter);
        await ui.clickIn('.roster .char', 'E2E改名后', { text: '召唤兽' });
        await sleep(260);
        const petAfter = await inCard(
            `(card.querySelector('.plate .lv')?.textContent || '').trim()`,
        );
        t.check('重载后兽的等级还是 121', petAfter.includes('121'), petAfter);
        t.check(
            '重载后召唤兽数量不增加，技能仍是最后一张图',
            await cdp.evaluate(`(async () => {
            const { useRoster } = await ${importLoaded('/src/views/characters/roster.ts')};
            const pets = useRoster().roster.value.find((one) => one.name === 'E2E改名后').pets;
            return pets.length === 1 && pets[0].skills.join('、') === '泰山压顶、高级驱鬼' && pets[0].life === 189;
        })()`),
        );
    });

    /* 召唤兽的 × 与装备那枚**不是同一个动作**：这里是真的把这一只移出列表
     * （装备那边只是清空内容，行还在）。所以判据是「行没了」，不是「行空了」。 */
}
