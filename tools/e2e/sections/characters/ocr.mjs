export async function ocr(ctx) {
    const { cdp, ui, t, sleep } = ctx;
    /* ---- 截图识别（2026-11-07）----
     * 真跑一遍：点卡头那枚 → 粘一张**现画的**面板 → 认出字段 → 应用到这张卡 →
     * 卡上变了 → 重载后还在。
     *
     * 图是 `canvas` 现画的，不往仓库里塞游戏截图：那既是用户的数据，也会因为
     * 换分辨率而让断言时红时绿。画布上的字是微软雅黑 22px，PP-OCRv4 读得出来
     * （实测 10/10 行全对），于是这条链的每一段都被真的走过一遍——
     * 粘贴事件、canvas 取像素、IPC 传 1MB 裸像素、模型推理、解析、写库。
     *
     * 画的字段刻意**不含名称**：名称是后面几步用来定位这张卡的（`clickIn` 按文字找），
     * 改名会把后面的断言全打断。等级画 69 而不是 175——下面召唤兽那条要验
     * 「参战 145 等级不够、签转朱」，等级填高了那条就永远不成立。 */
    await t.step('截图识别：粘一张合成面板 → 认出字段 → 写进卡', async () => {
        await ui.clickIn('.roster .char', 'E2E改名后', { label: '截图识别这个角色' });
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
            '分区是属性 / 师门两格',
            rail.labels.join('/') === '属性/师门',
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

        const empty = await ui.text('.ocr-shot');
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
            foot.buttons === 2 && foot.text === '取消 应用到这张卡',
            JSON.stringify(foot),
        );

        /* 派发一次真正的 paste（带一个 PNG File），与用户按 Ctrl+V 走同一条路：
         * 组件监听的是 `document` 的 paste，从 `clipboardData.items` 里取图。 */
        await cdp.evaluate(`(async () => {
                const canvas = document.createElement('canvas');
                canvas.width = 360;
                canvas.height = 300;
                const ctx = canvas.getContext('2d');
                ctx.fillStyle = '#1c1a12';
                ctx.fillRect(0, 0, canvas.width, canvas.height);
                ctx.fillStyle = '#f3ead6';
                ctx.font = '600 22px "Microsoft YaHei", sans-serif';
                ctx.textBaseline = 'top';
                /* 七行：前五行验常规项，末两行验**经验的单位**（面板给八位数，
                 * 卡上要变成「万」）。分成两行写，是因为一行塞「39686092/14142174」
                 * 在 360 宽里会被画布右缘吃掉一截。 */
                const rows = [
                    ['等级', '69'],
                    ['门派', '五庄观'],
                    ['气血', '3916/3916'],
                    ['人气', '757'],
                    ['命中', '1000'],
                    ['经验', '39686092'],
                    ['升级经验', '14142174'],
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
            `!!document.querySelector('.ocr-count') && !document.querySelector('.shot-busy')`,
            { timeout: 40000 },
        );
        t.check('粘完就开始认，认完报出认出几项', ready);
        const complaint = await cdp.evaluate(
            `document.querySelector('.ocr .note.error')?.textContent.trim() ?? ''`,
        );
        t.check('识别没报错', complaint === '', complaint);

        const cells = await ui.count('.ocr-card .attr-field');
        t.check('卡上二十格都成了可改的格', cells === 20, `实际 ${cells} 格`);
        t.check('左栏不再排输入格', (await ui.count('.ocr-fields')) === 0);

        /* 「识别中…」那层蒙版必须跟着撤掉。它单看起来只是块半透明纸，
         * 但真停在那儿，用户会以为还在算、于是一直等。 */
        t.check('识别完就撤掉「识别中」', (await ui.count('.shot-busy')) === 0);

        const shot = await cdp.evaluate(`(() => {
                const card = document.querySelector('.ocr-card');
                const dialog = card.closest('[role="dialog"]');
                const values = {};
                for (const input of card.querySelectorAll('.attr-field')) {
                    values[input.getAttribute('aria-label')] = input.value;
                }
                return {
                    values,
                    level: card.querySelector('.char-head .lv')?.textContent.trim() ?? '',
                    school: card.querySelector('.char-head .chip')?.textContent.trim() ?? '',
                    rawOpen: dialog?.querySelector('.ocr-raw-box')?.open ?? null,
                    rawHead: dialog?.querySelector('.ocr-raw-box summary')?.textContent.trim() ?? '',
                };
            })()`);
        t.check('卡头等级认出 69', shot.level === '69 级', shot.level);
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

        /* 在卡上直接改两个数：`ok` 的那项改成 1250，`miss` 的那项填成 2170。
         * 第二条才是这个布局的**真正考点**——`miss` 的原值被 `applyAttrPanel`
         * 整项跳过，不翻成 `ok` 的话，用户填完点应用会发现「改了没用」。 */
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

        await ui.clickText('[role="dialog"] button', '应用到这张卡');
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

    /* ---- 截图识别：师门技能（2026-11-07 第二批）----
     * 师门面板有两种皮肤，识别走两条路：深蓝那张**有技能名**（按名字认），
     * 米黄那张**只有图标 + 等级**（按图案认，`matcher.ts`）。
     *
     * 这一步专门走难的那条：合成图里**一个技能名都不画**，只画七枚真图标与
     * 七个等级数字，逼它去做图案比对。图的顺序还特意打乱——实测两张真截图的
     * 格子顺序与技能表顺序本来就不一样，按位置套会全错且不报错。
     *
     * 图标直接从 `game-icons` 取（就是卡上渲染的那几张），所以这一步同时守着
     * 「图标库 → 比对 → 写回」这条链的完整性；真图能不能认，由两张实际截图
     * 手工验过（记录在 `docs/RECORD.md` 第 140 批）。
     */
    await t.step('截图识别：师门面板按图标认七项 → 写进卡 → 重载还在', async () => {
        await ui.clickIn('.roster .char', 'E2E改名后', { label: '截图识别这个角色' });
        if (!(await ui.waitFor(`!!document.querySelector('.ocr')`, { timeout: 3000 }))) {
            throw new Error('识别弹窗没打开');
        }

        const opts = await cdp.evaluate(
            `[...document.querySelectorAll('.ocr-tabs .step-opt')]
                    .map((b) => ({ t: b.textContent.trim(), d: b.disabled }))`,
        );
        t.check(
            '分区两格都能点（师门不再是占位）',
            opts.map((one) => one.t).join('/') === '属性/师门' && opts.every((one) => !one.d),
            JSON.stringify(opts),
        );
        await ui.clickText('.ocr-tabs .step-opt', '师门', { exact: true });
        await sleep(300);
        t.check(
            '预览卡跟着翻到师门页',
            (await ui.text('.ocr-card')).includes('门派技能'),
            await ui.text('.ocr-card'),
        );

        /* 七项名字与它们的图标：名字按门派表取，图标路径走 `schoolSkillIcon`
         * （**不按下标拼**——图标序号是面板顺序，与技能表顺序不同）。 */
        const seven = await cdp.evaluate(`(async () => {
                const gi = await import('/src/services/game-icons.ts');
                const sc = await import('/src/views/characters/schools.ts');
                return sc.schoolSkillNames('五庄观').map((name) => ({
                    name,
                    url: gi.schoolSkillIcon(name),
                }));
            })()`);
        t.check(
            '五庄观七项都查得到图标',
            Array.isArray(seven) && seven.length === 7 && seven.every((one) => one.url),
            JSON.stringify(seven.map((one) => one.name)),
        );

        /* 打乱的顺序 + 逐格不同的等级：位置与名字脱钩，靠位置推必错。 */
        const ORDER = [2, 0, 4, 1, 6, 3, 5];
        const LEVELS = [120, 115, 60, 120, 90, 90, 60];

        await cdp.evaluate(`(async () => {
                const items = ${JSON.stringify(seven)};
                const order = ${JSON.stringify(ORDER)};
                const levels = ${JSON.stringify(LEVELS)};
                const CELL = 104;
                const COLS = 3;
                const canvas = document.createElement('canvas');
                canvas.width = CELL * COLS;
                canvas.height = CELL * COLS;
                const ctx = canvas.getContext('2d');
                ctx.fillStyle = '#1c1a12';
                ctx.fillRect(0, 0, canvas.width, canvas.height);

                const images = await Promise.all(items.map((one) => new Promise((done) => {
                    const img = new Image();
                    img.onload = () => done(img);
                    img.onerror = () => done(null);
                    img.src = one.url;
                })));

                ctx.fillStyle = '#f3ead6';
                ctx.font = '600 22px "Microsoft YaHei", sans-serif';
                ctx.textBaseline = 'top';
                order.forEach((pick, index) => {
                    const x = (index % COLS) * CELL;
                    const y = Math.floor(index / COLS) * CELL;
                    const img = images[pick];
                    if (img) ctx.drawImage(img, x + 24, y + 10, 56, 56);
                    /* 等级画在图标**正下方**：两张真截图都长这样（深蓝那版是
                     * 「名字 / 等级」两行，米黄那版是「图标 / 等级」）。 */
                    ctx.fillText(String(levels[index]), x + 26, y + 72);
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

        /* 卡上的值 = 那一格图标对应的技能。名字与值的对应关系从页面里取，
         * 不在这里重抄一遍七项技能名。 */
        const placed = await cdp.evaluate(`(() => {
                const rows = [...document.querySelectorAll('.ocr-card .school-row')];
                return rows.map((row) => ({
                    name: row.querySelector('.slip-name')?.textContent.trim() ?? '',
                    value: row.querySelector('input')?.value ?? '',
                }));
            })()`);
        const expectLevels = Object.fromEntries(
            ORDER.map((pick, index) => [seven[pick].name, String(LEVELS[index])]),
        );
        const wrong = placed.filter((row) => expectLevels[row.name] !== row.value);
        t.check(
            '图案认出来的名字与等级都对（顺序打乱也不串）',
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

        await ui.clickText('[role="dialog"] button', '应用到这张卡');
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

    await t.step('连续换图：停用旧结果，最新图先返回也不被旧请求覆盖', async () => {
        await ui.clickIn('.roster .char', 'E2E改名后', { label: '截图识别这个角色' });
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
            const { commands } = await import('/src/services/bindings.ts');
            window.__e2eOcr = commands.ocrFrame;
            window.__e2eOcrRequests = [];
            commands.ocrFrame = () => new Promise((resolve) => window.__e2eOcrRequests.push(resolve));
        })()`);
        try {
            await paste();
            await ui.waitFor('window.__e2eOcrRequests.length === 1');
            await resolveImage(0, 7001);
            await ui.waitFor(`!document.querySelector('.shot-busy')`);
            await paste();
            await ui.waitFor('window.__e2eOcrRequests.length === 2');
            t.check(
                '换图识别时应用按钮禁用',
                await cdp.evaluate(
                    `[...document.querySelectorAll('.modal-panel button')].find((one) => one.textContent.includes('应用到这张卡'))?.disabled === true`,
                ),
            );
            await paste();
            await ui.waitFor('window.__e2eOcrRequests.length === 3');
            await resolveImage(2, 7003);
            await ui.waitFor(`!document.querySelector('.shot-busy')`);
            await resolveImage(1, 7002);
            await sleep(100);
            t.check(
                '最新图的 7003 保留在预览上',
                (await ui.text('.ocr-card')).includes('7003') ||
                    (await cdp.evaluate(
                        `[...document.querySelectorAll('.ocr-card input')].some((one) => one.value === '7003')`,
                    )),
            );
            await ui.clickText('.modal-panel button', '应用到这张卡');
            await ui.waitFor(`!document.querySelector('.ocr')`);
        } finally {
            await cdp.evaluate(`(async () => {
                const { commands } = await import('/src/services/bindings.ts');
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
