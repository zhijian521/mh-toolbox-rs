import type { OcrLine } from './attr-panel';

/** 上传入口只接受图片；保留文件原顺序，批量策略由业务组件决定。 */
export function imageFiles(files: Iterable<File>): File[] {
    return [...files].filter((file) => file.type.startsWith('image/'));
}

/** 隐藏分区和下层弹窗不能同时消费一次粘贴。 */
export function pastedImages(event: ClipboardEvent, host: HTMLElement | null): File[] {
    if (!host?.getClientRects().length) return [];
    const modal = host.closest('[role="dialog"]');
    const dialogs = [...document.querySelectorAll('[role="dialog"][aria-modal="true"]')];
    if (!modal || modal !== dialogs.at(-1)) return [];
    return [...(event.clipboardData?.items ?? [])]
        .filter((item) => item.type.startsWith('image/'))
        .map((item) => item.getAsFile())
        .filter((file): file is File => file !== null);
}
/** 完整角色修改窗口共用文件入口；单件快速修改仍由各自识别器处理。 */
export interface ScreenshotIntake {
    busy: boolean;
    error: string;
    rawLines: OcrLine[];
    takeFiles: (files: File[]) => void;
}
