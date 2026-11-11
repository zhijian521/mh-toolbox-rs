import { importLoaded } from '../../cdp.mjs';
import { checkButtonTheme } from './theme.mjs';

/** 原图与合成浮片走真实 OCR；覆盖三个入口、草稿取消、批量定位与重载持久化。 */
export async function equipment(ctx) {
    const { cdp, ui, t } = ctx;
    await t.step('图标：加载失败保留压印块，换图后恢复', async () => {
        const state = await cdp.evaluate(`(async () => {
            const { createApp, h, nextTick, ref } = await ${importLoaded('/node_modules/.vite/deps/vue.js')};
            const { default: IconTile } = await ${importLoaded('/src/views/characters/IconTile.vue')};
            const host = document.createElement('div');
            host.hidden = true;
            document.body.append(host);
            const image = (color) => 'data:image/svg+xml,' + encodeURIComponent(
                '<svg xmlns="http://www.w3.org/2000/svg" width="2" height="2"><path fill="' + color + '" d="M0 0h2v2H0z"/></svg>');
            const source = ref(image('red'));
            const app = createApp({ render: () => h(IconTile, { src: source.value }) });
            try {
                app.mount(host);
                // 动态 import 的组件要等首拍渲染，不能在 mount() 后立即读异步组件的子节点。
                for (let attempt = 0; attempt < 40 && !host.querySelector('img'); attempt++) {
                    await new Promise((resolve) => setTimeout(resolve, 25));
                }
                const lazy = host.querySelector('img')?.loading === 'lazy';
                host.querySelector('img')?.dispatchEvent(new Event('error'));
                await nextTick();
                const fallback = !host.querySelector('img') && !!host.querySelector('.icon-tile');
                source.value = image('blue');
                await nextTick();
                const restored = host.querySelector('img');
                return { lazy, fallback, restored: restored?.getAttribute('src') === source.value };
            } finally {
                app.unmount();
                host.remove();
            }
        })()`);
        t.check(
            '图标延迟加载，失败不显示裂图，换图后可重新加载',
            state.lazy && state.fallback && state.restored,
            JSON.stringify(state),
        );
    });
    const readGear = () =>
        cdp.evaluate(`(async () => {
        const { useRoster } = await ${importLoaded('/src/views/characters/roster.ts')};
        return JSON.parse(JSON.stringify(useRoster().roster.value.find((one) => one.name === 'E2E改名后').gear));
    })()`);
    const upload = (selector, samples) =>
        cdp.evaluate(`(async () => {
        const transfer = new DataTransfer();
        for (const rows of ${JSON.stringify(samples)}) {
            const canvas = document.createElement('canvas');
            canvas.width = 440; canvas.height = rows.length * 34 + 28;
            const paint = canvas.getContext('2d');
            paint.fillStyle = '#403420'; paint.fillRect(0, 0, canvas.width, canvas.height);
            paint.font = '22px "Microsoft YaHei"';
            rows.forEach((text, index) => {
                paint.fillStyle = text.includes('[') && !text.startsWith('[装备') && !text.startsWith('[灵饰') ? '#00ff00' : '#ffff00';
                paint.fillText(text, 20, 30 + index * 34);
            });
            const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
            transfer.items.add(new File([blob], rows[0] + '.png', { type: 'image/png' }));
        }
        const input = document.querySelector(${JSON.stringify(selector)});
        input.files = transfer.files;
        input.dispatchEvent(new Event('change', { bubbles: true }));
    })()`);
    const uploadFixtures = (names) =>
        cdp.evaluate(`(async () => {
        const transfer = new DataTransfer();
        for (const name of ${JSON.stringify(names)}) {
            const response = await fetch('/tools/e2e/fixtures/' + name);
            if (!response.ok) throw new Error('装备截图样本加载失败：' + response.status);
            transfer.items.add(new File([await response.blob()], name, { type: 'image/png' }));
        }
        const input = document.querySelector('.gear-editor .upload-file');
        input.files = transfer.files;
        input.dispatchEvent(new Event('change', { bubbles: true }));
    })()`);
    const head = (defense) => [
        '水晶帽',
        '[装备条件] 等级60',
        '等级60',
        '魔法+60 防御+' + defense,
        '耐久度191',
        '套装效果：附加状态碎星诀',
    ];
    const waitUpload = () =>
        ui.waitFor(
            `document.querySelector('.upload-status')?.textContent.includes('已填入') &&
            !document.querySelector('.upload-status')?.textContent.includes('识别中')`,
            { timeout: 45000 },
        );
    const openHead = () =>
        ui.clickIn('.roster .char', 'E2E改名后', { label: '快速修改 头 · 水晶帽' });

    await t.step('装备页截图入口：跟随装备分区，只更新截图部位', async () => {
        const before = await readGear();
        await ui.clickIn('.roster .char', 'E2E改名后', { text: '装备' });
        await ui.clickIn('.roster .char', 'E2E改名后', { label: '编辑这个角色' });
        await ui.waitFor(`!!document.querySelector('.ocr')`);
        t.check(
            '截图弹窗自动切到装备',
            await cdp.evaluate(
                `document.querySelector('.ocr-tabs [aria-checked="true"]')?.textContent.trim() === '装备'`,
            ),
        );
        t.check(
            '装备识别左侧页签下提供十二部位，右侧直接编辑详情',
            await cdp.evaluate(`document.querySelectorAll('.ocr .upload-left .gear-slot').length === 12 &&
                !!document.querySelector('.ocr .upload-detail .gear-form') &&
                document.querySelector('.ocr .upload-navigation .ocr-tabs').nextElementSibling.classList.contains('gear-parts-head')`),
        );
        const dialogSize = () =>
            cdp.evaluate(`(() => {
                const rect = document.querySelector('.modal-panel').getBoundingClientRect();
                const right = [...document.querySelectorAll('.upload-detail')]
                    .find((el) => el.getClientRects().length);
                const left = [...document.querySelectorAll('.upload-left')]
                    .find((el) => el.getClientRects().length);
                return {
                    width: rect.width, height: rect.height,
                    right: right.getBoundingClientRect().width,
                    left: left.getBoundingClientRect().width,
                };
            })()`);
        /* 页签条的宽度在六个分区里必须是同一个：装备 / 召唤兽两页它被塞进
         * `upload-navigation` 的栅格，那一层默认 stretch 会把它拉满整列。
         * 量的是控件自身，不是弹窗宽——弹窗宽高一致那条断言看不出这个。 */
        const tabsWidth = () =>
            cdp.evaluate(`(() => {
                const tabs = document.querySelector('.ocr .ocr-tabs');
                return tabs ? Math.round(tabs.getBoundingClientRect().width) : -1;
            })()`);
        await ui.clickText('.ocr-tabs button', '属性', { exact: true });
        const standardTabs = await tabsWidth();
        const tabWidths = [];
        const sharedUploads = [];
        for (const pane of ['师门', '辅助', '修炼', '召唤兽', '装备']) {
            await ui.clickText('.ocr-tabs button', pane, { exact: true });
            tabWidths.push([pane, await tabsWidth()]);
            sharedUploads.push(
                await cdp.evaluate(`[...document.querySelectorAll('.ocr .screenshot-upload')]
                .filter((el) => el.getClientRects().length).length === 1`),
            );
        }
        t.check('各分区只启用一份共用截图入口', sharedUploads.every(Boolean));
        t.check(
            '分区页签在六个分区里等宽',
            standardTabs > 0 && tabWidths.every(([, width]) => Math.abs(width - standardTabs) < 1),
        );
        await ui.clickText('.ocr-tabs button', '属性', { exact: true });
        const standardSize = await dialogSize();
        const sizes = [];
        for (const pane of ['师门', '辅助', '修炼', '召唤兽']) {
            await ui.clickText('.ocr-tabs button', pane, { exact: true });
            sizes.push(await dialogSize());
        }
        await ui.clickText('.ocr-tabs button', '装备', { exact: true });
        /* 格子里不再写部位名（2026-11-10 去掉），部位从 aria-label 取：
         * 「编辑武器的装备」→「武器」。断言的仍是「十二个部位都能点到、弹窗不变尺寸」。 */
        const parts = await cdp.evaluate(
            `[...document.querySelectorAll('.ocr .gear-slot')]
                .map((one) => one.getAttribute('aria-label').replace(/^编辑/, '').replace(/的装备$/, ''))`,
        );
        for (const part of parts) {
            await ui.clickLabel('编辑' + part + '的装备');
            sizes.push(await dialogSize());
        }
        t.check(
            '六个分区左侧保留 400，右侧卡片统一宽 460',
            [standardSize, ...sizes].every(
                (size) => Math.abs(size.left - 400) < 1 && Math.abs(size.right - 460) < 1,
            ),
            JSON.stringify([standardSize, ...sizes]),
        );
        t.check(
            '统一窗口在六个分区和十二装备之间切换时宽高一致',
            sizes.every(
                (size) =>
                    Math.abs(size.width - standardSize.width) < 1 &&
                    Math.abs(size.height - standardSize.height) < 1,
            ),
        );
        /* 装备 / 召唤兽两页右侧的详情纸走**角色门派主题色**（2026-11-10 用户：「右侧卡片
         * 背景，和属性 师门 这些保持一致，走角色门派主题色」）。判据三条：纸上有渐变（不是
         * 一块平底）、两页取到的是同一条、把 panel 上的 `data-school` 换成另一个门派纸色
         * 会跟着变。最后一条是这条断言的关键——只比「有渐变」的话，回落成纯纸也会绿。 */
        const paperTint = (selector) =>
            cdp.evaluate(`(() => {
                const paper = document.querySelector(${JSON.stringify(selector)});
                const panel = paper?.closest('.modal-panel');
                if (!paper || !panel) return null;
                const before = getComputedStyle(paper).backgroundImage;
                const original = panel.getAttribute('data-school');
                /* 换一个**与当前不同**的门派再读一次。写死一个门派会在角色正好是它时
                 * 假红（换完没变），也会在空门派时假绿不了——空门派回落成纯纸，本来就会变。 */
                const probe = original === '龙宫' ? '大唐官府' : '龙宫';
                panel.setAttribute('data-school', probe);
                const switched = getComputedStyle(paper).backgroundImage;
                if (original === null) panel.removeAttribute('data-school');
                else panel.setAttribute('data-school', original);
                return { painted: before !== 'none', follows: switched !== before };
            })()`);
        await ui.clickText('.ocr-tabs button', '装备', { exact: true });
        const gearPaper = await paperTint('.ocr .gear-form');
        await ui.clickText('.ocr-tabs button', '召唤兽', { exact: true });
        const petPaper = await paperTint('.ocr .pet-form');
        t.check(
            '装备与召唤兽的详情纸跟随门派主题色',
            Boolean(
                gearPaper?.painted && gearPaper?.follows && petPaper?.painted && petPaper?.follows,
            ),
            JSON.stringify({ gearPaper, petPaper }),
        );
        await ui.clickText('.ocr-tabs button', '装备', { exact: true });
        await ui.clickLabel('编辑头的装备');
        for (let index = 0; index < 12; index++) await ui.clickLabel('添加宝石行');
        t.check(
            '装备长详情在右侧滚动，弹窗保持统一高度',
            await cdp.evaluate(`(() => {
                const content = document.querySelector('.ocr .gear-content');
                const footer = document.querySelector('.ocr .gear-add');
                const panel = document.querySelector('.modal-panel').getBoundingClientRect();
                const top = footer.getBoundingClientRect().top;
                content.scrollTop = content.scrollHeight;
                return content.scrollTop > 0 &&
                    Math.abs(panel.height - ${standardSize.height}) < 1 &&
                    Math.abs(footer.getBoundingClientRect().top - top) < 1 &&
                    content.getBoundingClientRect().bottom <= footer.getBoundingClientRect().top + 1;
            })()`),
        );
        for (let index = 0; index < 12; index++)
            await cdp.click('.ocr [data-group="gem"] .row-delete');
        await upload('.ocr .upload-file', [head(26)]);
        t.check('装备截图真实 OCR 完成', await waitUpload());
        await ui.clickText('.modal-panel button', '保存');
        await ui.waitFor(`!document.querySelector('.ocr')`);
        const after = await readGear();
        t.check(
            '头部填入名称与防御',
            after
                .find((one) => one.slot === '头')
                ?.detail?.stats.some((stat) => stat.label === '防御' && stat.value === '+26'),
        );
        t.check(
            '其余部位未动',
            JSON.stringify(after.filter((one) => one.slot !== '头')) ===
                JSON.stringify(before.filter((one) => one.slot !== '头')),
        );
    });

    await t.step('装备图标和套装摘要跟随识别结果', async () => {
        const after = await readGear();
        t.check(
            '套装效果完整写入并进入卡片摘要',
            after
                .find((one) => one.slot === '头')
                ?.detail?.lines?.some(
                    (line) => line.label === '套装' && line.value === '附加状态碎星诀',
                ) &&
                (await cdp.evaluate(
                    `[...document.querySelectorAll('.roster .char')].find((card) => card.textContent.includes('E2E改名后'))?.querySelector('.stage-brief .suit')?.textContent.includes('碎星诀')`,
                )),
        );
        t.check(
            '水晶帽使用名称对应的 60 级图标',
            await cdp.evaluate(
                `[...document.querySelectorAll('.roster .char')].find((card) => card.textContent.includes('E2E改名后'))?.querySelector('.gear-cell[aria-label="快速修改 头 · 水晶帽"] img')?.src.endsWith('/gear/gear-toukui-01.webp')`,
            ),
        );
        /* 只有一件写了这套，件数写 *1 并退灰（不足三件不激活）——星号是数出来的，
         * 不是抄面板上那个「/ 5」。 */
        const suit = await cdp.evaluate(`(() => {
                const item = [...document.querySelectorAll('.roster .char')]
                    .find((card) => card.textContent.includes('E2E改名后'))
                    ?.querySelector('.stage-brief .suit .brief-item');
                return {
                    name: item?.querySelector('.item-name')?.textContent.trim() ?? '',
                    num: item?.querySelector('b')?.textContent.trim() ?? '',
                    dim: item?.classList.contains('dim') ?? null,
                };
            })()`);
        t.check(
            '套装一件：写 *1 并退灰',
            suit.name === '附加状态碎星诀' && suit.num === '*1' && suit.dim === true,
            JSON.stringify(suit),
        );
    });

    await t.step('快速修改上传：部位拦错、取消不写入、保存才生效', async () => {
        await openHead();
        await ui.waitFor(`!!document.querySelector('.gear-quick')`);
        await checkButtonTheme(ctx, '.modal-panel');
        t.check(
            '无图时左侧保留截图入口，右侧详情只有一个名称',
            await cdp.evaluate(
                `!!document.querySelector('.gear-quick .upload-preview.empty') &&
                !document.querySelector('.gear-quick .gear-more, .gear-quick .flavor-field, .gear-quick .foot-field') &&
                !!document.querySelector('.gear-quick textarea[aria-label="装备备注"]') &&
                document.querySelectorAll('.gear-quick .gear-name-input').length === 1`,
            ),
        );
        await upload('.gear-quick .upload-file', [
            ['追星踏月', '[装备条件] 等级60', '敏捷+27 防御+31'],
        ]);
        t.check(
            '鞋子图不能填进头部',
            await ui.waitFor(
                `document.querySelector('.upload-error')?.textContent.includes('这张是鞋子')`,
                { timeout: 45000 },
            ),
        );
        t.check(
            '拦错后名字保持水晶帽',
            await cdp.evaluate(
                `document.querySelector('.gear-quick .gear-name-input').value === '水晶帽'`,
            ),
        );
        await upload('.gear-quick .upload-file', [head(30)]);
        t.check('识别结果填进快捷表单', await waitUpload());
        /* 类型与等级照召唤兽那两格：都是票面凹槽（`.slip-row.sm` + `.num-slot`），
         * 等级是数字格且只记一个数（2026-11-11）。 */
        const idPair = await cdp.evaluate(`(() => {
            const pair = document.querySelector('.gear-quick .gear-kind');
            const cells = [...pair.querySelectorAll('label.slip-row.sm')];
            const level = pair.querySelector('input[aria-label="装备等级"]');
            return {
                cells: cells.length,
                labels: cells.map((cell) => cell.querySelector('.slip-name')?.textContent.trim()),
                slots: cells.every((cell) => !!cell.querySelector('.num-slot')),
                level: level ? level.value : null,
                kind: pair.querySelector('input[aria-label="装备类型"]')?.value || '',
            };
        })()`);
        t.check(
            '装备类型与等级两格走票面凹槽，等级只记一个数',
            idPair.cells === 2 &&
                idPair.labels.join('/') === '类型/等级' &&
                idPair.slots &&
                idPair.level === '60' &&
                idPair.kind.length > 0,
            JSON.stringify(idPair),
        );
        t.check(
            '分类下拉文字居中，数值输入格不显示占位字',
            await cdp.evaluate(`(() => {
            const label = document.querySelector('.gear-quick .effect-label .select-text');
            return getComputedStyle(label).textAlign === 'center' &&
                [...document.querySelectorAll('.gear-quick .value-field')].every((field) => !field.placeholder);
        })()`),
        );
        t.check(
            '快捷添加按钮按分类着色，套装按钮与详情同色',
            await cdp.evaluate(`(() => {
                const footer = document.querySelector('.gear-quick .gear-add');
                const tiles = [...footer.querySelectorAll('.press-btn-tile')];
                const suit = footer.querySelector('[aria-label="添加套装行"] .press-btn-inner');
                const detail = document.querySelector('.gear-quick .kind-suit .property-items');
                return new Set(tiles.map((tile) => getComputedStyle(tile).backgroundColor)).size === tiles.length &&
                    getComputedStyle(suit).color === getComputedStyle(detail).color;
            })()`),
        );
        const preview = await cdp.evaluate(`(() => {
            const image = document.querySelector('.gear-quick .upload-preview');
            const detail = document.querySelector('.gear-quick .upload-detail');
            return {
                sideBySide: image.getBoundingClientRect().right <= detail.getBoundingClientRect().left,
                inline: !!detail.querySelector('.stat-row input[aria-label="防御属性值"]'),
            };
        })()`);
        t.check('有图后左原图右详情，数值可直接编辑', preview.sideBySide && preview.inline);
        t.check(
            '基础两项同排，分类、名称和数值等高，套装也有分类背景',
            await cdp.evaluate(`(() => {
                const base = document.querySelector('.gear-quick [data-group="base"]');
                const rows = [...base.querySelectorAll('.property-item')];
                const suite = document.querySelector('.gear-quick .kind-suit .property-label');
                return base.querySelector('.property-items').classList.contains('paired') &&
                    rows.every((row) => {
                        const name = row.querySelector('.row-name');
                        const value = row.querySelector('.value-field');
                        const height = base.querySelector('.property-label').getBoundingClientRect().height;
                        return name.classList.contains('slip-row') &&
                            value.getBoundingClientRect().width > name.getBoundingClientRect().width &&
                            value.getBoundingClientRect().width >= 70 &&
                            Math.abs(name.getBoundingClientRect().height - height) < 1 &&
                            Math.abs(value.getBoundingClientRect().height - height) < 1;
                    }) &&
                    Math.abs(rows[0].getBoundingClientRect().top - rows[1].getBoundingClientRect().top) < 1 &&
                    suite.classList.contains('tag') &&
                    getComputedStyle(base.querySelector('.property-items')).color !== getComputedStyle(document.querySelector('.gear-quick .kind-suit .property-items')).color;
            })()`),
        );
        await ui.clickLabel('添加宝石行');
        t.check(
            '宝石行的名称和数值按2比1分格，行尾删除直接可见',
            await cdp.evaluate(`(() => {
                const row = document.querySelector('.gear-quick [data-group="gem"] .detail-row');
                const name = row.querySelector('.row-name').getBoundingClientRect();
                const value = row.querySelector('.stat-number').getBoundingClientRect();
                const remove = row.querySelector('.row-delete');
                return Math.abs(name.width - value.width * 2) < 1 &&
                    name.right < value.left && Math.abs(name.height - value.height) < 1 &&
                    getComputedStyle(remove).opacity === '1' && !row.querySelector('details');
            })()`),
        );
        await ui.clickLabel('删除伤害属性');
        t.check(
            '行尾删除只移除新增宝石行',
            !(await ui.exists('.gear-quick [data-group="gem"]')) &&
                (await ui.exists('.gear-quick [data-group="base"]')),
        );
        await ui.clickLabel('添加符石组合行');
        await ui.fillSel('.gear-quick .kind-upgrade .effect-row input', '高山流水');
        t.check(
            '符石组合快捷添加为独立名称行，不创建附加属性',
            await cdp.evaluate(`(() => {
                const row = document.querySelector('.gear-quick .kind-upgrade:has(.effect-row)');
                return row?.querySelector('.property-label').textContent.includes('符石组合') &&
                    row.querySelector('input').value === '高山流水' &&
                    !row.querySelector('.stat-row');
            })()`),
        );
        await cdp.click('.gear-quick .kind-upgrade .effect-row .row-delete');
        await ui.clickLabel('添加特技行');
        t.check(
            '快捷添加特技归入独立分类，不改变已有套装',
            (await ui.exists('.gear-quick .kind-active')) &&
                (await ui.exists('.gear-quick .kind-suit')),
        );
        await cdp.click('.gear-quick .kind-active .row-delete');
        t.check(
            '特技行可直接删除，套装保留',
            !(await ui.exists('.gear-quick .kind-active')) &&
                (await ui.exists('.gear-quick .kind-suit')),
        );
        for (let index = 0; index < 12; index++) await ui.clickLabel('添加宝石行');
        t.check(
            '长详情独立滚动，紧凑的快捷添加按钮固定在卡片底部',
            await cdp.evaluate(`(() => {
            const content = document.querySelector('.gear-quick .gear-content');
            const footer = document.querySelector('.gear-quick .gear-add');
            const scale = Number(getComputedStyle(footer).getPropertyValue('--fs-scale')) || 1;
            const top = footer.getBoundingClientRect().top;
            content.scrollTop = content.scrollHeight;
            return content.scrollTop > 0 &&
                Math.abs(footer.getBoundingClientRect().top - top) < 1 &&
                content.getBoundingClientRect().bottom <= footer.getBoundingClientRect().top + 1 &&
                [...footer.querySelectorAll('.press-btn-tile')].every((tile) =>
                    tile.getBoundingClientRect().height >= 30 * scale - 1 &&
                    tile.getBoundingClientRect().width <=
                        tile.querySelector('.press-btn-inner').getBoundingClientRect().width + 24 * scale);
        })()`),
        );
        await ui.fillSel('.gear-quick textarea[aria-label="装备备注"]', '取消的备注');
        await ui.clickText('.modal-panel button', '取消', { exact: true });
        await ui.waitFor(`!document.querySelector('.gear-quick')`);
        t.check(
            '取消保持原防御',
            (await readGear())
                .find((one) => one.slot === '头')
                ?.detail?.stats.some((stat) => stat.label === '防御' && stat.value === '+26'),
        );
        await openHead();
        t.check(
            '取消不保存备注',
            await cdp.evaluate(
                `document.querySelector('.gear-quick textarea[aria-label="装备备注"]').value !== '取消的备注'`,
            ),
        );
        t.check(
            '重新打开不残留上次编辑原图，截图入口保留',
            await ui.exists('.gear-quick .upload-preview.empty'),
        );
        await ui.fillSel('.gear-quick textarea[aria-label="装备备注"]', '任务用\n暂不更换');
        await ui.clickLabel('添加特技行');
        await ui.clickLabel('添加宝石行');
        await ui.fillSel('.gear-quick input[aria-label="伤害属性值"]', '123');
        await cdp.key('Enter');
        await upload('.gear-quick .upload-file', [head(30)]);
        await waitUpload();
        t.check(
            '重新识别按部位整件覆盖，不保留旧特技和宝石行',
            !(await ui.exists('.gear-quick .kind-active')) &&
                !(await ui.exists('.gear-quick [data-group="gem"]')),
        );
        t.check(
            '重新识别保留自用备注',
            await cdp.evaluate(
                `document.querySelector('.gear-quick textarea[aria-label="装备备注"]').value === ${JSON.stringify('任务用\n暂不更换')}`,
            ),
        );
        await ui.clickText('.modal-panel button', '保存', { exact: true });
        await ui.waitFor(`!document.querySelector('.gear-quick')`);
    });

    await t.step('全部修改批量上传：灵饰与玉魄自动定位，保存后重载仍在', async () => {
        await ui.clickIn('.roster .char', 'E2E改名后', { label: '编辑这个角色' });
        await ui.waitFor(`!!document.querySelector('.editor')`);
        await ui.clickText('.ocr-tabs button', '装备');
        t.check(
            '全部修改允许多选截图',
            await cdp.evaluate(`document.querySelector('.gear-editor .upload-file').multiple`),
        );
        await upload('.gear-editor .upload-file', [
            [
                '明月珰',
                '[装备条件] 等级80',
                '[灵饰类型] 耳饰',
                '法术防御+17',
                '精炼等级2',
                '伤害+8',
            ],
            [
                '上古玉魄·阳',
                '封印命中等级+15',
                '奇袭法术+0.5%',
                '灵尘等级2',
                '速度+5',
                '奇袭特技：[空]',
            ],
        ]);
        t.check(
            '识别期间保存禁用',
            await cdp.evaluate(
                `document.querySelector('button[aria-label="保存这个角色"]').disabled`,
            ),
        );
        t.check('两张截图依次识别完成', await waitUpload());
        t.check(
            '自动选中最后识别的玉魄',
            await cdp.evaluate(
                `document.querySelector('.editor input[aria-label="玉魄·阳 的装备名"]')?.placeholder === '玉魄·阳装备名'`,
            ),
        );
        const yupoShot = await cdp.evaluate(
            `document.querySelector('.gear-editor .upload-preview img').src`,
        );
        await ui.clickLabel('编辑头的装备');
        t.check(
            '切到未上传的部位时显示截图空位，保持两栏',
            await cdp.evaluate(
                `!!document.querySelector('.gear-editor .upload-preview.empty') &&
                document.querySelector('.ocr').classList.contains('ocr-wide')`,
            ),
        );
        await ui.clickLabel('编辑耳饰的装备');
        t.check(
            '切到耳饰同步显示耳饰原图和详情',
            await cdp.evaluate(
                `document.querySelector('.gear-editor .upload-preview img').alt.includes('明月珰') &&
                document.querySelector('.gear-editor .gear-name-input').value === '明月珰' &&
                document.querySelector('.ocr').classList.contains('ocr-wide')`,
            ),
        );
        t.check(
            '灵饰区分基础、附加和精炼，重复属性保持逐条编辑',
            await cdp.evaluate(
                `['base', 'extra', 'refine'].every((key) => document.querySelector('.gear-editor [data-group="' + key + '"]'))`,
            ),
        );
        t.check(
            '灵饰提供附加快捷行，附加词条和数值分格并显示括号值',
            await cdp.evaluate(`(() => {
                const row = document.querySelector('.gear-editor [data-group="extra"] .detail-row');
                const name = row.querySelector('.row-name').getBoundingClientRect();
                const value = row.querySelector('.stat-number').getBoundingClientRect();
                return !!document.querySelector('.gear-editor button[aria-label="添加附加行"]') &&
                    !document.querySelector('.gear-editor button[aria-label="添加宝石行"]') &&
                    !!row.querySelector('input[aria-label="括号值"]') &&
                    Math.abs(value.width - name.width * 1.5) < 1 &&
                    row.querySelector('.value-field').getBoundingClientRect().width >= 70;
            })()`),
        );
        t.check(
            '灵饰强化值与普通数值输入框等宽等高，字体和内距一致',
            await cdp.evaluate(`(() => {
                const rows = [...document.querySelectorAll('.gear-editor .stat-number:has(.stat-extra)')];
                return rows.length > 0 && rows.every((row) => {
                    const normal = row.querySelector(':scope > .value-field');
                    const enhanced = row.querySelector('.stat-extra .value-field');
                    const a = normal.getBoundingClientRect();
                    const b = enhanced.getBoundingClientRect();
                    const first = getComputedStyle(normal);
                    const second = getComputedStyle(enhanced);
                    return Math.abs(a.width - b.width) < 1 && Math.abs(a.height - b.height) < 1 &&
                        ['fontSize', 'fontFamily', 'fontWeight', 'paddingLeft', 'paddingRight'].every(
                            (key) => first[key] === second[key]);
                });
            })()`),
        );
        await ui.clickLabel('编辑玉魄·阳的装备');
        t.check(
            '切回玉魄保留对应原图',
            await cdp.evaluate(
                `document.querySelector('.gear-editor .upload-preview img').src === ${JSON.stringify(yupoShot)}`,
            ),
        );
        t.check(
            '玉魄区分加成、灵尘和奇袭',
            await cdp.evaluate(
                `document.querySelector('.gear-editor [data-group="extra"] .property-label').textContent.trim() === '加成' &&
                ['dust', 'ambush'].every((key) => document.querySelector('.gear-editor [data-group="' + key + '"]'))`,
            ),
        );
        await ui.clickLabel('保存这个角色');
        await ui.waitFor(`!document.querySelector('.editor')`);
        await ui.reload();
        await ui.waitText('E2E改名后');
        const gear = await readGear();
        t.check(
            '装备备注保存后重载仍在',
            gear.find((one) => one.slot === '头')?.detail?.note === '任务用\n暂不更换',
        );
        t.check(
            '快捷修改的防御重载后为30',
            gear
                .find((one) => one.slot === '头')
                ?.detail?.stats.some((stat) => stat.label === '防御' && stat.value === '+30'),
        );
        t.check(
            '灵饰漏读的强化值按精炼等级补全并保留',
            gear
                .find((one) => one.slot === '耳饰')
                ?.detail?.stats.some(
                    (stat) => stat.label === '伤害' && stat.value === '+8' && stat.extra === '+8',
                ),
        );
        t.check(
            '玉魄百分比与奇袭保留',
            gear
                .find((one) => one.slot === '玉魄·阳')
                ?.detail?.stats.some((stat) => stat.label === '奇袭法术' && stat.value === '+0.5%'),
        );
        t.check(
            '玉魄漏读的强化值按灵尘等级补全并保留',
            gear
                .find((one) => one.slot === '玉魄·阳')
                ?.detail?.stats.some(
                    (stat) => stat.label === '速度' && stat.value === '+5' && stat.extra === '+9',
                ),
        );
    });

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
