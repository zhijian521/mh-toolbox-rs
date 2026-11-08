/** 合成浮片走真实 OCR；断言覆盖三个入口、草稿取消、批量定位与重载持久化。 */
export async function equipment(ctx) {
    const { cdp, ui, t } = ctx;
    const readGear = () =>
        cdp.evaluate(`(async () => {
        const { useRoster } = await import('/src/views/characters/roster.ts');
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
        await ui.clickIn('.roster .char', 'E2E改名后', { label: '截图识别这个角色' });
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
        await upload('.ocr .upload-file', [head(26)]);
        t.check('装备截图真实 OCR 完成', await waitUpload());
        await ui.clickText('.modal-panel button', '应用到这张卡');
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
    });

    await t.step('快速修改上传：部位拦错、取消不写入、保存才生效', async () => {
        await openHead();
        await ui.waitFor(`!!document.querySelector('.gear-quick')`);
        t.check(
            '无图时左侧保留截图入口，右侧详情只有一个名称',
            await cdp.evaluate(
                `!!document.querySelector('.gear-quick .upload-preview.empty') &&
                !document.querySelector('.gear-quick .gear-more, .gear-quick .flavor-field, .gear-quick .foot-field') &&
                !!document.querySelector('.gear-quick textarea[aria-label="装备备注"]') &&
                document.querySelectorAll('.gear-quick .gear-name input').length === 1`,
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
                `document.querySelector('.gear-quick .gear-name input').value === '水晶帽'`,
            ),
        );
        await upload('.gear-quick .upload-file', [head(30)]);
        t.check('识别结果填进快捷表单', await waitUpload());
        t.check(
            '分类下拉文字居中，数值输入格不显示占位字',
            await cdp.evaluate(`(() => {
            const label = document.querySelector('.gear-quick .effect-label .select-text');
            return getComputedStyle(label).textAlign === 'center' &&
                [...document.querySelectorAll('.gear-quick .value-field')].every((field) => !field.placeholder);
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
            '长详情独立滚动，放大的快捷添加按钮固定在卡片底部',
            await cdp.evaluate(`(() => {
            const content = document.querySelector('.gear-quick .gear-content');
            const footer = document.querySelector('.gear-quick .gear-add');
            const scale = Number(getComputedStyle(footer).getPropertyValue('--fs-scale')) || 1;
            const top = footer.getBoundingClientRect().top;
            content.scrollTop = content.scrollHeight;
            return content.scrollTop > 0 &&
                Math.abs(footer.getBoundingClientRect().top - top) < 1 &&
                content.getBoundingClientRect().bottom <= footer.getBoundingClientRect().top + 1 &&
                footer.querySelector('.press-btn-tile').getBoundingClientRect().height >= 30 * scale - 1;
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
        await upload('.gear-quick .upload-file', [head(30)]);
        await waitUpload();
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
        await ui.clickText('.editor-tabs button', '装备');
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
                '伤害+8 [+8]',
            ],
            [
                '上古玉魄·阳',
                '封印命中等级+15',
                '奇袭法术+0.5%',
                '灵尘等级2',
                '速度+5 [+9]',
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
                `document.querySelector('.editor .gear-name .field-label')?.textContent.trim() === '玉魄·阳'`,
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
                document.querySelector('.editor').classList.contains('gear-wide')`,
            ),
        );
        await ui.clickLabel('编辑耳饰的装备');
        t.check(
            '切到耳饰同步显示耳饰原图和详情',
            await cdp.evaluate(
                `document.querySelector('.gear-editor .upload-preview img').alt.includes('明月珰') &&
                document.querySelector('.gear-editor .gear-name input').value === '明月珰' &&
                document.querySelector('.editor').classList.contains('gear-wide')`,
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
                    Math.abs(name.width - value.width * 2) < 1;
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
            '灵饰附加值与精炼保留',
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
