export async function batch(ctx, tools) {
    const { cdp, ui, t } = ctx;
    const { readGear, upload, waitUpload } = tools;
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
            ['无法识别的图片'],
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
        t.check('有效截图依次识别完成，中间失败不阻断后续图片', await waitUpload(true));
        t.check(
            '批量失败信息不会被后续成功覆盖',
            (await ui.text('.gear-editor .upload-error')).includes('无法识别的图片.png'),
        );
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
}
