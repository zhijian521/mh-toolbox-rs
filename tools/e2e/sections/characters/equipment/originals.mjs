export async function originals(ctx, tools) {
    const { cdp, ui, t } = ctx;
    const { readGear, uploadFixtures, waitUpload } = tools;
    await t.step('用户原图：基础总值补读、钟灵石说明排除与重载', async () => {
        await ui.clickIn('.roster .char', 'E2E改名后', { label: '编辑这个角色' });
        await ui.waitFor(`!!document.querySelector('.editor')`);
        await ui.clickText('.ocr-tabs button', '装备');
        await uploadFixtures([
            'gear-belt.png',
            'gear-weapon.png',
            'gear-bracelet.png',
            'gear-spear.png',
        ]);
        t.check('四张用户装备原图识别完成', await waitUpload());
        for (const { slot, values } of [
            { slot: '腰带', values: { 气血: 360, 防御: 33 } },
            { slot: '武器', values: { 命中: 561, 伤害: 731 } },
        ]) {
            await ui.clickLabel('编辑' + slot + '的装备');
            t.check(
                slot + '含宝石总值填进基础输入框，没有另拆宝石属性',
                await cdp.evaluate(`(() => {
                    const base = document.querySelector('.gear-editor [data-group="base"]');
                    return Object.entries(${JSON.stringify(values)}).every(([label, value]) =>
                        Number(base?.querySelector('input[aria-label="' + label + '属性值"]')?.value) === value) &&
                        !document.querySelector('.gear-editor [data-group="gem"]');
                })()`),
            );
        }
        t.check(
            '武器保留耐力体质，排除符石星位加成，只显示符石组合名称',
            await cdp.evaluate(`(() => {
                const form = document.querySelector('.gear-editor');
                const extra = form.querySelector('[data-group="extra"]');
                return extra?.querySelectorAll('.stat-row').length === 2 &&
                    extra.querySelector('input[aria-label="耐力属性值"]').value === '+30' &&
                    extra.querySelector('input[aria-label="体质属性值"]').value === '+29' &&
                    form.querySelector('.kind-upgrade .effect-row input')?.value === '高山流水';
            })()`),
        );
        await ui.clickLabel('编辑手镯的装备');
        t.check(
            '钟灵石单列名称等级，其效果不进入附加输入框',
            await cdp.evaluate(`(() => {
                const form = document.querySelector('.gear-editor');
                return form.querySelector('[data-group="钟灵石"] input')?.value === '固若金汤(1级)' &&
                    !form.querySelector('input[aria-label="抗物理暴击等级属性值"]') &&
                    form.querySelectorAll('[data-group="extra"] .detail-row').length === 3;
            })()`),
        );
        await ui.clickLabel('保存这个角色');
        await ui.waitFor(`!document.querySelector('.editor')`);
        await ui.reload();
        await ui.waitText('E2E改名后');
        const gear = await readGear();
        const bracelet = gear.find((one) => one.slot === '手镯')?.detail;
        t.check(
            '原图基础总值和钟灵石重载后仍在，未存钟灵石附加说明',
            gear
                .find((one) => one.slot === '腰带')
                ?.detail?.stats.some(
                    (row) =>
                        row.label === '气血' && Number(row.value) === 360 && row.group === 'base',
                ) &&
                gear
                    .find((one) => one.slot === '武器')
                    ?.detail?.stats.some(
                        (row) =>
                            row.label === '命中' &&
                            Number(row.value) === 561 &&
                            row.group === 'base',
                    ) &&
                gear
                    .find((one) => one.slot === '武器')
                    ?.detail?.lines?.some(
                        (row) => row.label === '符石组合' && row.value === '高山流水',
                    ) &&
                bracelet?.cond?.some(
                    (row) => row.label === '钟灵石' && row.value === '固若金汤(1级)',
                ) &&
                !bracelet?.stats.some((row) => row.label === '抗物理暴击等级'),
        );
    });
    await t.step('熔炼原图：符石之后的正负数单列，保存重载保留', async () => {
        await ui.clickIn('.roster .char', 'E2E改名后', { label: '编辑这个角色' });
        await ui.waitFor(`!!document.querySelector('.editor')`);
        await ui.clickText('.ocr-tabs button', '装备');
        await uploadFixtures(['gear-melt-spear.png', 'gear-melt-armor.png']);
        t.check('两张熔炼原图识别完成', await waitUpload());
        const cases = [
            { slot: '武器', values: { 魔力: '+1' } },
            { slot: '衣服', values: { 体质: '-1', 防御: '+12' } },
        ];
        for (const { slot, values } of cases) {
            await ui.clickLabel('编辑' + slot + '的装备');
            t.check(
                slot + '熔炼正负数单列，附加仍只有两项',
                await cdp.evaluate(`(() => {
                    const form = document.querySelector('.gear-editor');
                    const melt = form.querySelector('[data-group="melt"]');
                    const values = ${JSON.stringify(values)};
                    return melt?.querySelectorAll('.stat-row').length === Object.keys(values).length &&
                        Object.entries(values).every(([label, value]) =>
                            melt.querySelector('input[aria-label="' + label + '属性值"]')?.value === value) &&
                        form.querySelectorAll('[data-group="extra"] .stat-row').length === 2;
                })()`),
            );
        }
        await ui.clickLabel('保存这个角色');
        await ui.waitFor(`!document.querySelector('.editor')`);
        await ui.reload();
        await ui.waitText('E2E改名后');
        const gear = await readGear();
        for (const { slot, values } of cases) {
            const melt = gear
                .find((one) => one.slot === slot)
                ?.detail?.stats.filter((row) => row.group === 'melt');
            t.check(
                slot + '熔炼保存重载后仍保持分类和正负值',
                melt?.length === Object.keys(values).length &&
                    Object.entries(values).every(([label, value]) =>
                        melt.some((row) => row.label === label && row.value === value),
                    ),
            );
        }
    });
    await t.step('灵饰漏行原图：重复气血和防御逐条识别，保存重载保留', async () => {
        await ui.clickIn('.roster .char', 'E2E改名后', { label: '编辑这个角色' });
        await ui.waitFor(`!!document.querySelector('.editor')`);
        await ui.clickText('.ocr-tabs button', '装备');
        await uploadFixtures(['gear-spirit-bracelet-hp.png', 'gear-spirit-pendant-hp.png']);
        t.check('两张灵饰附加漏行样本识别完成', await waitUpload());
        const cases = [
            {
                slot: '手镯',
                extra: [
                    ['气血', 53, 168],
                    ['气血', 45, 168],
                    ['防御', 15, 48],
                ],
            },
            {
                slot: '配饰',
                extra: [
                    ['防御', 12, 48],
                    ['气血', 45, 168],
                    ['防御', 14, 48],
                ],
            },
        ];
        for (const { slot, extra } of cases) {
            await ui.clickLabel('编辑' + slot + '的装备');
            t.check(
                slot + '三条附加按原图顺序显示，重复词条独立编辑',
                await cdp.evaluate(`(() => {
                    const rows = [...document.querySelectorAll('.gear-editor [data-group="extra"] .stat-row')];
                    return rows.length === 3 && ${JSON.stringify(extra)}.every(([label, value, gain], index) =>
                        Number(rows[index].querySelector('input[aria-label="' + label + '属性值"]')?.value) === value &&
                        Number(rows[index].querySelector('input[aria-label="括号值"]')?.value) === gain);
                })()`),
            );
        }
        await ui.clickLabel('编辑手镯的装备');
        t.check(
            '自我陶醉只保留钟灵石名称与等级',
            await cdp.evaluate(
                `document.querySelector('.gear-editor [data-group="钟灵石"] input')?.value === '自我陶醉(4级)'`,
            ),
        );
        await ui.clickLabel('保存这个角色');
        await ui.waitFor(`!document.querySelector('.editor')`);
        await ui.reload();
        await ui.waitText('E2E改名后');
        const gear = await readGear();
        for (const { slot, extra } of cases) {
            const rows = gear
                .find((one) => one.slot === slot)
                ?.detail?.stats.filter((row) => row.gain)
                .map((row) => [row.label, Number(row.value), Number(row.extra)]);
            t.check(
                slot + '重载后仍有三条独立附加与强化值',
                JSON.stringify(rows) === JSON.stringify(extra),
            );
        }
    });
    await t.step('换行套装、160特性与玉魄蓝字原图：独立录入和重载', async () => {
        await ui.clickIn('.roster .char', 'E2E改名后', { label: '编辑这个角色' });
        await ui.waitFor(`!!document.querySelector('.editor')`);
        await ui.clickText('.ocr-tabs button', '装备');
        await uploadFixtures([
            'gear-suit-wrap.png',
            'gear-trait-armor.png',
            'gear-jade-effect.png',
        ]);
        t.check('三张套装和蓝字样本识别完成', await waitUpload());
        for (const { slot, suit, rune, melt } of [
            {
                slot: '头',
                suit: '变身术之猫灵(人型)',
                rune: '心随我动',
                melt: { 防御: 11, 魔法: -22 },
            },
            {
                slot: '衣服',
                suit: '变身术之修罗傀儡鬼',
                rune: '天降大任',
                melt: { 防御: 21 },
            },
        ]) {
            await ui.clickLabel('编辑' + slot + '的装备');
            t.check(
                slot + '套装换行拼完整，符石组合和熔炼仍分别保留',
                await cdp.evaluate(`(() => {
                    const form = document.querySelector('.gear-editor');
                    return form.querySelector('.kind-suit .effect-value')?.value === ${JSON.stringify(suit)} &&
                        form.querySelector('.kind-upgrade .effect-row input')?.value === ${JSON.stringify(rune)} &&
                        Object.entries(${JSON.stringify(melt)}).every(([label, value]) =>
                            Number(form.querySelector('[data-group="melt"] input[aria-label="' + label + '属性值"]')?.value) === value);
                })()`),
            );
        }
        t.check(
            '穿刺效果单列160特性、保留百分号且只有一个数值框',
            await cdp.evaluate(`(() => {
                const group = document.querySelector('.gear-editor [data-group="trait"]');
                return group?.querySelector('.property-label').textContent.trim() === '160特性' &&
                    group.querySelector('input[aria-label="穿刺效果属性值"]')?.value === '+0.88%' &&
                    !group.querySelector('.stat-extra') &&
                    document.querySelectorAll('.gear-editor [data-group="extra"] .stat-row').length === 2;
            })()`),
        );
        await ui.clickLabel('添加160特性行');
        t.check(
            '160特性快捷添加创建独立单值行',
            await cdp.evaluate(`(() => {
                const group = document.querySelector('.gear-editor [data-group="trait"]');
                return group.querySelectorAll('.stat-row').length === 2 &&
                    !group.querySelector('.stat-extra');
            })()`),
        );
        await cdp.click('.gear-editor [data-group="trait"] .property-item:last-child .row-delete');
        await ui.clickLabel('编辑玉魄·阴的装备');
        t.check(
            '法伤化劲单列玉魄特效、可快捷添加，普通加成仍有强化框',
            await cdp.evaluate(`(() => {
                const group = document.querySelector('.gear-editor [data-group="trait"]');
                return group?.querySelector('.property-label').textContent.trim() === '玉魄特效' &&
                    group.querySelector('input[aria-label="法伤化劲属性值"]')?.value === '+2.1%' &&
                    !group.querySelector('.stat-extra') &&
                    !!document.querySelector('.gear-editor button[aria-label="添加玉魄特效行"]') &&
                    document.querySelectorAll('.gear-editor [data-group="extra"] .stat-extra').length === 2;
            })()`),
        );
        await ui.clickLabel('添加玉魄特效行');
        t.check(
            '玉魄特效快捷添加创建单值行，不挪进奇袭分类',
            await cdp.evaluate(`(() => {
                const group = document.querySelector('.gear-editor [data-group="trait"]');
                return group.querySelectorAll('.stat-row').length === 2 &&
                    !!group.querySelector('input[aria-label="物伤化劲属性值"]') &&
                    !group.querySelector('.stat-extra');
            })()`),
        );
        await cdp.click('.gear-editor [data-group="trait"] .property-item:last-child .row-delete');
        await ui.clickLabel('保存这个角色');
        await ui.waitFor(`!document.querySelector('.editor')`);
        await ui.reload();
        await ui.waitText('E2E改名后');
        const gear = await readGear();
        for (const [slot, value] of [
            ['头', '变身术之猫灵(人型)'],
            ['衣服', '变身术之修罗傀儡鬼'],
        ]) {
            t.check(
                slot + '完整套装保存重载后仍在',
                gear
                    .find((one) => one.slot === slot)
                    ?.detail?.lines?.some((row) => row.label === '套装' && row.value === value),
            );
        }
        for (const [slot, label, value] of [
            ['衣服', '穿刺效果', '+0.88%'],
            ['玉魄·阴', '法伤化劲', '+2.1%'],
        ]) {
            t.check(
                label + '保存重载后保留特效分类、百分号，无强化值',
                gear
                    .find((one) => one.slot === slot)
                    ?.detail?.stats.some(
                        (row) =>
                            row.label === label &&
                            row.value === value &&
                            row.group === 'trait' &&
                            row.extra === undefined,
                    ),
            );
        }
    });
    await t.step('奇袭法术原图：强化前后均只显示单值，保存重载不补括号', async () => {
        await ui.clickIn('.roster .char', 'E2E改名后', { label: '编辑这个角色' });
        await ui.waitFor(`!!document.querySelector('.editor')`);
        await ui.clickText('.ocr-tabs button', '装备');
        await uploadFixtures(['gear-jade-ambush.png']);
        t.check('奇袭法术原图识别完成', await waitUpload());
        t.check(
            '两条奇袭法术各一个输入框，普通附加仍显示强化值',
            await cdp.evaluate(`(() => {
                const rows = [...document.querySelectorAll('.gear-editor [data-group="ambush"] .stat-row')];
                return rows.length === 2 && rows.every((row) =>
                    row.querySelector('input[aria-label="奇袭法术属性值"]')?.value === '+3%' &&
                    !row.querySelector('.stat-extra')) &&
                    document.querySelectorAll('.gear-editor [data-group="extra"] .stat-extra').length === 2;
            })()`),
        );
        await ui.clickLabel('保存这个角色');
        await ui.waitFor(`!document.querySelector('.editor')`);
        await ui.reload();
        await ui.waitText('E2E改名后');
        const rows = (await readGear())
            .find((one) => one.slot === '玉魄·阴')
            ?.detail?.stats.filter((row) => row.label === '奇袭法术');
        t.check(
            '奇袭法术保存重载后无强化值，重复原始行保留',
            rows?.length === 2 && rows.every((row) => row.value === '+3%' && !row.extra),
        );
    });
    await t.step('未命名装备：仅备注和零值属性保存后仍在', async () => {
        await ui.clickIn('.roster .char', 'E2E改名后', { text: '装备' });
        await ui.clickIn('.roster .char', 'E2E改名后', { label: '填写 项链' });
        await ui.fillSel('.gear-quick textarea[aria-label="装备备注"]', '先记录备注');
        await ui.clickText('.modal-panel button', '保存', { exact: true });
        await ui.waitFor(`!document.querySelector('.gear-quick')`);
        await ui.reload();
        await ui.waitText('E2E改名后');
        t.check(
            '仅填备注的空装备重载后仍保留',
            (await readGear()).find((one) => one.slot === '项链')?.detail?.note === '先记录备注',
        );
        await ui.clickIn('.roster .char', 'E2E改名后', { text: '装备' });
        await ui.clickIn('.roster .char', 'E2E改名后', { label: '填写 项链' });
        await ui.fillSel('.gear-quick input[aria-label="灵力属性值"]', '0');
        await ui.clickText('.modal-panel button', '保存', { exact: true });
        await ui.waitFor(`!document.querySelector('.gear-quick')`);
        await ui.reload();
        await ui.waitText('E2E改名后');
        const detail = (await readGear()).find((one) => one.slot === '项链')?.detail;
        t.check(
            '未填名称时零值属性和备注一起保留',
            detail?.note === '先记录备注' &&
                detail.stats.some((row) => row.label === '灵力' && row.value === '0'),
        );
    });
}
