import { importLoaded } from '../../cdp.mjs';
import { checkButtonTheme } from './theme.mjs';

export async function ocr(ctx) {
    const { cdp, ui, t, sleep } = ctx;
    const checkCardFits = async (pane) => {
        const sizes =
            await cdp.evaluate(`['.ocr-standard .upload-detail', '.ocr-card .char', '.ocr-card .char-body']
            .map((selector) => {
                const one = document.querySelector(selector);
                return {
                    selector, width: one.clientWidth, height: one.clientHeight,
                    scrollWidth: one.scrollWidth, scrollHeight: one.scrollHeight,
                };
            })`);
        t.check(
            `${pane}预览完整展示，没有多余的横向或纵向滚动`,
            sizes.every(
                (one) => one.scrollWidth <= one.width + 1 && one.scrollHeight <= one.height + 1,
            ),
            JSON.stringify(sizes),
        );
    };
    const pasteFixture = (name, omitTrainingLevel = false) =>
        cdp.evaluate(`(async () => {
            const response = await fetch('/tools/e2e/fixtures/' + ${JSON.stringify(name)});
            if (!response.ok) throw new Error('截图样本加载失败：' + response.status);
            let blob = await response.blob();
            if (${omitTrainingLevel}) {
                const bitmap = await createImageBitmap(blob);
                const canvas = document.createElement('canvas');
                canvas.width = bitmap.width;
                canvas.height = bitmap.height;
                const context = canvas.getContext('2d');
                context.drawImage(bitmap, 0, 0);
                bitmap.close();
                // 擦掉猎术等级，保留同一行经验，防止误拿经验补漏项。
                const [r, g, b] = context.getImageData(180, 190, 1, 1).data;
                context.fillStyle = 'rgb(' + r + ',' + g + ',' + b + ')';
                context.fillRect(114, 190, 66, 21);
                blob = await new Promise((done) => canvas.toBlob(done, 'image/png'));
            }
            const transfer = new DataTransfer();
            transfer.items.add(new File([blob], ${JSON.stringify(name)}, { type: 'image/png' }));
            document.dispatchEvent(
                new ClipboardEvent('paste', { clipboardData: transfer, bubbles: true }),
            );
        })()`);
    /* ---- 截图识别（2026-11-07）----
     * 真跑一遍：点卡头那枚 → 粘一张**现画的**面板 → 认出字段 → 保存 →
     * 卡上变了 → 重载后还在。
     *
     * 属性用 `canvas` 现画，辅助与修炼用不含角色身份的固定原图。画布上的字是微软雅黑
     * 22px，PP-OCRv4 读得出来
     * （实测 10/10 行全对），于是这条链的每一段都被真的走过一遍——
     * 粘贴事件、canvas 取像素、IPC 传 1MB 裸像素、模型推理、解析、写库。
     *
     * 画的字段刻意**不含名称**：名称是后面几步用来定位这张卡的（`clickIn` 按文字找），
     * 改名会把后面的断言全打断。等级画 69 而不是 175——下面召唤兽那条要验
     * 「参战 145 等级不够、签转朱」，等级填高了那条就永远不成立。 */
    await t.step('截图识别：粘一张合成面板 → 认出字段 → 写进卡', async () => {
        await ui.clickIn('.roster .char', 'E2E改名后', { text: '属性' });
        await ui.clickIn('.roster .char', 'E2E改名后', { label: '编辑这个角色' });
        if (!(await ui.waitFor(`!!document.querySelector('.ocr')`, { timeout: 3000 }))) {
            throw new Error('识别弹窗没打开');
        }

        /* 分区切换是卡上那条滑轨（`SteppedSlider`），不是分段胶囊：
         * ARIA 仍是单选组（这里没有对应的面板元素可让 `aria-controls` 指）。 */
        const rail = await cdp.evaluate(`(() => {
                const one = document.querySelector('.ocr .stepped');
                const opts = [...document.querySelectorAll('.ocr-bar .step-opt')];
                return {
                    labels: opts.map((b) => b.textContent.trim()),
                    role: one?.getAttribute('role') ?? '',
                    thumb: document.querySelectorAll('.ocr-bar .step-thumb').length,
                    locked: opts.find((b) => b.textContent.trim() === '师门')?.disabled ?? false,
                };
            })()`);
        t.check(
            '分区是属性 / 师门 / 辅助 / 修炼 / 装备 / 召唤兽六格',
            rail.labels.join('/') === '属性/师门/辅助/修炼/装备/召唤兽',
            JSON.stringify(rail.labels),
        );
        t.check(
            '切换器是卡上那条滑轨（一枚朱印 + 单选组）',
            rail.role === 'radiogroup' && rail.thumb === 1,
            JSON.stringify(rail),
        );
        /* 2026-11-07 第二批：师门从「灰着的占位」变成真选项。这条以前验的是
         * `disabled === true`，现在反过来——**别把它删了**，它守的是「分区切换器
         * 别退化成只有一个可用格」。 */
        t.check('师门那格能点（不再是占位）', rail.locked === false, JSON.stringify(rail));

        /* 右边的卡是**预览**：不长那条六页签的轨道，其余五页也不挂载。 */
        t.check('预览卡不画页签条', (await ui.count('.ocr-card .tabs')) === 0);
        const panes = await ui.count('.ocr-card .pane');
        t.check('预览卡只挂属性这一页', panes === 1, `实际 ${panes} 页`);
        await checkButtonTheme(ctx, '.modal-panel');

        const empty = await ui.text('.ocr-standard .upload-preview');
        t.check('空态说清了怎么粘', empty.includes('Ctrl + V'), empty);

        /* 页脚只有两枚按钮。原先那里还压着一句「只写认出来的项…乾元丹 / 潜能果
         * 不参与」，2026-11-07 用户要求删——别再顺手加回去。 */
        const foot = await cdp.evaluate(`(() => {
                const one = document.querySelector('.modal-foot');
                return {
                    text: (one?.innerText ?? '').replace(/\\s+/g, ' ').trim(),
                    buttons: one?.querySelectorAll('button').length ?? -1,
                };
            })()`);
        t.check(
            '页脚只剩两枚按钮，没有注脚',
            foot.buttons === 2 && foot.text === '取消 保存',
            JSON.stringify(foot),
        );

        /* 派发一次真正的 paste（带一个 PNG File），与用户按 Ctrl+V 走同一条路：
         * 组件监听的是 `document` 的 paste，从 `clipboardData.items` 里取图。 */
        await cdp.evaluate(`(async () => {
                const canvas = document.createElement('canvas');
                canvas.width = 540;
                canvas.height = 260;
                const ctx = canvas.getContext('2d');
                ctx.fillStyle = '#1c1a12';
                ctx.fillRect(0, 0, canvas.width, canvas.height);
                ctx.fillStyle = '#f3ead6';
                ctx.font = '600 22px "Microsoft YaHei", sans-serif';
                ctx.textBaseline = 'top';
                const rows = [
                    ['等级', '69'],
                    ['门派', '五庄观'],
                    ['气血', '3916/3916'],
                    ['人气', '757'],
                    ['命中', '1000'],
                    ['经验', '39686092/14142174'],
                ];
                rows.forEach((row, index) => {
                    ctx.fillText(row[0], 20, 20 + index * 40);
                    ctx.fillText(row[1], 140, 20 + index * 40);
                });
                const blob = await new Promise((done) => canvas.toBlob(done, 'image/png'));
                const transfer = new DataTransfer();
                transfer.items.add(new File([blob], 'panel.png', { type: 'image/png' }));
                document.dispatchEvent(
                    new ClipboardEvent('paste', { clipboardData: transfer, bubbles: true }),
                );
                return true;
            })()`);

        /* 等的是**认完**这件事。不能等 `.attr-field` 出现：那二十格在识别还没开始
         * 就已经画好了（它们是卡片结构，不是识别结果），一粘就满足，断言会全打在
         * 空值上——第一次跑就是这么红的。`.ocr-count`（认出 N 项）只在解析出结果后渲染。 */
        const ready = await ui.waitFor(
            `!!document.querySelector('.ocr-count') && !document.querySelector('.ocr-standard .upload-busy')`,
            { timeout: 40000 },
        );
        t.check('粘完就开始认，认完报出认出几项', ready);
        const complaint = await cdp.evaluate(
            `document.querySelector('.ocr-standard .upload-error')?.textContent.trim() ?? ''`,
        );
        t.check('识别没报错', complaint === '', complaint);

        const cells = await ui.count('.ocr-card .attr-field');
        t.check('卡上二十格都成了可改的格', cells === 20, `实际 ${cells} 格`);
        t.check('左栏不再排输入格', (await ui.count('.ocr-fields')) === 0);

        /* 「识别中…」那层蒙版必须跟着撤掉。它单看起来只是块半透明纸，
         * 但真停在那儿，用户会以为还在算、于是一直等。 */
        t.check('识别完就撤掉「识别中」', (await ui.count('.ocr-standard .upload-busy')) === 0);

        const shot = await cdp.evaluate(`(() => {
                const card = document.querySelector('.ocr-card');
                const dialog = card.closest('[role="dialog"]');
                const values = {};
                for (const input of card.querySelectorAll('.attr-field')) {
                    values[input.getAttribute('aria-label')] = input.value;
                }
                return {
                    values,
                    level: card.querySelector('input[aria-label="角色等级"]')?.value ?? '',
                    school: card.querySelector('.identity-school .select-text')?.textContent.trim() ?? '',
                    rawOpen: dialog?.querySelector('.ocr-standard .upload-raw')?.open ?? null,
                    rawHead: dialog?.querySelector('.ocr-standard .upload-raw summary')?.textContent.trim() ?? '',
                };
            })()`);
        t.check('卡头等级认出 69', shot.level === '69', shot.level);
        t.check('卡头门派认出五庄观', shot.school === '五庄观', shot.school);
        t.check(
            '气血取了上限 3916',
            shot.values['气血'] === '3916',
            `实际「${shot.values['气血']}」`,
        );
        t.check('命中认出 1000', shot.values['命中'] === '1000', `实际「${shot.values['命中']}」`);
        t.check(
            '图上没画的那项是空格',
            shot.values['魔法'] === '',
            `实际「${shot.values['魔法']}」`,
        );

        /* 经验那两格不在 `.attr-field` 里（它在 `.exp-edit` 那一对），单独读：
         * 面板给八位数，交到卡上的必须是「万」——同一个号在面板上是 `39686092`、
         * 在卡上是 `3,968.6万`，核对时不必心算除一万。 */
        const exp = await cdp.evaluate(
            `[...document.querySelector('.ocr-card').querySelectorAll('.exp-field')].map((i) => i.value)`,
        );
        t.check('经验换成万：39686092 → 3968.6万', exp[0] === '3968.6万', JSON.stringify(exp));
        t.check(
            '升级经验也换成万：14142174 → 1414.2万',
            exp[1] === '1414.2万',
            JSON.stringify(exp),
        );
        /* 原文默认折叠：二十几行摊开会把原图挤掉一半，而它是「出问题才来看」的。 */
        t.check('识别原文默认是折叠的', shot.rawOpen === false, `open=${shot.rawOpen}`);
        t.check('折叠的抬头写着行数', /识别原文 · \d+ 行/.test(shot.rawHead), shot.rawHead);

        // 命中项可修正，漏项直接补录，保存不再受 OCR 行状态限制。
        await ui.fillSel('.ocr-card input[aria-label="命中"]', '1250');
        await cdp.key('Enter');
        await ui.fillSel('.ocr-card input[aria-label="魔法"]', '2170');
        await cdp.key('Enter');
        await sleep(200);
        const typed = await cdp.evaluate(`(() => {
                const card = document.querySelector('.ocr-card');
                return {
                    hit: card.querySelector('input[aria-label="命中"]').value,
                    magic: card.querySelector('input[aria-label="魔法"]').value,
                };
            })()`);
        t.check(
            '卡上改完那两格还是刚填的数',
            typed.hit === '1250' && typed.magic === '2170',
            JSON.stringify(typed),
        );

        await ui.clickText('[role="dialog"] button', '保存');
        await ui.waitFor(`!document.querySelector('.ocr')`, { timeout: 3000 });
        await sleep(600);

        const readCard = `(() => {
                const one = [...document.querySelectorAll('.roster .char')]
                    .find((c) => (c.textContent || '').includes('E2E改名后'));
                const read = (label) =>
                    [...(one?.querySelectorAll('.slip-row') ?? [])]
                        .find((r) => (r.textContent || '').trim().startsWith(label))
                        ?.querySelector('.lv')?.textContent.trim() ?? '';
                return {
                    level: (one?.textContent || '').match(/(\\d+) 级/)?.[1] ?? '',
                    hp: read('气血'),
                    magic: read('魔法'),
                    hit: read('命中'),
                    exp: one?.querySelector('.meter-text')?.textContent.trim() ?? '',
                };
            })()`;
        const card = await cdp.evaluate(readCard);
        t.check('卡头等级变成 69', card.level === '69', JSON.stringify(card));
        t.check('属性页气血变成 3916', card.hp === '3916', JSON.stringify(card));
        t.check('卡上填的魔法写进去了（miss 也生效）', card.magic === '2170', JSON.stringify(card));
        t.check('卡上改的命中写进去了', card.hit === '1250', JSON.stringify(card));
        t.check('经验落到卡上也是万', card.exp === '3968.6万 / 1414.2万', JSON.stringify(card.exp));

        await ui.reload();
        await ui.waitText('E2E改名后', { timeout: 8000 });
        const after = await cdp.evaluate(readCard);
        t.check('重载后还是 3916（真的落库了）', after.hp === '3916', JSON.stringify(after));
        t.check('重载后 2170 还在', after.magic === '2170', JSON.stringify(after));
        t.check(
            '重载后经验还是万（落库的是文本，不是换算前的数）',
            after.exp === '3968.6万 / 1414.2万',
            JSON.stringify(after.exp),
        );
    });

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

    await t.step('修炼截图：只记等级、漏项可修正、重载保留', async () => {
        const expected = {
            攻击修炼: 11,
            防御修炼: 5,
            法术修炼: 0,
            抗法修炼: 5,
            猎术修炼: 7,
            攻击控制力: 0,
            防御控制力: 0,
            法术控制力: 0,
            抗法控制力: 0,
            育兽术: 0,
        };
        const beforeExp = await cdp.evaluate(`(async () => {
            const { useRoster } = await ${importLoaded('/src/views/characters/roster.ts')};
            const roster = useRoster();
            const one = roster.roster.value.find((row) => row.name === 'E2E改名后');
            roster.update({
                ...one,
                trainings: one.trainings.map((group) => ({
                    ...group,
                    rows: group.rows.map((row) => ({
                        ...row, level: 7,
                    })),
                })),
            });
            if (!(await roster.flush())) throw new Error('修炼识别前置数据未写入');
            return { ...one.experience };
        })()`);
        await ui.clickIn('.roster .char', 'E2E改名后', { text: '修炼' });
        await ui.clickIn('.roster .char', 'E2E改名后', { label: '编辑这个角色' });
        await ui.waitFor(`!!document.querySelector('.ocr')`);
        t.check(
            '从修炼卡打开时自动选中修炼',
            (await cdp.evaluate(
                `document.querySelector('.ocr-tabs [aria-checked="true"]')?.textContent.trim()`,
            )) === '修炼',
        );
        t.check(
            '修炼预览只挂当前分区，没有失效的页签关联',
            await cdp.evaluate(`document.querySelectorAll('.ocr-card .pane').length === 1 &&
                document.querySelector('.ocr-card .pane').getAttribute('role') === 'region' &&
                !document.querySelector('.ocr-card .pane').hasAttribute('aria-labelledby')`),
        );
        await pasteFixture('training.png');
        await ui.waitFor(
            `!document.querySelector('.ocr-standard .upload-busy') && !!document.querySelector('.ocr-count')`,
            { timeout: 60000 },
        );
        t.check(
            '修炼原图十项全部识别',
            (await ui.text('.ocr-count')).replace(/\s+/g, '') === '认出10/10',
            await ui.text('.ocr-count'),
        );
        await ui.fillSel('.ocr-card input[aria-label="猎术修炼 等级"]', '7');
        await cdp.key('Enter');
        await pasteFixture('training.png', true);
        t.check(
            '修炼截图识别完成',
            await ui.waitFor(
                `!document.querySelector('.ocr-standard .upload-busy') &&
                    !!document.querySelector('.ocr-count') &&
                    document.querySelectorAll('.ocr-card .training-list input').length === 10`,
                { timeout: 60000 },
            ),
        );
        t.check(
            '只识别九项，丢失的等级不从经验里取',
            (await ui.text('.ocr-count')).replace(/\s+/g, '') === '认出9/10',
            await ui.text('.ocr-count'),
        );
        const placed = await cdp.evaluate(`Object.fromEntries(
            [...document.querySelectorAll('.ocr-card .training-list input')]
                .map((one) => [one.getAttribute('aria-label').replace(/ 等级$/, ''), one.value]),
        )`);
        t.check(
            '等级按项名配对，0 级写入、漏项保留原值',
            Object.entries(expected).every(([name, level]) => placed[name] === String(level)),
            JSON.stringify(placed),
        );
        await ui.fillSel('.ocr-card input[aria-label="攻击修炼 等级"]', '12');
        await cdp.key('Enter');
        await ui.fillSel('.ocr-card input[aria-label="猎术修炼 等级"]', '8');
        await cdp.key('Enter');
        expected.攻击修炼 = 12;
        expected.猎术修炼 = 8;
        await ui.clickText('.modal-panel button', '保存');
        await ui.waitFor(`!document.querySelector('.ocr')`);
        await ui.reload();
        await ui.waitText('E2E改名后', { timeout: 8000 });
        const kept = await cdp.evaluate(`(async () => {
            const { useRoster } = await ${importLoaded('/src/views/characters/roster.ts')};
            const one = useRoster().roster.value.find((row) => row.name === 'E2E改名后');
            return {
                rows: one.trainings.flatMap((group) => group.rows.map((row) => ({ ...row }))),
                exp: { ...one.experience },
            };
        })()`);
        t.check(
            '两组等级与手动修正重载后都保留',
            kept.rows.every((row) => row.level === expected[row.name]),
            JSON.stringify(kept.rows),
        );
        t.check(
            '保存后的修炼记录不含上限',
            kept.rows.every((row) => !Object.hasOwn(row, 'cap')),
        );
        t.check('修炼经验不写入角色经验', JSON.stringify(kept.exp) === JSON.stringify(beforeExp));
    });

    await t.step('截图草稿：无图补录、清空和辅助增删，切页保留、取消不落库', async () => {
        const readCharacter = () =>
            cdp.evaluate(`(async () => {
            const { useRoster } = await ${importLoaded('/src/views/characters/roster.ts')};
            return JSON.parse(JSON.stringify(useRoster().roster.value
                .find((row) => row.name === 'E2E改名后')));
        })()`);
        const before = await readCharacter();
        await ui.clickIn('.roster .char', 'E2E改名后', { text: '属性' });
        await ui.clickIn('.roster .char', 'E2E改名后', { label: '编辑这个角色' });
        await ui.waitFor(`!!document.querySelector('.ocr')`);
        await ui.fillSel('.ocr-card input[aria-label="角色名"]', 'E2E截图草稿');
        await cdp.key('Enter');
        await ui.fillSel('.ocr-card input[aria-label="角色帮派"]', '草稿帮派');
        await cdp.key('Enter');
        await ui.fillSel('.ocr-card input[aria-label="乾元丹"]', '3');
        await cdp.key('Enter');
        await ui.fillSel('.ocr-card input[aria-label="气血"]', '');
        await cdp.key('Enter');
        t.check(
            '固定属性不提供删除按钮，分组仍为两列',
            (await ui.count('.ocr-card .pane button')) === 0 &&
                (await cdp.evaluate(`(() => {
                    const groups = [...document.querySelectorAll('.ocr-card .attr-group')];
                    const first = groups[0].getBoundingClientRect();
                    const second = groups[1].getBoundingClientRect();
                    return Math.abs(first.top - second.top) < 1 && second.left > first.left;
                })()`)),
        );
        await checkCardFits('属性');
        await ui.clickText('.ocr-tabs .step-opt', '师门', { exact: true });
        await ui.fillSel('.ocr-card .school-row input', '120');
        await cdp.key('Enter');
        await ui.fillSel('.ocr-card .school-row input', '0');
        await cdp.key('Enter');
        t.check(
            '师门固定七项可改等级，不提供删除按钮，仍一行两个',
            (await ui.count('.ocr-card .school-row')) === 7 &&
                (await ui.count('.ocr-card .school-row button')) === 0 &&
                (await cdp.evaluate(`(() => {
                    const rows = [...document.querySelectorAll('.ocr-card .school-row')];
                    const first = rows[0].getBoundingClientRect();
                    const second = rows[1].getBoundingClientRect();
                    return Math.abs(first.top - second.top) < 1 && second.left > first.left;
                })()`)) &&
                (await cdp.evaluate(
                    `document.querySelector('.ocr-card .school-row input').value`,
                )) === '0',
        );
        await checkCardFits('师门');
        await ui.clickText('.ocr-tabs .step-opt', '修炼', { exact: true });
        await ui.fillSel('.ocr-card input[aria-label="攻击修炼 等级"]', '19');
        await cdp.key('Enter');
        await ui.fillSel('.ocr-card input[aria-label="攻击修炼 等级"]', '0');
        await cdp.key('Enter');
        t.check(
            '修炼固定十项只修改等级，不提供删除按钮，两组并排',
            (await ui.count('.ocr-card .training-list input')) === 10 &&
                (await ui.count('.ocr-card .pane button')) === 0 &&
                (await cdp.evaluate(`(() => {
                    const groups = [...document.querySelectorAll('.ocr-card .training-col')];
                    const first = groups[0].getBoundingClientRect();
                    const second = groups[1].getBoundingClientRect();
                    return Math.abs(first.top - second.top) < 1 && second.left > first.left;
                })()`)),
        );
        await checkCardFits('修炼');
        t.check(
            '修炼可直接把等级改为 0',
            (await cdp.evaluate(
                `document.querySelector('.ocr-card input[aria-label="攻击修炼 等级"]').value`,
            )) === '0',
        );
        await ui.clickText('.ocr-tabs .step-opt', '辅助', { exact: true });
        await checkCardFits('辅助');
        t.check(
            '辅助两组的添加按钮统一为新增并保留图标',
            await cdp.evaluate(`(() => {
                const buttons = [...document.querySelectorAll('.ocr-card .assist-add')];
                return buttons.length === 2 && buttons.every((button) =>
                    button.textContent.trim() === '新增' && button.querySelector('svg'));
            })()`),
        );
        const rowCount = await ui.count('.ocr-card .assist-group .slip-row');
        await ui.clickLabel('新增生活技能');
        t.check(
            '新增辅助技能默认等级为 0，编辑态仍一行两个',
            await cdp.evaluate(`(() => {
                const rows = [...document.querySelectorAll('.ocr-card .assist-group:first-child .slip-row')];
                const first = rows[0].getBoundingClientRect();
                const second = rows[1].getBoundingClientRect();
                return rows.at(-1).querySelector('input').value === '0' &&
                    Math.abs(first.top - second.top) < 1 && second.left > first.left;
            })()`),
        );
        await cdp.click(
            '.ocr-card .assist-group:first-child .slip-row:last-child [role="combobox"]',
        );
        await cdp.key('Enter');
        const added = await ui.text(
            '.ocr-card .assist-group:first-child .slip-row:last-child .select-text',
        );
        await ui.fillSel('.ocr-card .assist-group:first-child .slip-row:last-child input', '33');
        await cdp.key('Enter');
        t.check(
            '辅助可新增技能并直接改等级',
            added.length > 0 &&
                (await ui.count('.ocr-card .assist-group .slip-row')) === rowCount + 1 &&
                (await cdp.evaluate(
                    `document.querySelector('.ocr-card .assist-group:first-child .slip-row:last-child input').value`,
                )) === '33',
        );
        await cdp.key('Tab');
        await cdp.key('Enter');
        t.check(
            '辅助新增行可用键盘删除',
            (await ui.count('.ocr-card .assist-group .slip-row')) === rowCount,
        );
        await ui.clickText('.ocr-tabs .step-opt', '属性', { exact: true });
        t.check(
            '跨分区切回仍保留卡头补录、潜能与属性清空',
            await cdp.evaluate(`document.querySelector('.ocr-card input[aria-label="角色名"]').value === 'E2E截图草稿' &&
                document.querySelector('.ocr-card input[aria-label="角色帮派"]').value === '草稿帮派' &&
                document.querySelector('.ocr-card input[aria-label="乾元丹"]').value === '3' &&
                document.querySelector('.ocr-card input[aria-label="气血"]').value === ''`),
        );
        await ui.clickText('.modal-panel button', '取消', { exact: true });
        await ui.waitFor(`!document.querySelector('.ocr')`);
        t.check(
            '取消不修改真实角色',
            JSON.stringify(await readCharacter()) === JSON.stringify(before),
        );

        // 只有删除也能应用，持久化后再恢复本节前置数据。
        await ui.clickIn('.roster .char', 'E2E改名后', { text: '辅助' });
        await ui.clickIn('.roster .char', 'E2E改名后', { label: '编辑这个角色' });
        await ui.waitFor(`!!document.querySelector('.ocr')`);
        await ui.clickLabel('删除强身术');
        await ui.clickText('.modal-panel button', '保存');
        await ui.waitFor(`!document.querySelector('.ocr')`);
        await ui.reload();
        await ui.waitText('E2E改名后');
        const kept = await readCharacter();
        t.check(
            '无截图、仅删除技能也可保存，重载后删除生效',
            !kept.assists.some((row) => row.name === '强身术') &&
                kept.assists.length === before.assists.length - 1,
        );
        await cdp.evaluate(`(async () => {
            const { useRoster } = await ${importLoaded('/src/views/characters/roster.ts')};
            const roster = useRoster();
            roster.update(${JSON.stringify(before)});
            if (!(await roster.flush())) throw new Error('截图草稿烟测恢复失败');
        })()`);
    });

    await t.step('连续换图：停用旧结果，最新图先返回也不被旧请求覆盖', async () => {
        await ui.clickIn('.roster .char', 'E2E改名后', { text: '属性' });
        await ui.clickIn('.roster .char', 'E2E改名后', { label: '编辑这个角色' });
        const paste = () =>
            cdp.evaluate(`(async () => {
            const canvas = document.createElement('canvas');
            canvas.width = 300; canvas.height = 100;
            canvas.getContext('2d').fillText('气血', 10, 30);
            const blob = await new Promise((resolve) => canvas.toBlob(resolve));
            const transfer = new DataTransfer();
            transfer.items.add(new File([blob], 'panel.png', { type: 'image/png' }));
            document.dispatchEvent(new ClipboardEvent('paste', { clipboardData: transfer, bubbles: true }));
        })()`);
        const resolveImage = (index, hp) =>
            cdp.evaluate(`window.__e2eOcrRequests[${index}]([
            { text: '气血', x: 0, y: 0, width: 40, height: 20, score: 1 },
            { text: '${hp}', x: 60, y: 0, width: 60, height: 20, score: 1 }
        ])`);
        await cdp.evaluate(`(async () => {
            const { commands } = await ${importLoaded('/src/services/bindings.ts')};
            window.__e2eOcr = commands.ocrFrame;
            window.__e2eOcrRequests = [];
            commands.ocrFrame = () => new Promise((resolve) => window.__e2eOcrRequests.push(resolve));
        })()`);
        try {
            await paste();
            await ui.waitFor('window.__e2eOcrRequests.length === 1');
            await resolveImage(0, 7001);
            await ui.waitFor(`!document.querySelector('.ocr-standard .upload-busy')`);
            await paste();
            await ui.waitFor('window.__e2eOcrRequests.length === 2');
            t.check(
                '换图识别时应用按钮禁用',
                await cdp.evaluate(
                    `[...document.querySelectorAll('.modal-panel button')].find((one) => one.textContent.includes('保存'))?.disabled === true`,
                ),
            );
            await paste();
            await ui.waitFor('window.__e2eOcrRequests.length === 3');
            await resolveImage(2, 7003);
            await ui.waitFor(`!document.querySelector('.ocr-standard .upload-busy')`);
            await resolveImage(1, 7002);
            await sleep(100);
            t.check(
                '最新图的 7003 保留在预览上',
                (await ui.text('.ocr-card')).includes('7003') ||
                    (await cdp.evaluate(
                        `[...document.querySelectorAll('.ocr-card input')].some((one) => one.value === '7003')`,
                    )),
            );
            await ui.clickText('.modal-panel button', '保存');
            await ui.waitFor(`!document.querySelector('.ocr')`);
        } finally {
            await cdp.evaluate(`(async () => {
                const { commands } = await ${importLoaded('/src/services/bindings.ts')};
                commands.ocrFrame = window.__e2eOcr;
                delete window.__e2eOcr; delete window.__e2eOcrRequests;
            })()`);
        }
        await ui.reload();
        await ui.waitText('E2E改名后');
        await ui.clickIn('.roster .char', 'E2E改名后', { text: '属性' });
        const card = await ui.text('.roster');
        t.check(
            '最新 OCR 结果写库，重载后仍是 7003',
            card.includes('7003') && !card.includes('7002'),
        );
    });
}
