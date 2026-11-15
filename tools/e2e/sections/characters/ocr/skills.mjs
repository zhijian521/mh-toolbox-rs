import { importLoaded } from '../../../cdp.mjs';

export async function skills(ctx) {
    const { cdp, ui, t, sleep } = ctx;
    await t.step('截图识别：师门列表按名字读等级 → 写进卡 → 重载还在', async () => {
        await ui.clickIn('.roster .char', 'E2E改名后', { text: '师门' });
        await ui.clickIn('.roster .char', 'E2E改名后', { label: '编辑这个角色' });
        if (!(await ui.waitFor(`!!document.querySelector('.ocr')`, { timeout: 3000 }))) {
            throw new Error('识别弹窗没打开');
        }

        const opts = await cdp.evaluate(
            `[...document.querySelectorAll('.ocr-tabs .step-opt')]
                    .map((b) => ({ t: b.textContent.trim(), d: b.disabled }))`,
        );
        t.check(
            '属性、师门、辅助、修炼、装备、召唤兽六格都能点',
            opts.map((one) => one.t).join('/') === '属性/师门/辅助/修炼/装备/召唤兽' &&
                opts.every((one) => !one.d),
            JSON.stringify(opts),
        );
        t.check(
            '从师门卡打开时自动选中师门',
            (await cdp.evaluate(
                `document.querySelector('.ocr-tabs [aria-checked="true"]')?.textContent.trim()`,
            )) === '师门',
        );
        await sleep(300);
        t.check(
            '预览卡跟着翻到师门页',
            (await ui.text('.ocr-card')).includes('门派技能'),
            await ui.text('.ocr-card'),
        );

        const seven = await cdp.evaluate(`(async () => {
                const sc = await ${importLoaded('/src/views/characters/schools.ts')};
                return sc.schoolSkillNames('五庄观');
            })()`);

        /* 打乱的顺序 + 逐格不同的等级：位置与名字脱钩，靠位置推必错。 */
        const ORDER = [2, 0, 4, 1, 6, 3, 5];
        const LEVELS = [120, 115, 60, 120, 90, 90, 60];

        await ui.clickText('.ocr-tabs button', '属性', { exact: true });
        await cdp.evaluate(`(async () => {
                const names = ${JSON.stringify(seven)};
                const order = ${JSON.stringify(ORDER)};
                const levels = ${JSON.stringify(LEVELS)};
                const canvas = document.createElement('canvas');
                canvas.width = 320;
                canvas.height = 390;
                const ctx = canvas.getContext('2d');
                ctx.fillStyle = '#1a2638';
                ctx.fillRect(0, 0, canvas.width, canvas.height);
                ctx.fillStyle = '#f3ead6';
                ctx.font = '600 20px "Microsoft YaHei", sans-serif';
                ctx.textBaseline = 'top';
                order.forEach((pick, index) => {
                    const y = 18 + index * 52;
                    ctx.fillText(names[pick], 80, y);
                    ctx.fillText(String(levels[index]), 80, y + 25);
                });
                const blob = await new Promise((done) => canvas.toBlob(done, 'image/png'));
                const transfer = new DataTransfer();
                transfer.items.add(new File([blob], 'skills.png', { type: 'image/png' }));
                document.dispatchEvent(
                    new ClipboardEvent('paste', { clipboardData: transfer, bubbles: true }),
                );
                return true;
            })()`);

        const ready = await ui.waitFor(
            `!!document.querySelector('.ocr-count') &&
                 document.querySelectorAll('.ocr-card .school-row').length === 7`,
            { timeout: 60000 },
        );
        t.check('粘完就认，师门七行都列出来', ready);
        t.check(
            '人物属性页粘师门图自动切换为师门',
            (await cdp.evaluate(
                `document.querySelector('.ocr-tabs [aria-checked="true"]')?.textContent.trim()`,
            )) === '师门',
        );
        t.check(
            '七项全认到（认出 7 / 7）',
            (await ui.text('.ocr-count')).replace(/\s+/g, '') === '认出7/7',
            await ui.text('.ocr-count'),
        );

        /* 名字与等级的对应关系从页面里取，
         * 不在这里重抄一遍七项技能名。 */
        const placed = await cdp.evaluate(`(() => {
                const rows = [...document.querySelectorAll('.ocr-card .school-row')];
                return rows.map((row) => ({
                    name: row.querySelector('.slip-name')?.textContent.trim() ?? '',
                    value: row.querySelector('input')?.value ?? '',
                }));
            })()`);
        const expectLevels = Object.fromEntries(
            ORDER.map((pick, index) => [seven[pick], String(LEVELS[index])]),
        );
        const wrong = placed.filter((row) => expectLevels[row.name] !== row.value);
        t.check(
            '技能名与等级对应（顺序打乱也不串）',
            wrong.length === 0 && placed.length === 7,
            JSON.stringify(wrong),
        );

        /* 认错一个数就在卡上改——师门页的数字也是输入格。 */
        const first = placed[0]?.name;
        await ui.fillSel('.ocr-card .school-row input', '150');
        await cdp.key('Enter');
        await sleep(200);
        t.check(
            '卡上改完还是刚填的 150',
            (await cdp.evaluate(
                `document.querySelector('.ocr-card .school-row input')?.value ?? ''`,
            )) === '150',
        );

        await ui.clickText('[role="dialog"] button', '保存');
        await ui.waitFor(`!document.querySelector('.ocr')`, { timeout: 3000 });
        await sleep(600);

        const readSkills = `(() => {
                const one = [...document.querySelectorAll('.roster .char')]
                    .find((c) => (c.textContent || '').includes('E2E改名后'));
                return [...(one?.querySelectorAll('.school-row') ?? [])].map((row) => ({
                    name: row.querySelector('.slip-name')?.textContent.trim() ?? '',
                    value: row.querySelector('.lv')?.textContent.trim() ?? '',
                }));
            })()`;
        await ui.clickIn('.roster .char', 'E2E改名后', { text: '师门' });
        await sleep(300);
        const onCard = await cdp.evaluate(readSkills);
        t.check('卡上师门页有七行', onCard.length === 7, JSON.stringify(onCard));
        t.check(
            '七项等级写进卡（含卡上改过的 150）',
            onCard.find((row) => row.name === first)?.value === '150' &&
                onCard.filter((row) => row.value && row.value !== '150').length === 6,
            JSON.stringify(onCard),
        );

        await ui.reload();
        await ui.waitText('E2E改名后', { timeout: 8000 });
        await ui.clickIn('.roster .char', 'E2E改名后', { text: '师门' });
        await sleep(400);
        const kept = await cdp.evaluate(readSkills);
        t.check(
            '重载后七项还在（真的落库了）',
            kept.length === 7 &&
                kept.find((row) => row.name === first)?.value === '150' &&
                kept.filter((row) => row.value && row.value !== '150').length === 6,
            JSON.stringify(kept),
        );
    });
}
