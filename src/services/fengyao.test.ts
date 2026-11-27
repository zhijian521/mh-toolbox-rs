import { afterEach, describe, expect, it, vi } from 'vitest';
import { commands } from './bindings';
import {
    activeReminders,
    defaultReminders,
    readFengyaoPreferences,
    saveFengyaoPreferences,
    startSavedFengyao,
    type FengyaoPreferences,
    type WatchStatus,
} from './fengyao';

const key = 'mh-fengyao-preferences';
const region = { x: 0, y: 0, width: 740, height: 1024, frameWidth: 740, frameHeight: 1024 };
const legacy = {
    scenes: ['麒麟山', '蓬莱仙岛'],
    windowTitle: '梦幻西游 聊天窗口',
    region: { ...region, y: 330, height: 200 },
};
const preferences: FengyaoPreferences = {
    speechEnabled: false,
    windowTitle: legacy.windowTitle,
    reminders: defaultReminders(legacy.scenes),
};
const disabled = { ...preferences, reminders: defaultReminders([]) };

afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

describe('提醒助手偏好持久化', () => {
    it('保存后还原地图和窗口，主动全关也保留', () => {
        const storage = new Map<string, string>();
        vi.stubGlobal('localStorage', {
            getItem: (name: string) => storage.get(name) ?? null,
            setItem: (name: string, value: string) => storage.set(name, value),
        });
        expect(readFengyaoPreferences()).toEqual({ ok: true, value: null });
        expect(saveFengyaoPreferences(preferences)).toBe(true);
        expect(readFengyaoPreferences()).toEqual({ ok: true, value: preferences });
        expect(storage.get(key)).not.toContain('hwnd');
        expect(storage.get(key)).not.toContain('region');
        expect(saveFengyaoPreferences(disabled)).toBe(true);
        expect(readFengyaoPreferences()).toEqual({ ok: true, value: disabled });
    });

    it('迁移旧设置时保留封妖地图和各类型开关，忽略旧选区与其他地图限制', () => {
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
                      scenes: ['花果山', '长寿郊外'],
                  }
                : setting,
        );
        expect(saveFengyaoPreferences({ ...preferences, reminders })).toBe(true);
        expect(activeReminders(reminders)).toEqual([
            { kind: 'fengyao', scenes: legacy.scenes },
            { kind: 'yecha', scenes: [] },
        ]);
        expect(readFengyaoPreferences()).toEqual({
            ok: true,
            value: {
                ...preferences,
                reminders: reminders.map((setting) =>
                    setting.kind === 'yecha' ? { ...setting, scenes: [] } : setting,
                ),
            },
        });
    });

    it('旧四类设置保留原选择，二十八星宿默认关闭', () => {
        const old = {
            ...preferences,
            speechEnabled: true,
            reminders: preferences.reminders.filter(
                ({ kind }) => kind !== 'stars' && kind !== 'nursery',
            ),
        };
        vi.stubGlobal('localStorage', { getItem: () => JSON.stringify(old) });
        expect(readFengyaoPreferences()).toEqual({
            ok: true,
            value: { ...preferences, speechEnabled: true },
        });
    });

    it('升级五类设置时保留星宿开关，宝宝幼儿园默认关闭', () => {
        const reminders = preferences.reminders.map((entry) =>
            entry.kind === 'stars' ? { ...entry, enabled: true } : entry,
        );
        const old = {
            ...preferences,
            reminders: reminders.filter(({ kind }) => kind !== 'nursery'),
        };
        vi.stubGlobal('localStorage', { getItem: () => JSON.stringify(old) });
        expect(readFengyaoPreferences()).toEqual({
            ok: true,
            value: { ...preferences, reminders },
        });
    });

    it.each([
        '{broken',
        JSON.stringify({ ...legacy, scenes: ['麒麟山', null] }),
        JSON.stringify({ ...preferences, windowTitle: null }),
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
        speechError: '',
        rules: {
            sourceUrl: '',
            checkedOn: '',
            note: '',
            scenes: legacy.scenes.map((name) => ({ name, minLevel: 0, aliases: [] })),
        },
    };

    function mockSession() {
        vi.stubGlobal('localStorage', {
            getItem: () => JSON.stringify({ ...preferences, region: legacy.region }),
        });
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

    it('找回聊天窗口句柄，沿用地图设置并忽略旧选区', async () => {
        const session = mockSession();
        vi.stubGlobal('localStorage', {
            getItem: () =>
                JSON.stringify({ ...preferences, speechEnabled: true, region: legacy.region }),
        });
        await expect(startSavedFengyao()).resolves.toMatchObject({
            started: true,
            status: { running: true },
        });
        expect(session.capture).toHaveBeenCalledWith(window.hwnd);
        expect(session.start).toHaveBeenCalledExactlyOnceWith({
            hwnd: window.hwnd,
            speechEnabled: true,
            reminders: activeReminders(preferences.reminders),
            region,
        });
    });

    it('聊天窗口变更尺寸后按当前整窗尺寸启动', async () => {
        const session = mockSession();
        session.capture.mockResolvedValue({ ...window, width: 900, height: 700, image: '' });
        await expect(startSavedFengyao()).resolves.toMatchObject({
            started: true,
            status: { running: true },
        });
        expect(session.start).toHaveBeenCalledExactlyOnceWith({
            hwnd: window.hwnd,
            speechEnabled: false,
            reminders: activeReminders(preferences.reminders),
            region: { x: 0, y: 0, width: 900, height: 700, frameWidth: 900, frameHeight: 700 },
        });
    });

    it('从总览只开启衣冠古丘时忽略旧地图限制', async () => {
        const session = mockSession();
        const reminders = defaultReminders([]).map((setting) =>
            setting.kind === 'yiguan'
                ? { ...setting, enabled: true, scenes: ['大唐国境'] }
                : setting,
        );
        vi.stubGlobal('localStorage', {
            getItem: () => JSON.stringify({ ...preferences, reminders }),
        });
        await expect(startSavedFengyao()).resolves.toMatchObject({
            started: true,
            status: { running: true },
        });
        expect(session.start).toHaveBeenCalledExactlyOnceWith({
            hwnd: window.hwnd,
            speechEnabled: false,
            reminders: [{ kind: 'yiguan', scenes: [] }],
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

    it('窗口列表读取失败时保留原错误，停止启动', async () => {
        const session = mockSession();
        session.windows.mockRejectedValue(new Error('窗口列表读取失败'));
        await expect(startSavedFengyao()).rejects.toThrow('窗口列表读取失败');
        expect(session.capture).not.toHaveBeenCalled();
        expect(session.start).not.toHaveBeenCalled();
    });

    it('匹配多个同名窗口时不抓取，也不启动', async () => {
        const session = mockSession();
        session.windows.mockResolvedValue([window, { ...window, hwnd: 88 }]);
        await expect(startSavedFengyao()).rejects.toThrow('多个同名聊天窗口');
        expect(session.capture).not.toHaveBeenCalled();
        expect(session.start).not.toHaveBeenCalled();
    });

    it('旧偏好指向游戏主窗口时要求重新选择聊天窗口', async () => {
        const session = mockSession();
        const game = { ...window, title: '梦幻西游 主窗口' };
        session.windows.mockResolvedValue([game]);
        vi.stubGlobal('localStorage', {
            getItem: () => JSON.stringify({ ...preferences, windowTitle: game.title }),
        });
        await expect(startSavedFengyao()).rejects.toThrow('未找到上次使用的独立聊天窗口');
        expect(session.capture).not.toHaveBeenCalled();
        expect(session.start).not.toHaveBeenCalled();
    });

    it('已经监听时不重开任务', async () => {
        const session = mockSession();
        const running = { ...status, running: true };
        session.status.mockResolvedValue(running);
        const result = await startSavedFengyao();
        expect(result.started).toBe(false);
        expect(result.status).toBe(running);
        expect(session.windows).not.toHaveBeenCalled();
        expect(session.start).not.toHaveBeenCalled();
    });
});
