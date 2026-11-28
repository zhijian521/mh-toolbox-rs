import { afterEach, expect, it, vi } from 'vitest';
import { probeGhostTask } from './ghost';
import { ocrFrame } from './ocr';
import { commands } from './bindings';
import { readOcrPreference, REMINDER_PREFERENCES_KEY, saveFastOcr } from './ocr-preference';

vi.mock('./desktop', () => ({ hasDesktop: () => true }));
vi.mock('./bindings', () => ({
    commands: {
        ocrFrame: vi.fn(async () => []),
        ghostProbe: vi.fn(async () => ({ lines: [] })),
    },
}));

function storage(legacy?: boolean) {
    const entries = new Map<string, string>();
    if (legacy !== undefined)
        entries.set(REMINDER_PREFERENCES_KEY, JSON.stringify({ fastOcr: legacy }));
    vi.stubGlobal('localStorage', {
        getItem: (key: string) => entries.get(key) ?? null,
        setItem: (key: string, value: string) => entries.set(key, value),
    });
    return entries;
}

afterEach(() => vi.unstubAllGlobals());

it('首次默认标准识别，不写入工具设置', () => {
    const entries = storage();
    expect(readOcrPreference()).toEqual({ enabled: false, saved: true });
    expect(entries.size).toBe(0);
});

it('继承旧提醒助手的选择，之后全局关闭优先于旧值', () => {
    const entries = storage(true);
    expect(readOcrPreference()).toEqual({ enabled: true, saved: true });
    entries.delete(REMINDER_PREFERENCES_KEY);
    expect(readOcrPreference().enabled).toBe(true);
    expect(saveFastOcr(false)).toBe(true);
    entries.set(REMINDER_PREFERENCES_KEY, JSON.stringify({ fastOcr: true }));
    expect(readOcrPreference().enabled).toBe(false);
});

it('标准补读不改全局快速识别选择', async () => {
    storage();
    saveFastOcr(true);
    await ocrFrame('AAAAAA==', 1, 1, 'standard');
    expect(commands.ocrFrame).toHaveBeenLastCalledWith('AAAAAA==', 1, 1, false);
    expect(readOcrPreference().enabled).toBe(true);
});

it('截图和捉鬼都在每次调用时读取当前选择', async () => {
    storage();
    for (const enabled of [true, false]) {
        saveFastOcr(enabled);
        await ocrFrame('AAAAAA==', 1, 1);
        await probeGhostTask(42);
        expect(commands.ocrFrame).toHaveBeenLastCalledWith('AAAAAA==', 1, 1, enabled);
        expect(commands.ghostProbe).toHaveBeenLastCalledWith(42, expect.any(Object), enabled);
    }
});
