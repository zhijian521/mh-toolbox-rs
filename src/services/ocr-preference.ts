import { readPreference, writePreference } from './local-data';

const FAST_OCR_KEY = 'mh-fast-ocr';
export const REMINDER_PREFERENCES_KEY = 'mh-fengyao-preferences';

export function saveFastOcr(enabled: boolean): boolean {
    return writePreference(FAST_OCR_KEY, String(enabled));
}

/** 首次读取沿用旧实验开关。迁移写入失败时，保留原选择供本次识别使用。 */
export function readOcrPreference(): { enabled: boolean; saved: boolean } {
    const current = readPreference(FAST_OCR_KEY);
    if (current !== null) return { enabled: current === 'true', saved: true };
    const raw = readPreference(REMINDER_PREFERENCES_KEY);
    if (raw) {
        try {
            const enabled: unknown = JSON.parse(raw)?.fastOcr;
            if (typeof enabled === 'boolean') return { enabled, saved: saveFastOcr(enabled) };
        } catch {
            // 原监听设置由自己的读取入口报告错误。
        }
    }
    return { enabled: false, saved: true };
}
