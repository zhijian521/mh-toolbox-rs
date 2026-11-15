/** 截图场景共用粘贴与几何断言；不改动业务数据。 */
export function createOcrTools(ctx) {
    const { cdp, t } = ctx;
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
    return { checkCardFits, pasteFixture };
}
