import { importLoaded } from '../../../cdp.mjs';

export async function entry(ctx, tools) {
    const { cdp, ui, t } = ctx;
    const { readGear, upload, head, waitUpload } = tools;
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
            '从装备分区打开时立即挂载装备，召唤兽仍未初始化',
            (await ui.exists('.editor .gear-editor')) && !(await ui.exists('.editor .pet-editor')),
        );
        await cdp.evaluate(`document.querySelector('.gear-editor').dataset.e2eRetained = 'true'`);
        t.check(
            '装备识别左侧页签下提供十二部位，右侧直接编辑详情',
            await cdp.evaluate(`document.querySelectorAll('.ocr .upload-left .gear-slot').length === 12 &&
                !!document.querySelector('.ocr .upload-detail .gear-form') &&
                document.querySelector('.ocr .upload-navigation').firstElementChild.classList.contains('gear-parts-head')`),
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
        await cdp.evaluate(`document.querySelector('.ocr-tabs .step-thumb').dataset.e2eRetained = 'true'`);
        const tabsState = () =>
            cdp.evaluate(`(() => {
                const slider = document.querySelector('.ocr-tabs');
                const thumb = slider.querySelector('.step-thumb');
                return {
                    width: slider.getBoundingClientRect().width,
                    selected: slider.querySelector('[aria-checked="true"]')?.textContent.trim(),
                    sameThumb: thumb.dataset.e2eRetained === 'true',
                    sliders: document.querySelectorAll('.ocr-tabs').length,
                };
            })()`);
        await ui.clickText('.ocr-tabs button', '属性', { exact: true });
        const standardTabs = await tabsState();
        const tabStates = [];
        const sharedUploads = [];
        for (const pane of ['师门', '辅助', '修炼', '召唤兽', '装备']) {
            await ui.clickText('.ocr-tabs button', pane, { exact: true });
            tabStates.push([pane, await tabsState()]);
            sharedUploads.push(
                await cdp.evaluate(`[...document.querySelectorAll('.ocr .screenshot-upload')]
                .filter((el) => el.getClientRects().length).length === 1`),
            );
        }
        t.check('各分区只启用一份共用截图入口', sharedUploads.every(Boolean));
        t.check(
            '首次切入召唤兽后保留实例，切回装备也不重建装备编辑器',
            await cdp.evaluate(`!!document.querySelector('.editor .pet-editor') &&
                document.querySelector('.gear-editor').dataset.e2eRetained === 'true'`),
        );
        t.check(
            '六个分区复用等宽页签和同一个滑块，切换时更新选中项',
            standardTabs.width > 0 &&
                tabStates.every(
                    ([pane, state]) =>
                        state.sliders === 1 &&
                        state.sameThumb &&
                        state.selected === pane &&
                        Math.abs(state.width - standardTabs.width) < 1,
                ),
        );
        await ui.clickText('.ocr-tabs button', '属性', { exact: true });
        const standardSize = await dialogSize();
        t.check(
            '完整修改按可用视口定高',
            Math.abs(
                standardSize.height - (await cdp.evaluate('Math.min(740, innerHeight - 48)')),
            ) < 1,
        );
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
                const content = paper.querySelector('.character-detail-content');
                const identity = paper.querySelector('.character-detail-identity');
                const name = paper.querySelector('.character-detail-name-input');
                const css = content && getComputedStyle(content);
                return {
                    painted: before !== 'none', follows: switched !== before,
                    geometry: content && identity && name ? [
                        css.paddingTop, css.paddingRight, css.paddingBottom, css.paddingLeft,
                        getComputedStyle(identity).gap, name.getBoundingClientRect().height,
                    ] : null,
                };
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
        t.check(
            '装备与召唤兽共用详情留白、头部间距和名称框高度',
            Boolean(gearPaper?.geometry && petPaper?.geometry) &&
                JSON.stringify(gearPaper.geometry) === JSON.stringify(petPaper.geometry),
            JSON.stringify({ gear: gearPaper?.geometry, pet: petPaper?.geometry }),
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
        await ui.clickText('.ocr-tabs button', '属性', { exact: true });
        await upload('.ocr-standard .upload-file', [head(26)]);
        t.check('装备截图真实 OCR 完成', await waitUpload());
        t.check(
            '人物属性页上传装备图自动切换到装备',
            (await cdp.evaluate(
                `document.querySelector('.ocr-tabs [aria-checked="true"]')?.textContent.trim()`,
            )) === '装备',
        );
        /* 认错的字要能对着截图核对：装备这一页与召唤兽那页一样，得带出「识别原文」。
           原先只给召唤兽页传了 rawLines，装备页没有，于是这一块永远不出现。 */
        const raw = await cdp.evaluate(
            `(() => {
                const box = document.querySelector('.ocr .upload-raw');
                if (!box) return { found: false };
                const summary = box.querySelector('summary')?.textContent ?? '';
                const lines = box.querySelectorAll('li, .raw-line').length;
                return { found: true, title: summary.trim(), lines };
            })()`,
        );
        t.check(
            '装备页也给出识别原文',
            raw.found && raw.title.startsWith('识别原文 ·') && raw.lines > 0,
            JSON.stringify(raw),
        );
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
}
