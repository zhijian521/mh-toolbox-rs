import { importLoaded } from '../../../cdp.mjs';

export async function queue(ctx) {
    const { cdp, ui, t, sleep } = ctx;
    await t.step('连续换图：在途完成前不启动下一张，等待中的旧图跳过', async () => {
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
            t.check(
                '识别中只显示一处提示并保留读屏播报',
                await cdp.evaluate(`(() => {
                    const upload = document.querySelector('.ocr-standard');
                    return upload.querySelector('.upload-busy')?.textContent === '识别中…' &&
                        !upload.querySelector('.upload-status') &&
                        upload.querySelector('[role="status"]')?.textContent === '识别中…';
                })()`),
            );
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
            await paste();
            t.check(
                '在途未完成时不发送后续图片',
                await cdp.evaluate('window.__e2eOcrRequests.length === 2'),
            );
            await resolveImage(1, 7002);
            t.check(
                '等待最新图时保持识别状态且不应用旧图',
                await cdp.evaluate(`!!document.querySelector('.ocr-standard .upload-busy') &&
                    ![...document.querySelectorAll('.ocr-card input')].some((one) => one.value === '7002')`),
            );
            if (!(await ui.waitFor('window.__e2eOcrRequests.length === 3')))
                throw new Error('最新图片没有进入识别');
            await resolveImage(2, 7003);
            await ui.waitFor(`!document.querySelector('.ocr-standard .upload-busy')`);
            await sleep(100);
            t.check(
                '最新图的 7003 保留在预览上',
                (await ui.text('.ocr-card')).includes('7003') ||
                    (await cdp.evaluate(
                        `[...document.querySelectorAll('.ocr-card input')].some((one) => one.value === '7003')`,
                    )),
            );
            t.check(
                '等待期间替换的中间图未发送',
                await cdp.evaluate('window.__e2eOcrRequests.length === 3'),
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
