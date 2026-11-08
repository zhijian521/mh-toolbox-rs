import { computed, onScopeDispose, ref, shallowRef } from 'vue';
import { ocrFrame, type OcrOutcome } from '../../../services/ocr';
import type { OcrLine } from './attr-panel';
import { base64Of, imageDataOf, swapToBgra, type Frame } from './pixels';

interface Parsed<T> {
    result: T;
    error?: string;
}

/** 整图 OCR 按需读取并复用；只有当前图、当前解析能写回预览。 */
export function useOcrImage<T>(
    parse: (lines: OcrLine[], shot: ImageData) => Promise<Parsed<T>>,
    frameFor?: (image: ImageData) => Frame | undefined,
    readWholeFrame: () => boolean = () => true,
) {
    const result = ref<T | null>(null);
    const rawLines = shallowRef<OcrLine[]>([]);
    const shotUrl = ref('');
    const error = ref('');
    const reading = ref(false);
    const parsing = ref(false);
    const busy = computed(() => reading.value || parsing.value);
    let imageVersion = 0;
    let parseVersion = 0;
    let disposed = false;
    let source: { image: ImageData; whole?: Promise<OcrOutcome> } | null = null;

    async function classify() {
        const frameSource = source;
        if (!frameSource) return;
        const { image } = frameSource;
        const version = ++parseVersion;
        const imageId = imageVersion;
        const current = () => !disposed && imageId === imageVersion && version === parseVersion;
        parsing.value = true;
        result.value = null;
        error.value = '';
        try {
            let lines: OcrLine[] = [];
            if (readWholeFrame()) {
                if (!frameSource.whole) {
                    const frame = frameFor?.(image) ?? {
                        pixels: base64Of(swapToBgra(image.data)),
                        width: image.width,
                        height: image.height,
                    };
                    frameSource.whole = ocrFrame(frame.pixels, frame.width, frame.height);
                }
                const outcome = await frameSource.whole;
                if (!current()) return;
                if (outcome.status === 'failed') {
                    frameSource.whole = undefined;
                    error.value = outcome.error;
                    return;
                }
                lines = outcome.lines;
            }
            rawLines.value = lines;
            const parsed = await parse(lines, image);
            if (!current()) return;
            result.value = parsed.result;
            error.value = parsed.error ?? '';
        } catch (err) {
            if (current()) error.value = '解析失败：' + String(err);
        } finally {
            if (current()) parsing.value = false;
        }
    }

    async function takeFile(file: File) {
        const version = ++imageVersion;
        ++parseVersion;
        const current = () => !disposed && version === imageVersion;
        reading.value = true;
        parsing.value = false;
        result.value = null;
        rawLines.value = [];
        source = null;
        error.value = '';
        if (shotUrl.value) URL.revokeObjectURL(shotUrl.value);
        shotUrl.value = '';
        try {
            const bitmap = await createImageBitmap(file);
            let image: ImageData;
            try {
                if (!current()) return;
                image = imageDataOf(bitmap);
            } finally {
                // 像素提取完即可释放句柄，异步识别只持有本次的像素。
                bitmap.close();
            }
            if (!current()) return;
            shotUrl.value = URL.createObjectURL(file);
            source = { image };
            reading.value = false;
            await classify();
        } catch (err) {
            if (current())
                error.value = '识别失败：' + (err instanceof Error ? err.message : String(err));
        } finally {
            if (current()) reading.value = false;
        }
    }

    onScopeDispose(() => {
        disposed = true;
        ++imageVersion;
        ++parseVersion;
        source = null;
        if (shotUrl.value) URL.revokeObjectURL(shotUrl.value);
    });
    return { result, rawLines, shotUrl, busy, error, takeFile, classify };
}
