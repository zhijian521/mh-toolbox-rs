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
