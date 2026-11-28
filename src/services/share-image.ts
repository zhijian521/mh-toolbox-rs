/** 在点击时发起剪贴板写入，PNG 可以在角色卡渲染完成后再交给系统。 */
export async function copySharePng(render: () => Promise<Blob>): Promise<void> {
    if (!navigator.clipboard?.write || typeof ClipboardItem === 'undefined') {
        throw new Error('当前环境不支持复制图片');
    }
    const image = render();
    const item = new ClipboardItem({ 'image/png': image });
    const [rendered, written] = await Promise.allSettled([
        image,
        navigator.clipboard.write([item]),
    ]);
    if (rendered.status === 'rejected') throw rendered.reason;
    if (written.status === 'rejected') {
        if (written.reason?.name === 'NotAllowedError') {
            throw new Error('请将应用切到前台，并允许写入剪贴板后重试');
        }
        throw written.reason;
    }
}
