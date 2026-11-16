import { importLoaded } from '../../../cdp.mjs';
import { uploadFixtureFiles } from '../screenshot.mjs';

export async function jadePair(ctx, tools) {
    const { cdp, ui, t } = ctx;
    const { uploadFixtures, waitUpload } = tools;
    const saved = () =>
        cdp.evaluate(`(async () => {
        const { useRoster } = await ${importLoaded('/src/views/characters/roster.ts')};
        const one = useRoster().roster.value.find(row => row.name === 'E2E改名后');
        // CDP 不能完整传输 Vue 只读代理，先在页面内转换为普通快照。
        return JSON.parse(JSON.stringify({
            soul: one.gearMeta.soul,
            jade: one.gear.filter(row => row.slot.startsWith('玉魄')),
        }));
    })()`);
    await t.step('阴阳玉魄同图识别：两件分别覆盖，共用命魂属性保存重载', async () => {
        await ui.clickIn('.roster .char', 'E2E改名后', { label: '编辑这个角色' });
        await ui.waitFor(`!!document.querySelector('.editor')`);
        await ui.clickText('.ocr-tabs button', '装备');
        await uploadFixtures(['gear-jade-pair.png']);
        t.check('双列玉魄原图识别完成', await waitUpload());
        for (const [slot, label, value] of [
            ['玉魄·阳', '物理暴击等级', '+7'],
            ['玉魄·阴', '气血', '+40'],
        ]) {
            await ui.clickLabel('编辑' + slot + '的装备');
            t.check(
                slot + '自身属性与命魂抗暴分开展示',
                await cdp.evaluate(`(() => {
                const form = document.querySelector('.gear-editor');
                return form.querySelector('input[aria-label="${label}属性值"]')?.value === '${value}' &&
                    form.querySelector('input[aria-label="命魂之玉抗法术暴击率属性值"]')?.value === '+0.5%' &&
                    !form.querySelector('[data-group="extra"] input[aria-label="抗法术暴击率属性值"]');
            })()`),
            );
        }
        await ui.clickLabel('保存这个角色');
        await ui.waitFor(`!document.querySelector('.editor')`);
        await ui.reload();
        await ui.waitText('E2E改名后');
        const value = await saved();
        t.check(
            '命魂共用属性重载只保留一份',
            value.soul?.length === 1 && value.soul[0].value === '+0.5%',
        );
        t.check(
            '阴阳两件分别保留各自强化值',
            value.jade
                .find((row) => row.slot === '玉魄·阳')
                ?.detail.stats.some(
                    (row) =>
                        row.label === '物理暴击等级' && row.value === '+7' && row.extra === '+12',
                ) &&
                value.jade
                    .find((row) => row.slot === '玉魄·阴')
                    ?.detail.stats.some(
                        (row) => row.label === '气血' && row.value === '+40' && row.extra === '+84',
                    ),
        );
    });
    await t.step('玉魄快速修改接收双列截图，取消保留原账本', async () => {
        const before = JSON.stringify(await saved());
        await ui.clickIn('.roster .char', 'E2E改名后', { text: '装备' });
        await ui.clickIn('.roster .char', 'E2E改名后', { label: '快速修改 玉魄·阳 · 上古玉魄·阳' });
        await ui.waitFor(`!!document.querySelector('.gear-quick')`);
        await uploadFixtureFiles(cdp, '.gear-quick .upload-file', ['gear-jade-pair.png']);
        t.check('快速修改识别双列截图', await waitUpload());
        await ui.fillSel('.gear-quick input[aria-label="命魂之玉抗法术暴击率属性值"]', '+0.75%');
        await ui.clickText('.modal-panel button', '取消', { exact: true });
        await ui.waitFor(`!!document.querySelector('[aria-label="确认放弃修改"]')`);
        await ui.clickLabel('确认放弃修改');
        await ui.waitFor(`!document.querySelector('.gear-quick')`);
        t.check('取消不改写两件玉魄与命魂属性', JSON.stringify(await saved()) === before);
    });
    await t.step('玉魄实际漏字原图回归：同图、阳、阴均能填写，奇袭保留百分号', async () => {
        const before = JSON.stringify(await saved());
        await ui.clickIn('.roster .char', 'E2E改名后', { label: '编辑这个角色' });
        await ui.waitFor(`!!document.querySelector('.editor')`);
        await ui.clickText('.ocr-tabs button', '装备');
        for (const [fixture, slots] of [
            ['gear-jade-pair-physical.png', ['玉魄·阳', '玉魄·阴']],
            ['gear-jade-pair-small.png', ['玉魄·阳', '玉魄·阴']],
            ['gear-jade-yang.png', ['玉魄·阳']],
            ['gear-jade-yin.png', ['玉魄·阴']],
        ]) {
            await uploadFixtures([fixture]);
            t.check(fixture + '识别完成', await waitUpload());
            for (const slot of slots) {
                await ui.clickLabel('编辑' + slot + '的装备');
                t.check(
                    fixture + '的' + slot + '保留正确百分比与自身读数',
                    await cdp.evaluate(`(() => {
                        const form = document.querySelector('.gear-editor');
                        const value = label => form.querySelector('input[aria-label="' + label + '属性值"]')?.value;
                        return value('奇袭法术') === '+0.5%' &&
                            (${JSON.stringify(slot)} === '玉魄·阳'
                                ? value('封印命中等级') === '+15' && value('速度') === '+5'
                                : value('格挡值') === '+31' && value('气血') === '+41') &&
                            form.querySelector('input[aria-label="命魂之玉抗物理暴击率属性值"]')?.value === '+0.5%';
                    })()`),
                );
            }
        }
        await ui.clickLabel('放弃这次修改');
        await ui.waitFor(`!!document.querySelector('[aria-label="确认放弃修改"]')`);
        await ui.clickLabel('确认放弃修改');
        await ui.waitFor(`!document.querySelector('.editor')`);
        t.check('原图回归取消后保留原档案', JSON.stringify(await saved()) === before);
    });
    await t.step('背包背景双列玉魄原图：阴阳属性、耐久与命魂分别保存重载', async () => {
        for (const sample of [
            {
                file: 'gear-jade-pair-bag.png',
                soul: '抗物理暴击率',
                yang: { 封印命中等级: '+15', 物理暴击等级: '+6', 速度: '+5', 耐久度: '242' },
                yin: { 格挡值: '+31', 气血回复效果: '+9', 气血: '+41', 耐久度: '154' },
            },
            {
                file: 'gear-jade-pair-bag-magic.png',
                soul: '抗法术暴击率',
                yang: { 封印命中等级: '+15', 物理暴击等级: '+7', 速度: '+4', 耐久度: '239' },
                yin: { 格挡值: '+18', 气血回复效果: '+8', 气血: '+40', 耐久度: '56' },
            },
        ]) {
            await ui.clickIn('.roster .char', 'E2E改名后', { label: '编辑这个角色' });
            await ui.waitFor(`!!document.querySelector('.editor')`);
            await ui.clickText('.ocr-tabs button', '装备');
            await uploadFixtures([sample.file]);
            t.check(sample.file + '识别完成', await waitUpload());
            await ui.clickLabel('保存这个角色');
            await ui.waitFor(`!document.querySelector('.editor')`);
            await ui.reload();
            await ui.waitText('E2E改名后');
            const value = await saved();
            t.check(
                sample.file + '共用命魂独立保存',
                value.soul?.length === 1 &&
                    value.soul[0].label === sample.soul &&
                    value.soul[0].value === '+0.5%',
                JSON.stringify(value.soul),
            );
            for (const [slot, expected] of [
                ['玉魄·阳', sample.yang],
                ['玉魄·阴', sample.yin],
            ]) {
                const detail = value.jade.find((one) => one.slot === slot)?.detail;
                const rows = [...(detail?.stats ?? []), ...(detail?.cond ?? [])];
                t.check(
                    sample.file + slot + '自身读数与奇袭保留，另一列属性不混入',
                    Object.entries(expected).every(([label, text]) =>
                        rows.some((row) => row.label === label && row.value === text),
                    ) &&
                        detail?.stats.length === 4 &&
                        rows.some((row) => row.label === '奇袭法术' && row.value === '+0.5%'),
                    JSON.stringify(detail),
                );
            }
        }
    });
}
