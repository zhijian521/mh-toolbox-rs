import { computed, onScopeDispose, ref, shallowRef } from 'vue';
import { ocrFrame } from '../../../services/ocr';
import type { OcrLine } from './attr-panel';
import { prepareFrame } from './pixels';

interface Parsed<T> {
    result: T;
    error?: string;
}

/** 换图和切分区分别递增版本；只有当前图、当前解析能写回预览。 */
export function useOcrImage<T>(parse: (lines: OcrLine[], shot: ImageData) => Promise<Parsed<T>>) {
    const result = ref<T | null>(null);
    const rawLines = shallowRef<OcrLine[]>([]);
    const shot = shallowRef<ImageData | null>(null);
    const shotUrl = ref('');
    const error = ref('');
    const reading = ref(false);
    const parsing = ref(false);
    const busy = computed(() => reading.value || parsing.value);
    let imageVersion = 0;
    let parseVersion = 0;
    let disposed = false;

    async function classify() {
        const image = shot.value;
        if (!image) return;
        const version = ++parseVersion;
        const source = imageVersion;
        const current = () => !disposed && source === imageVersion && version === parseVersion;
        parsing.value = true;
        result.value = null;
        error.value = '';
        try {
            const parsed = await parse(rawLines.value, image);
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
        shot.value = null;
        error.value = '';
        if (shotUrl.value) URL.revokeObjectURL(shotUrl.value);
        shotUrl.value = '';
        try {
            const bitmap = await createImageBitmap(file);
            let prepared;
            try {
                if (!current()) return;
                prepared = prepareFrame(bitmap);
            } finally {
                // 像素提取完即可释放句柄，异步识别只持有本次的像素。
                bitmap.close();
            }
            if (!current()) return;
            shotUrl.value = URL.createObjectURL(file);
            const { frame, image } = prepared;
            const outcome = await ocrFrame(frame.pixels, frame.width, frame.height);
            if (!current()) return;
            if (outcome.status === 'failed') {
                error.value = outcome.error;
                return;
            }
            rawLines.value = outcome.lines;
            shot.value = image;
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
        if (shotUrl.value) URL.revokeObjectURL(shotUrl.value);
    });
    return { result, rawLines, shotUrl, busy, error, takeFile, classify };
}
