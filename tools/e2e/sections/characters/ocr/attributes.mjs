import { checkButtonTheme } from '../theme.mjs';

export async function attributes(ctx) {
    const { cdp, ui, t, sleep } = ctx;
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
        t.check('未上传且无状态时不留空底栏', (await ui.count('.ocr-standard .upload-bar')) === 0);

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

        const attrInput = '.ocr-card input[aria-label="气血"]';
        const originalHealth = await cdp.evaluate(
            `document.querySelector(${JSON.stringify(attrInput)}).value`,
        );
        await ui.fillSel(attrInput, originalHealth === '12345' ? '12346' : '12345');
        t.check(
            '属性仍在输入时保存立即启用，无需失焦或按 Enter',
            await cdp.evaluate(`document.activeElement?.matches(${JSON.stringify(attrInput)}) &&
                !document.querySelector('button[aria-label="保存这个角色"]').disabled`),
        );
        await ui.fillSel(attrInput, originalHealth);
        t.check(
            '属性改回原值即恢复未修改状态',
            await cdp.evaluate(
                `document.querySelector('button[aria-label="保存这个角色"]').disabled`,
            ),
        );

        await ui.clickText('.ocr-tabs button', '装备', { exact: true });
        /* 在装备页粘人物属性图，验证专用上传入口也能自动分流。
         * 派发一次真正的 paste（带一个 PNG File），与用户按 Ctrl+V 走同一条路：
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
        await cdp.waitFor(`!!document.querySelector('.ocr-report')`);
        t.check(
            '识别后展示逐图变更与待核对摘要',
            (await ui.text('.ocr-summary')).includes('panel.png') &&
                (await ui.text('.ocr-summary-live')).includes('修改'),
        );
        await cdp.click('.ocr-report summary');
        t.check(
            '展开摘要可查看旧值到新值',
            (await ui.count('.ocr-changes dd')) > 0 &&
                (await ui.text('.ocr-changes')).includes('→'),
        );
        t.check(
            '跨分区截图自动切回属性并填写',
            await cdp.evaluate(`document.querySelector('.ocr-tabs [aria-checked="true"]')?.textContent.trim() === '属性' &&
                document.querySelector('.ocr-card input[aria-label="气血"]')?.value === '3916'`),
        );
        await ui.clickText('.ocr-tabs button', '修炼', { exact: true });
        await sleep(300);
        t.check(
            '手工切换不会再次识别旧图或跳回属性',
            await cdp.evaluate(`document.querySelector('.ocr-tabs [aria-checked="true"]')?.textContent.trim() === '修炼' &&
                !document.querySelector('.ocr-standard .upload-busy')`),
        );
        await ui.clickText('.ocr-tabs button', '属性', { exact: true });
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
}
