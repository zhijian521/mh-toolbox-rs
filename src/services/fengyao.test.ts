import { afterEach, describe, expect, it, vi } from 'vitest';
import { commands } from './bindings';
import {
    activeReminders,
    defaultReminders,
    parseReminderMaps,
    readFengyaoPreferences,
    saveFengyaoPreferences,
    startSavedFengyao,
    type FengyaoPreferences,
    type WatchStatus,
} from './fengyao';

const key = 'mh-fengyao-preferences';
const region = { x: 0, y: 330, width: 740, height: 200, frameWidth: 740, frameHeight: 1024 };
const legacy = {
    scenes: ['麒麟山', '蓬莱仙岛'],
    windowTitle: '梦幻西游 聊天窗口',
    region,
};
const preferences: FengyaoPreferences = {
    windowTitle: legacy.windowTitle,
    region,
    reminders: defaultReminders(legacy.scenes),
};
const disabled = { ...preferences, reminders: defaultReminders([]) };

afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

describe('提醒助手偏好持久化', () => {
    it('首次没有设置，保存后再次读取还原地图和选区，主动全关也保留', () => {
        const storage = new Map<string, string>();
        vi.stubGlobal('localStorage', {
            getItem: (name: string) => storage.get(name) ?? null,
            setItem: (name: string, value: string) => storage.set(name, value),
        });
        expect(readFengyaoPreferences()).toEqual({ ok: true, value: null });
        expect(saveFengyaoPreferences(preferences)).toBe(true);
        expect(readFengyaoPreferences()).toEqual({ ok: true, value: preferences });
        expect(storage.get(key)).not.toContain('hwnd');
        expect(saveFengyaoPreferences(disabled)).toBe(true);
        expect(readFengyaoPreferences()).toEqual({ ok: true, value: disabled });
    });

    it('迁移旧设置并保留主动全关，新增类型分别保存自己的地图', () => {
        let raw = JSON.stringify(legacy);
        vi.stubGlobal('localStorage', {
            getItem: () => raw,
            setItem: (_name: string, value: string) => {
                raw = value;
            },
        });
        expect(readFengyaoPreferences()).toEqual({ ok: true, value: preferences });
        raw = JSON.stringify({ ...legacy, scenes: [] });
        expect(readFengyaoPreferences()).toEqual({ ok: true, value: disabled });
        const reminders = preferences.reminders.map((setting) =>
            setting.kind === 'yecha'
                ? {
                      ...setting,
                      enabled: true,
                      scenes: parseReminderMaps(' 花果山、花果山，长寿郊外 '),
                  }
                : setting,
        );
        expect(saveFengyaoPreferences({ ...preferences, reminders })).toBe(true);
        expect(activeReminders(reminders)).toEqual([
            { kind: 'fengyao', scenes: legacy.scenes },
            { kind: 'yecha', scenes: ['花果山', '长寿郊外'] },
        ]);
        expect(readFengyaoPreferences()).toEqual({
            ok: true,
            value: { ...preferences, reminders },
        });
    });

    it.each([
        '{broken',
        JSON.stringify({ ...legacy, scenes: ['麒麟山', null] }),
        JSON.stringify({ ...preferences, region: { ...preferences.region, x: 1000 } }),
    ])('读取失败保留原设置，暂停覆盖：%s', (raw) => {
        vi.spyOn(console, 'error').mockImplementation(() => {});
        const setItem = vi.fn();
        vi.stubGlobal('localStorage', { getItem: () => raw, setItem });
        expect(readFengyaoPreferences().ok).toBe(false);
        expect(saveFengyaoPreferences(preferences)).toBe(false);
        expect(setItem).not.toHaveBeenCalled();
    });

    it('写入失败明确返回失败，不丢掉之前保存的选择', () => {
        vi.spyOn(console, 'error').mockImplementation(() => {});
        const raw = JSON.stringify(preferences);
        vi.stubGlobal('localStorage', {
            getItem: () => raw,
            setItem: () => {
                throw new Error('quota');
            },
        });
        expect(saveFengyaoPreferences(disabled)).toBe(false);
        expect(readFengyaoPreferences()).toEqual({ ok: true, value: preferences });
    });
});

