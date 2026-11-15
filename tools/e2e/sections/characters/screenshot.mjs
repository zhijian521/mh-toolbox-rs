/** 通过文件输入上传原图夹具，保留页面真实的 change 处理路径。 */
export function uploadFixtureFiles(cdp, selector, names) {
    return cdp.evaluate(`(async () => {
        const transfer = new DataTransfer();
        for (const name of ${JSON.stringify(names)}) {
            const response = await fetch('/tools/e2e/fixtures/' + name);
            if (!response.ok) throw new Error('截图样本加载失败：' + name + '（' + response.status + '）');
            transfer.items.add(new File([await response.blob()], name, { type: 'image/png' }));
        }
        const input = document.querySelector(${JSON.stringify(selector)});
        input.files = transfer.files;
        input.dispatchEvent(new Event('change', { bubbles: true }));
    })()`);
}
