import { CONFIRM_DELETE } from './shared.mjs';

/* ============================ 2. 角色 ============================ */

export default async function run(ctx) {
    const { cdp, ui, t, want, sleep, baseline } = ctx;

    if (want('角色')) {
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

            await ui.clickText('.editor-tabs button', '师门');
            await sleep(300);
            const paneShown = await cdp.evaluate(`(() => {
                const pane = document.querySelector('#editor-pane-skills');
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
            await ui.fill('角色名', 'E2E改名后');
            await ui.clickLabel('保存这个角色');
            await sleep(600);
            t.check('改名生效', (await ui.text()).includes('E2E改名后'));
        });

        /* ---- 装备编辑：十二个部位常驻左栏（2026-11-05，方案 E2） ----
         * 这一节以前是空的：装备整条路径一条断言都没有。改版之后交互全换了
         * （十二行折叠 → 左栏目录 + 右侧详情），所以钉住三件事：十二格在不在、
         * 点一格右侧是否跟着换、填进去的名字保存后是否落到卡上。
         *
         * **只填「装备名」、不填全名**——这是最常见的一种录法，也是判据最容易写错的一处：
         * 卡上「有没有这件」认的是 `detail` 或 `caption`，任一边漏了，名字就会存着却看不见。 */
        await t.step('装备：左栏十二格，选中即编，保存后上卡', async () => {
            await ui.clickIn('.roster .char', 'E2E改名后', { label: '编辑这个角色' });
            if (!(await ui.waitFor(`!!document.querySelector('.editor')`, { timeout: 3000 }))) {
                throw new Error('编辑态没打开');
            }
            await ui.clickText('.editor-tabs button', '装备');
            await sleep(300);

            const rails = await ui.count('.editor .rail-item');
            t.check('左栏十二个部位', rails === 12, `实际 ${rails}`);

            // 空白折叠在两个空格之间可能变成一个换行，比之前先压平。
            const head = async () =>
                (await ui.text('.editor .rail-head')).replace(/\s+/g, ' ').trim();
            t.check('顶端计数从 0 起', (await head()).includes('0 / 12'), await head());

            /* 换部位**不改变页面高度**（这是 E2 与折叠列表最大的差别），所以判据只能读右侧
             * 标题，不能像以前那样靠「内容变长了」。 */
            await ui.clickText('.editor .rail-item', '武器');
            await sleep(250);
            const heading = await cdp.evaluate(
                `document.querySelector('.editor .det-title b')?.textContent?.trim() ?? ''`,
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

        /* ---- 左栏那枚 ×（2026-11-06）----
         * 两页同一个位置、同一个符号，**动作不是一回事**：装备是「清空这一件」
         * （十二个部位是游戏定的，行不能少），召唤兽才是「真的删掉这一只」。
         * 所以这里先验清空：行数一点不变、计数归零、× 自己消失。 */
        await t.step('装备：左栏 × 只清空这一件，十二格一行不少', async () => {
            await ui.clickIn('.roster .char', 'E2E改名后', { label: '编辑这个角色' });
            if (!(await ui.waitFor(`!!document.querySelector('.editor')`, { timeout: 3000 }))) {
                throw new Error('编辑态没打开');
            }
            await ui.clickText('.editor-tabs button', '装备');
            await sleep(300);

            /* × 只在**填了的部位**上出现：十二行里只有武器有内容。 */
            const kills = await ui.count('.editor .rail-kill');
            t.check('只有填了的那一件有 ×', kills === 1, `实际 ${kills} 枚`);

            await ui.clickLabelPrefix('清空武器');
            await sleep(350);

            const rows = await ui.count('.editor .rail-item');
            t.check('清空后十二行一行不少', rows === 12, `实际 ${rows} 行`);
            const head = (await ui.text('.editor .rail-head')).replace(/\s+/g, ' ').trim();
            t.check('清空后计数归零', head.includes('0 / 12'), head);
            t.check(
                '清空后 × 自己消失',
                (await ui.count('.editor .rail-kill')) === 0,
                `还剩 ${await ui.count('.editor .rail-kill')} 枚`,
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
            t.check(
                '命中认出 1000',
                shot.values['命中'] === '1000',
                `实际「${shot.values['命中']}」`,
            );
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
            t.check(
                '卡上填的魔法写进去了（miss 也生效）',
                card.magic === '2170',
                JSON.stringify(card),
            );
            t.check('卡上改的命中写进去了', card.hit === '1250', JSON.stringify(card));
            t.check(
                '经验落到卡上也是万',
                card.exp === '3968.6万 / 1414.2万',
                JSON.stringify(card.exp),
            );

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
                Array.isArray(opts) &&
                    opts.map((one) => one.t).join('/') === '属性/师门' &&
                    opts.every((one) => !one.d),
                JSON.stringify(opts),
            );

            await cdp.evaluate(
                `[...document.querySelectorAll('.ocr-tabs .step-opt')]
                    .find((b) => b.textContent.trim() === '师门').click()`,
            );
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
            await cdp.evaluate(
                `[...(document.querySelector('.roster .char')?.querySelectorAll('.tabs .step-opt') ?? [])]
                    .find((b) => b.textContent.trim() === '师门')?.click()`,
            );
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
            await cdp.evaluate(
                `[...(document.querySelector('.roster .char')?.querySelectorAll('.tabs .step-opt') ?? [])]
                    .find((b) => b.textContent.trim() === '师门')?.click()`,
            );
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

        /* ---- 召唤兽：概览牌 + 详情档案（2026-11-05） ----
         * 这一节以前一条断言都没有：卡上只画「名字 · 等级 · 参战」，而这三个数在名册里
         * 从来没被验过——练到哪一步、资质多少，全都只在编辑弹窗里能看见。
         * 现在卡上是一块**兽牌**（五格战斗属性 + 技能名），点开是一张 600 宽的**详情档案**
         * （资质六票 / 属性八行 / 技能 12 格 / 内丹 8 格）。两条路径都进断言。
         *
         * 只填 4 个字段（名 / 等级 / 参战 / 技能）就够验完整条链：五格属性靠的是
         * `attrs` 数组，它空着时该画五枚淡「—」，那也是一种要被验的状态。 */
        await t.step('召唤兽：加一只 → 概览牌 → 详情窗 → Esc', async () => {
            await ui.clickIn('.roster .char', 'E2E改名后', { label: '编辑这个角色' });
            if (!(await ui.waitFor(`!!document.querySelector('.editor')`, { timeout: 3000 }))) {
                throw new Error('编辑态没打开');
            }
            await ui.clickText('.editor-tabs button', '召唤兽');
            await sleep(300);
            await ui.clickLabel('加一只召唤兽');
            await sleep(250);

            /* 编辑页 2026-11-05 改成左栏目录（方案 P3）：加一只之后左栏应有一行，
             * 而右侧只渲染**选中那一只**的表单——旧版是一只一行、一次展开一只。
             * 两条一起验，才能区分「结构换了」与「只是换了个样式」。 */
            const railItems = await ui.count('.pet-editor .rail-item');
            t.check('编辑页左栏列出全部召唤兽', railItems === 1, `实际 ${railItems} 行`);
            const nameInputs = await ui.count('.pet-block input[aria-label="召唤兽名称"]');
            t.check('右侧只渲染选中那一只', nameInputs === 1, `实际 ${nameInputs} 个名字框`);

            /* 选择器必须带 `.pet-block`：`等级` 这个 aria-label 在编辑器里不止一处
             * （角色自己也有一格），`ui.fill()` 只取文档里第一个匹配。 */
            await ui.fillSel('.pet-block input[aria-label="召唤兽名称"]', 'E2E兽');
            await ui.fillSel('.pet-block input[aria-label="等级"]', '120');
            await ui.fillSel('.pet-block input[aria-label="参战等级"]', '145');
            // 技能是 textarea + `@change`（失焦才解析），所以下面那一记点击同时起「失焦」作用。
            await ui.fillSel(
                '.pet-block textarea[aria-label="已学技能，顿号或逗号分隔"]',
                '连击、必杀',
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
            t.check('一块牌五格战斗属性', stats === 5, `实际 ${stats} 格`);

            const names = await inCard(
                `(card.querySelector('.plate .skill-line .names')?.textContent || '')`,
            );
            t.check(
                '技能行列出已学的名字',
                names.includes('连击') && names.includes('必杀'),
                `实际：${names}`,
            );

            // 参战 145 对一个人物等级很低的角色：签要转朱并报差额。
            const short = await inCard(`!!card.querySelector('.plate .join.short')`);
            t.check('参战不够时签转朱', short);

            await ui.clickIn('.roster .char', 'E2E兽', { label: '查看 E2E兽 的详情' });
            if (
                !(await ui.waitFor(`!!document.querySelector('[role="dialog"]')`, {
                    timeout: 3000,
                }))
            ) {
                throw new Error('详情窗没打开');
            }
            const slots = await ui.count('[role="dialog"] .slot');
            t.check('详情窗画出 20 格（技能 12 + 内丹 8）', slots === 20, `实际 ${slots} 格`);

            const filled = await ui.count('[role="dialog"] .slot:not(.off)');
            t.check('其中 2 格是学了的技能', filled === 2, `实际 ${filled} 格`);

            /* 两列的先后是用户定的（2026-11-05）：左战斗属性、右资质。
             * 读 DOM 里两个分栏名的顺序，不读样式——「换个位置」换的就是这个顺序。 */
            const colHeads = await cdp.evaluate(
                `[...document.querySelectorAll('[role="dialog"] .pet-cols .group-head')]
                    .map((e) => e.textContent.trim())`,
            );
            t.check(
                '详情两列：左战斗属性、右资质',
                colHeads[0] === '战斗属性' && colHeads[1] === '资质',
                `实际：${colHeads.join(' / ')}`,
            );

            // Esc 只关这一层（`use-modal` 的冒泡口径），卡片本身不动。
            await cdp.key('Escape');
            await sleep(300);
            t.check('Esc 关掉详情窗', !(await ui.exists('[role="dialog"]')));
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
        });

        /* 快速修改：卡上点哪一项，就只改哪一项（2026-11-07）。
         *
         * 四个入口各走一遍——属性行、师门行、装备格、召唤兽详情页脚。它们共用一个
         * 小窗与同一条写入路径（`update()`），但入口分别长在四个分区里，任何一处
         * 忘了接 `@click`，这一节都会红。
         *
         * 放在「删兽」之前：兽还在，才能验「详情 → 修改」那一步。 */
        await t.step('快速修改：点一行 / 一格，只改这一项', async () => {
            /* 只在这一张卡里找。名册并排两三张，文档级的 `.slip-row` 会抓到别人的行，
             * 点下去改的是另一张卡（那条坑在「召唤兽」那一节已经踩过一次）。 */
            const inCard = (expr) =>
                cdp.evaluate(`(() => {
                    const card = [...document.querySelectorAll('.roster .char')]
                        .find((c) => (c.textContent || '').includes('E2E改名后'));
                    return card ? ${expr} : null;
                })()`);

            const clickRow = (label) =>
                inCard(`(() => {
                    const row = [...card.querySelectorAll('.slip-row')]
                        .find((r) => (r.textContent || '').trim().startsWith(${JSON.stringify(label)}));
                    if (!row) return false;
                    row.click();
                    return true;
                })()`);

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
                await ui.clickText('.modal-panel button', '保存');
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
            t.check(
                '小窗只写这一项',
                (await dialogTitle()) === '快速修改 · 气血',
                await dialogTitle(),
            );

            /* 加减印块：气血是四位数，步长按量级走（±100）。
             * 用「相对差」而不是写死 4016——前面几条 step 改过这一格的值，
             * 写死一个数会在别处一改就红，而红的原因与加减无关。 */
            const beforeStep = Number(
                await cdp.evaluate(`document.querySelector('.modal-panel .cf-input').value`),
            );
            await ui.clickLabel('加 100');
            await sleep(150);
            const afterAdd = Number(
                await cdp.evaluate(`document.querySelector('.modal-panel .cf-input').value`),
            );
            await ui.clickLabel('减 100');
            await sleep(150);
            const afterSub = Number(
                await cdp.evaluate(`document.querySelector('.modal-panel .cf-input').value`),
            );
            t.check(
                '加号按一下动 100',
                afterAdd - beforeStep === 100,
                `${beforeStep} → ${afterAdd}`,
            );
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
            const skillClicked = await inCard(`(() => {
                const row = card.querySelector('.school-row');
                if (!row) return false;
                row.click();
                return true;
            })()`);
            t.check('技能行点得动', skillClicked === true);
            await ui.waitFor(`!!document.querySelector('.modal-panel')`, { timeout: 3000 });
            t.check(
                '小窗标题带着技能名',
                (await dialogTitle()) === `快速修改 · ${skillName}`,
                await dialogTitle(),
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

            // ---- ③ 装备格 ----
            await ui.clickIn('.roster .char', 'E2E改名后', { text: '装备' });
            await sleep(280);
            /* 空位也要能点：新角色十二格全是空的，而那正是最想填的一格。
             * 点「头」那一格（按部位名找，不按 index——版式表随时可能调）。 */
            const gearClicked = await inCard(`(() => {
                const cell = [...card.querySelectorAll('.gear-cell')]
                    .find((c) => (c.querySelector('.gear-part')?.textContent || '') === '头');
                if (!cell) return false;
                cell.click();
                return true;
            })()`);
            t.check('空装备格也点得动', gearClicked === true);
            await ui.waitFor(`!!document.querySelector('.modal-panel')`, { timeout: 3000 });
            t.check(
                '小窗标题写着部位',
                (await dialogTitle()) === '快速修改 · 头',
                await dialogTitle(),
            );
            /* 这一版是**整份表单**，不是四格：属性 / 状态 / 特殊三段都要在。
             * 上一版只有「装备名 / 类型 / 段数 / 宝石」，用户的评价是「太简单了」。 */
            const gearSections = await cdp.evaluate(
                `[...document.querySelectorAll('.modal-panel .sec-head')]
                    .map((s) => s.textContent.replace(/\\s+/g, ' ').trim())`,
            );
            t.check(
                '装备窗里是整份表单（属性 / 状态 / 特殊三段都在）',
                gearSections.length === 3 &&
                    gearSections[0].startsWith('属性') &&
                    gearSections[1].startsWith('状态') &&
                    gearSections[2].startsWith('特殊'),
                JSON.stringify(gearSections),
            );
            /* 加一条状态再填——验的是「整份表单能加行」，这是四个格子给不了的。 */
            await ui.clickLabel('加一条状态');
            await sleep(160);
            await fillField('状态名', '锻炼等级');
            await fillField('状态值', '5');
            await fillField('头 的装备名', 'E2E头');
            t.check('装备名与状态都存下去了', await saveDialog());
            const gearName = await inCard(`(() => {
                const cell = [...card.querySelectorAll('.gear-cell')]
                    .find((c) => (c.querySelector('.gear-part')?.textContent || '') === '头');
                return (cell?.querySelector('.gear-name')?.textContent || '').trim();
            })()`);
            t.check('卡上那一格写上 E2E头', gearName === 'E2E头', gearName);

            // ---- ④ 召唤兽：详情 → 修改 ----
            await ui.clickIn('.roster .char', 'E2E改名后', { text: '召唤兽' });
            await sleep(280);
            await ui.clickIn('.roster .char', 'E2E改名后', { label: '查看 E2E兽 的详情' });
            await ui.waitFor(`!!document.querySelector('.modal-panel')`, { timeout: 3000 });
            await sleep(200);
            await ui.clickText('.modal-panel button', '修改');
            const toQuick = await ui.waitFor(
                `(document.querySelector('.modal-head h2')?.textContent || '').includes('快速修改')`,
                { timeout: 3000 },
            );
            t.check('详情页脚那枚「修改」进到快速修改', toQuick, await dialogTitle());
            /* 整份表单：身份七格 + 资质六格 + 技能与内丹两栏。上一版只有身份那六格，
             * 资质 / 技能 / 内丹全在「编辑」那份表单里——用户点开一只兽想看的正是它们。 */
            const petLayout = await cdp.evaluate(`(() => ({
                idCells: document.querySelectorAll('.modal-panel .id7 .id-cell').length,
                quality: document.querySelectorAll('.modal-panel .q6 .q-cell').length,
                lists: document.querySelectorAll('.modal-panel .list-block').length,
            }))()`);
            t.check(
                '兽窗里有身份七格 / 资质六格 / 技能与内丹两栏',
                petLayout.idCells === 7 && petLayout.quality === 6 && petLayout.lists === 2,
                JSON.stringify(petLayout),
            );
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
            t.check(
                '重载后气血还是 4200',
                (await readRow('气血')) === '4200',
                await readRow('气血'),
            );
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
        });

        /* 召唤兽的 × 与装备那枚**不是同一个动作**：这里是真的把这一只移出列表
         * （装备那边只是清空内容，行还在）。所以判据是「行没了」，不是「行空了」。 */
        await t.step('召唤兽：左栏 × 真的删掉这一只', async () => {
            await ui.clickIn('.roster .char', 'E2E改名后', { label: '编辑这个角色' });
            if (!(await ui.waitFor(`!!document.querySelector('.editor')`, { timeout: 3000 }))) {
                throw new Error('编辑态没打开');
            }
            await ui.clickText('.editor-tabs button', '召唤兽');
            await sleep(300);
            t.check(
                '删之前左栏有一只',
                (await ui.count('.pet-editor .rail-item')) === 1,
                `实际 ${await ui.count('.pet-editor .rail-item')} 行`,
            );

            await ui.clickLabelPrefix('删除第 1 只');
            await sleep(350);
            t.check(
                '删之后左栏空了',
                (await ui.count('.pet-editor .rail-item')) === 0,
                `实际 ${await ui.count('.pet-editor .rail-item')} 行`,
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
}
