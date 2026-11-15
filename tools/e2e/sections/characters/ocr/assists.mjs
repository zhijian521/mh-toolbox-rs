import { importLoaded } from '../../../cdp.mjs';

export async function assists(ctx, tools) {
    const { cdp, ui, t, sleep } = ctx;
    const { pasteFixture } = tools;
    await t.step('辅助截图：按截图顺序替换对应组，另一组保留，重载后仍在', async () => {
        await cdp.evaluate(`(async () => {
            const { useRoster } = await ${importLoaded('/src/views/characters/roster.ts')};
            const roster = useRoster();
            const one = roster.roster.value.find((row) => row.name === 'E2E改名后');
            roster.update({
                ...one,
                assists: [
                    { name: '强身术', kind: 'life', level: 20, cap: 140 },
                    { name: '烹饪技巧', kind: 'life', level: 77 },
                    { name: '奇门遁甲', kind: 'story', level: 2 },
                ],
            });
            if (!(await roster.flush())) throw new Error('辅助识别前置数据未写入');
        })()`);
        const readAssists = () =>
            cdp.evaluate(`(async () => {
            const { useRoster } = await ${importLoaded('/src/views/characters/roster.ts')};
            return useRoster().roster.value.find((row) => row.name === 'E2E改名后')
                .assists.map(({ name, kind, level, cap, off }) => ({ name, kind, level, cap, off }));
        })()`);
        const life = [
            { name: '强身术', kind: 'life', level: 98 },
            { name: '冥想', kind: 'life', level: 40 },
            { name: '养生之道', kind: 'life', level: 40 },
            { name: '健身术', kind: 'life', level: 39 },
        ];
        const story = [
            { name: '变化之术', kind: 'story', level: 6 },
            { name: '打坐', kind: 'story', level: 5 },
        ];
        for (const [index, items] of [life, story].entries()) {
            const before = await readAssists();
            await ui.clickIn('.roster .char', 'E2E改名后', { text: '辅助' });
            await ui.clickIn('.roster .char', 'E2E改名后', { label: '编辑这个角色' });
            await ui.waitFor(`!!document.querySelector('.ocr')`);
            t.check(
                '从辅助卡打开时自动选中辅助',
                (await cdp.evaluate(
                    `document.querySelector('.ocr-tabs [aria-checked="true"]')?.textContent.trim()`,
                )) === '辅助',
            );
            t.check(
                '辅助预览只挂一页且没有失效的页签关联',
                await cdp.evaluate(`document.querySelectorAll('.ocr-card .pane').length === 1 &&
                    document.querySelector('.ocr-card .pane').getAttribute('role') === 'region'`),
            );
            await cdp.evaluate(`(async () => {
                const { commands } = await ${importLoaded('/src/services/bindings.ts')};
                window.__e2eAssistOcr = commands.ocrFrame;
                window.__e2eAssistFrames = [];
                commands.ocrFrame = (...args) => {
                    window.__e2eAssistFrames.push({ width: args[1], height: args[2] });
                    return window.__e2eAssistOcr(...args);
                };
            })()`);
            let ready;
            try {
                await pasteFixture(index === 0 ? 'assist-life.png' : 'assist-story.png');
                ready = await ui.waitFor(
                    `!document.querySelector('.ocr-standard .upload-busy') &&
                        !!document.querySelector('.ocr-count') &&
                        document.querySelectorAll('.ocr-card .assist-group input').length > 0`,
                    { timeout: 60000 },
                );
            } finally {
                const frames = await cdp.evaluate(`(async () => {
                    const { commands } = await ${importLoaded('/src/services/bindings.ts')};
                    commands.ocrFrame = window.__e2eAssistOcr;
                    const frames = window.__e2eAssistFrames;
                    delete window.__e2eAssistOcr;
                    delete window.__e2eAssistFrames;
                    return frames;
                })()`);
                t.check('辅助只对等级区域做一次 OCR', frames.length === 1, JSON.stringify(frames));
                t.check(
                    '辅助不再发送整张截图像素',
                    frames.every((frame) => frame.width < 100 && frame.height < 300),
                    JSON.stringify(frames),
                );
            }
            t.check(index === 0 ? '生活截图识别完成' : '剧情截图识别完成', ready);
            t.check(
                '只计实际识别的技能，不计空格、剧情点和页码',
                (await ui.text('.ocr-count')).replace(/\s+/g, '') ===
                    `认出${items.length}/${items.length}`,
                await ui.text('.ocr-count'),
            );
            for (const item of items) {
                t.check(
                    `${item.name}的等级配对正确`,
                    (await cdp.evaluate(
                        `document.querySelector('.ocr-card input[aria-label="${item.name} 等级"]')?.value`,
                    )) === String(item.level),
                );
            }
            if (index === 0) {
                await ui.fillSel('.ocr-card input[aria-label="强身术 等级"]', '99');
                await cdp.key('Enter');
                await sleep(120);
            }
            await ui.clickText('.modal-panel button', '保存');
            t.check(
                '辅助识别结果保存后收起弹窗',
                await ui.waitFor(`!document.querySelector('.ocr')`),
            );
            const kept = await readAssists();
            const kind = items[0].kind;
            t.check(
                '当前组按截图顺序整组替换，不残留旧技能',
                kept
                    .filter((row) => row.kind === kind)
                    .map((row) => row.name)
                    .join('/') === items.map((row) => row.name).join('/'),
                JSON.stringify(kept),
            );
            t.check(
                '另一组的技能、等级和顺序保持不变',
                JSON.stringify(kept.filter((row) => row.kind !== kind)) ===
                    JSON.stringify(before.filter((row) => row.kind !== kind)),
                JSON.stringify(kept),
            );
            t.check(
                '等级修正保留，上限不受识别影响',
                kept.find((row) => row.name === '强身术')?.level === 99 &&
                    kept.find((row) => row.name === '强身术')?.cap === 140,
            );
        }
        const order = (await readAssists()).map((row) => `${row.kind}-${row.name}`).join('/');
        await ui.reload();
        await ui.waitText('E2E改名后', { timeout: 8000 });
        const kept = await readAssists();
        t.check(
            '辅助技能顺序重载后保留',
            kept.map((row) => `${row.kind}-${row.name}`).join('/') === order,
        );
        t.check(
            '生活、剧情两张图的结果重载后都保留',
            [...life, ...story].every((item) =>
                kept.some(
                    (row) =>
                        row.name === item.name &&
                        row.kind === item.kind &&
                        row.level === (item.name === '强身术' ? 99 : item.level),
                ),
            ),
            JSON.stringify(kept),
        );
    });
}