describe('总览按上次设置启动提醒助手', () => {
    const window = {
        hwnd: 87,
        title: preferences.windowTitle,
        x: 0,
        y: 0,
        width: region.frameWidth,
        height: region.frameHeight,
    };
    const status: WatchStatus = {
        running: false,
        config: null,
        title: '',
        error: '',
        text: [],
        lastReadAt: 0,
        checkedAt: 0,
        ocrMs: 0,
        baselineReady: false,
        alerts: [],
        notificationError: '',
        rules: {
            sourceUrl: '',
            checkedOn: '',
            note: '',
            scenes: legacy.scenes.map((name) => ({ name, minLevel: 0, aliases: [] })),
        },
    };

    function mockSession() {
        vi.stubGlobal('localStorage', { getItem: () => JSON.stringify(preferences) });
        return {
            status: vi.spyOn(commands, 'fengyaoStatus').mockResolvedValue(status),
            windows: vi.spyOn(commands, 'ghostWindows').mockResolvedValue([window]),
            capture: vi
                .spyOn(commands, 'fengyaoCapture')
                .mockResolvedValue({ ...window, image: '' }),
            start: vi
                .spyOn(commands, 'fengyaoStart')
                .mockResolvedValue({ ...status, running: true }),
        };
    }

    it('找回当前窗口句柄，并沿用已保存的场景和选区', async () => {
        const session = mockSession();
        await expect(startSavedFengyao()).resolves.toBe('started');
        expect(session.capture).toHaveBeenCalledWith(window.hwnd);
        expect(session.start).toHaveBeenCalledExactlyOnceWith({
            hwnd: window.hwnd,
            reminders: activeReminders(preferences.reminders),
            region,
        });
    });

    it('整窗模式按当前截图尺寸启动，无需保存裁切选区', async () => {
        const session = mockSession();
        vi.stubGlobal('localStorage', {
            getItem: () => JSON.stringify({ ...preferences, region: null }),
        });
        session.capture.mockResolvedValue({ ...window, width: 900, height: 700, image: '' });
        await expect(startSavedFengyao()).resolves.toBe('started');
        expect(session.start).toHaveBeenCalledExactlyOnceWith({
            hwnd: window.hwnd,
            reminders: activeReminders(preferences.reminders),
            region: { x: 0, y: 0, width: 900, height: 700, frameWidth: 900, frameHeight: 700 },
        });
    });

    it('只开启新类型时按其地图启动，封妖关闭也可以使用', async () => {
        const session = mockSession();
        const reminders = defaultReminders([]).map((setting) =>
            setting.kind === 'yiguan'
                ? { ...setting, enabled: true, scenes: ['大唐国境'] }
                : setting,
        );
        vi.stubGlobal('localStorage', {
            getItem: () => JSON.stringify({ ...preferences, reminders }),
        });
        await expect(startSavedFengyao()).resolves.toBe('started');
        expect(session.start).toHaveBeenCalledExactlyOnceWith({
            hwnd: window.hwnd,
            reminders: [{ kind: 'yiguan', scenes: ['大唐国境'] }],
            region,
        });
    });

    it('首次使用时先要求配置窗口', async () => {
        const session = mockSession();
        vi.stubGlobal('localStorage', { getItem: () => null });
        await expect(startSavedFengyao()).rejects.toThrow('首次使用');
        expect(session.windows).not.toHaveBeenCalled();
        expect(session.start).not.toHaveBeenCalled();
    });

    it('匹配多个同名窗口时不抓取，也不启动', async () => {
        const session = mockSession();
        session.windows.mockResolvedValue([window, { ...window, hwnd: 88 }]);
        await expect(startSavedFengyao()).rejects.toThrow('多个同名游戏窗口');
        expect(session.capture).not.toHaveBeenCalled();
        expect(session.start).not.toHaveBeenCalled();
    });

    it('窗口尺寸变化时要求重新框选', async () => {
        const session = mockSession();
        session.capture.mockResolvedValue({ ...window, width: 900, image: '' });
        await expect(startSavedFengyao()).rejects.toThrow('尺寸已变化');
        expect(session.start).not.toHaveBeenCalled();
    });

    it('已经监听时不重开任务', async () => {
        const session = mockSession();
        session.status.mockResolvedValue({ ...status, running: true });
        await expect(startSavedFengyao()).resolves.toBe('running');
        expect(session.windows).not.toHaveBeenCalled();
        expect(session.start).not.toHaveBeenCalled();
    });
});
