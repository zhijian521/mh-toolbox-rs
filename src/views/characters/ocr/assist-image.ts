import { ocrFrame } from '../../../services/ocr';
import type { OcrLine } from './attr-panel';
import type { IconHit, Tile } from './matcher';
import { base64Of, swapToBgra } from './pixels';

interface LevelRegion {
    source: Tile;
    target: Tile;
}

/** 每个等级单独排成一行，避开整图 OCR 漏掉小数字或把同排数字连起来。 */
export function assistLevelRegions(
    image: { width: number; height: number },
    icons: readonly IconHit[],
): LevelRegion[] {
    const regions: LevelRegion[] = [];
    let nextY = 12;
    for (const { box } of icons) {
        // 深色圆角与边线会让检测器漏掉单个数字，只取等级框的内部。
        const x = Math.max(0, Math.round(box.x + box.width * 0.1));
        const y = Math.round(box.y + box.height * 1.2);
        const width = Math.min(image.width - x, Math.round(box.width * 0.8));
        const height = Math.min(image.height - y, Math.round(box.height * 0.35));
        if (width <= 0 || height <= 0) continue;
        regions.push({
            source: { x, y, width, height },
            target: { x: 12, y: nextY, width, height },
        });
        nextY += height + 24;
    }
    return regions;
}

/** 只接受单个等级格内的数字，再还原成原截图坐标供同一套配对逻辑使用。 */
export function restoreAssistLevels(
    lines: readonly OcrLine[],
    regions: readonly LevelRegion[],
): OcrLine[] {
    const restored: OcrLine[] = [];
    for (const line of lines) {
        const text = line.text.trim();
        if (!/^\d{1,3}$/.test(text) || Number(text) > 200) continue;
        const cx = line.x + line.width / 2;
        const cy = line.y + line.height / 2;
        const region = regions.find(
            ({ target }) =>
                cx >= target.x &&
                cx < target.x + target.width &&
                cy >= target.y &&
                cy < target.y + target.height &&
                line.width <= target.width &&
                line.height <= target.height,
        );
        if (!region) continue;
        restored.push({
            ...line,
            text,
            x: line.x + region.source.x - region.target.x,
            y: line.y + region.source.y - region.target.y,
        });
    }
    return restored;
}

export async function readAssistLevels(
    image: ImageData,
    icons: readonly IconHit[],
): Promise<OcrLine[]> {
    const regions = assistLevelRegions(image, icons);
    if (!regions.length) return [];
    const source = document.createElement('canvas');
    source.width = image.width;
    source.height = image.height;
    const sourceContext = source.getContext('2d');
    if (!sourceContext) throw new Error('取不到截图像素');
    sourceContext.putImageData(image, 0, 0);

    const canvas = document.createElement('canvas');
    canvas.width = Math.max(...regions.map(({ target }) => target.x + target.width)) + 12;
    canvas.height = Math.max(...regions.map(({ target }) => target.y + target.height)) + 12;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) throw new Error('取不到等级像素');
    context.fillStyle = '#fff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    for (const { source: from, target: to } of regions) {
        context.drawImage(
            source,
            from.x,
            from.y,
            from.width,
            from.height,
            to.x,
            to.y,
            to.width,
            to.height,
        );
    }
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
    const outcome = await ocrFrame(base64Of(swapToBgra(pixels.data)), canvas.width, canvas.height);
    return outcome.status === 'ok' ? restoreAssistLevels(outcome.lines, regions) : [];
}
