/** 后台监听的唯一系统入口；页面离开和最小化不停止 Rust 任务。 */
import {
    commands,
    type MessageRegion,
    type ReminderFilter,
    type ReminderKind,
    type WatchConfig_Deserialize,
} from './bindings';
import { readLocalData, writePreference } from './local-data';

export type { WatchStatus_Serialize as WatchStatus } from './bindings';

export const fengyaoStatus = () => commands.fengyaoStatus();
export const fengyaoSummary = () => commands.fengyaoSummary();
export const startFengyao = (config: WatchConfig_Deserialize) => commands.fengyaoStart(config);
export const updateFengyao = (reminders: ReminderFilter[]) => commands.fengyaoUpdate(reminders);
export const stopFengyao = () => commands.fengyaoStop();

export const setFengyaoSpeech = (enabled: boolean) => commands.fengyaoSetSpeech(enabled);
export const previewFengyaoSpeech = () => commands.fengyaoPreviewSpeech();

const PREFERENCES_KEY = 'mh-fengyao-preferences';

export const reminderLabels = {
    fengyao: '封妖',
    yaowang: '妖王',
    yecha: '梦魇夜叉',
    yiguan: '衣冠古丘',
    stars: '二十八星宿',
    nursery: '宝宝幼儿园',
} satisfies Record<ReminderKind, string>;

interface ReminderSetting extends ReminderFilter {
    enabled: boolean;
}

export interface FengyaoPreferences {
    reminders: ReminderSetting[];
    windowTitle: string;
    speechEnabled: boolean;
}

export function defaultReminders(scenes?: string[]): ReminderSetting[] {
    return (Object.keys(reminderLabels) as ReminderKind[]).map((kind) => ({
        kind,
        enabled: kind === 'fengyao' && (scenes === undefined || scenes.length > 0),
        scenes: kind === 'fengyao' ? (scenes ?? []) : [],
    }));
}

export function activeReminders(settings: ReminderSetting[]): ReminderFilter[] {
    return settings
        .filter(({ enabled }) => enabled)
        .map(({ kind, scenes }) => ({ kind, scenes: kind === 'fengyao' ? scenes : [] }));
}

function isSceneList(value: unknown): value is string[] {
    return (
        Array.isArray(value) &&
        value.length <= 64 &&
        value.every(
            (scene: unknown) => typeof scene === 'string' && /^[\p{L}\p{N}]{1,40}$/u.test(scene),
        )
    );
}

function parsePreferences(raw: unknown): FengyaoPreferences {
    if (!raw || typeof raw !== 'object') throw new TypeError('提醒设置无效');
    const value = raw as Record<string, unknown>;
    if (typeof value.windowTitle !== 'string') throw new TypeError('提醒设置无效');
    const windowTitle = value.windowTitle;
    if (value.reminders === undefined && isSceneList(value.scenes)) {
        return {
            windowTitle,
            reminders: defaultReminders([...new Set(value.scenes)]),
            speechEnabled: false,
        };
    }
    if (!Array.isArray(value.reminders)) throw new TypeError('提醒设置无效');
    const reminders = defaultReminders();
    const seen = new Set<ReminderKind>();
    for (const rawSetting of value.reminders) {
        if (
            !rawSetting ||
            typeof rawSetting !== 'object' ||
            typeof rawSetting.enabled !== 'boolean' ||
            !isSceneList(rawSetting.scenes)
        ) {
            throw new TypeError('提醒设置无效');
        }
        const setting = reminders.find(({ kind }) => kind === rawSetting.kind);
        if (!setting || seen.has(setting.kind)) throw new TypeError('提醒设置无效');
        seen.add(setting.kind);
        setting.enabled = rawSetting.enabled;
        setting.scenes = setting.kind === 'fengyao' ? [...new Set<string>(rawSetting.scenes)] : [];
    }
    // 旧版只有前四类，新类型沿用默认关闭。
    if (reminders.some(({ kind }) => !['stars', 'nursery'].includes(kind) && !seen.has(kind))) {
        throw new TypeError('提醒设置无效');
    }
    return { windowTitle, reminders, speechEnabled: value.speechEnabled === true };
}

export const readFengyaoPreferences = () => readLocalData(PREFERENCES_KEY, parsePreferences);

/** 记住手动选择；读取失败时保留原件，本次监听仍可继续。 */
export function saveFengyaoPreferences(value: FengyaoPreferences): boolean {
    if (!readFengyaoPreferences().ok) return false;
    return writePreference(PREFERENCES_KEY, JSON.stringify(value));
}

export async function listFengyaoWindows() {
    const windows = await commands.ghostWindows();
    return windows.filter(
        ({ title }) =>
            title.trim() === '聊天窗口' ||
            (/聊天窗口/u.test(title) && /梦幻西游|mhtab/iu.test(title)),
    );
}

export async function readFengyaoFrame(
    hwnd: number,
    expectedTitle: string,
): Promise<MessageRegion> {
    const { width, height, title } = await commands.fengyaoCapture(hwnd);
    if (title !== expectedTitle) throw new Error('聊天窗口已变化，请刷新后重新选择');
    return { x: 0, y: 0, width, height, frameWidth: width, frameHeight: height };
}

/** 通过实时聊天窗口尺寸建立完整画面监听配置。 */
export async function readFengyaoConfig(
    window: { hwnd: number; title: string },
    reminders: ReminderFilter[],
    speechEnabled: boolean,
): Promise<WatchConfig_Deserialize> {
    const region = await readFengyaoFrame(window.hwnd, window.title);
    return { hwnd: window.hwnd, reminders, region, speechEnabled };
}

/** 窗口句柄和完整画面尺寸在每次开启时重新读取。 */
export async function startSavedFengyao() {
    const status = await fengyaoStatus();
    if (status.running) return { status, started: false };

    const saved = readFengyaoPreferences();
    if (!saved.ok) throw new Error(saved.error);
    const preferences = saved.value;
    if (!preferences?.windowTitle) throw new Error('首次使用请先打开并选择独立聊天窗口');
    const reminders = activeReminders(preferences.reminders);
    if (!reminders.length) throw new Error('请先开启至少一种提醒');
    const fengyao = reminders.find(({ kind }) => kind === 'fengyao');
    if (fengyao?.scenes.some((scene) => !status.rules.scenes.some(({ name }) => name === scene))) {
        throw new Error('已保存的封妖地图有变化，请重新选择');
    }

    const matches = (await listFengyaoWindows()).filter(
        ({ title }) => title === preferences.windowTitle,
    );
    if (!matches.length) throw new Error('未找到上次使用的独立聊天窗口，请在提醒助手中重新选择');
    if (matches.length > 1) throw new Error('有多个同名聊天窗口，请手动选择');
    const config = await readFengyaoConfig(matches[0], reminders, preferences.speechEnabled);
    const current = await fengyaoStatus();
    if (current.running) return { status: current, started: false };
    const next = await startFengyao(config);
    return { status: next, started: true };
}
