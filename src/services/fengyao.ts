/** 后台监听的唯一系统入口；页面离开和最小化不停止 Rust 任务。 */
import {
    commands,
    type MessageRegion,
    type ReminderFilter,
    type ReminderKind,
    type WatchConfig,
} from './bindings';
import { listGhostWindows } from './ghost';
import { readLocalData, writePreference } from './local-data';

export type {
    MessageRegion,
    WatchConfig,
    WatchStatus_Serialize as WatchStatus,
    WindowShot,
} from './bindings';

export const fengyaoStatus = () => commands.fengyaoStatus();
export const captureFengyaoWindow = (hwnd: number) => commands.fengyaoCapture(hwnd);
export const startFengyao = (config: WatchConfig) => commands.fengyaoStart(config);
export const updateFengyao = (reminders: ReminderFilter[]) => commands.fengyaoUpdate(reminders);
export const stopFengyao = () => commands.fengyaoStop();

const PREFERENCES_KEY = 'mh-fengyao-preferences';

export const reminderLabels = {
    fengyao: '封妖',
    yaowang: '妖王',
    yecha: '梦魇夜叉',
    yiguan: '衣冠古丘',
} satisfies Record<ReminderKind, string>;

interface ReminderSetting extends ReminderFilter {
    enabled: boolean;
}

export interface FengyaoPreferences {
    reminders: ReminderSetting[];
    windowTitle: string;
    region: MessageRegion | null;
}

export function defaultReminders(scenes?: string[]): ReminderSetting[] {
    return (Object.keys(reminderLabels) as ReminderKind[]).map((kind) => ({
        kind,
        enabled: kind === 'fengyao' && (scenes === undefined || scenes.length > 0),
        scenes: kind === 'fengyao' ? (scenes ?? []) : [],
    }));
}

export function activeReminders(settings: ReminderSetting[]): ReminderFilter[] {
    return settings.filter(({ enabled }) => enabled).map(({ kind, scenes }) => ({ kind, scenes }));
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

export function parseReminderMaps(input: string): string[] {
    const scenes = [
        ...new Set(
            input
                .split(/[，,、]/u)
                .map((name) => name.trim())
                .filter(Boolean),
        ),
    ];
    if (!isSceneList(scenes)) throw new Error('请输入地图名称，多个地图用逗号分隔');
    return scenes;
}

/** 选区同时用于启动条件和偏好读取，拒绝越界与无法识别的小区域。 */
export function isMessageRegion(raw: unknown): raw is MessageRegion {
    if (!raw || typeof raw !== 'object') return false;
    const r = raw as MessageRegion;
    return (
        [r.x, r.y, r.width, r.height, r.frameWidth, r.frameHeight].every(
            (value) => Number.isInteger(value) && value >= 0,
        ) &&
        r.width >= 80 &&
        r.height >= 25 &&
        r.frameWidth <= 16384 &&
        r.frameHeight <= 16384 &&
        r.x + r.width <= r.frameWidth &&
        r.y + r.height <= r.frameHeight
    );
}

function parsePreferences(raw: unknown): FengyaoPreferences {
    if (!raw || typeof raw !== 'object') throw new TypeError('提醒设置无效');
    const value = raw as Record<string, unknown>;
    if (
        typeof value.windowTitle !== 'string' ||
        (value.region !== null && !isMessageRegion(value.region))
    ) {
        throw new TypeError('提醒设置无效');
    }
    const calibration = { windowTitle: value.windowTitle, region: value.region };
    if (value.reminders === undefined && isSceneList(value.scenes)) {
        return { ...calibration, reminders: defaultReminders([...new Set(value.scenes)]) };
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
        setting.scenes = [...new Set(rawSetting.scenes)];
    }
    if (seen.size !== reminders.length) throw new TypeError('提醒设置无效');
    return { ...calibration, reminders };
}

export const readFengyaoPreferences = () => readLocalData(PREFERENCES_KEY, parsePreferences);

/** 记住手动选择；读取失败时保留原件，本次监听仍可继续。 */
export function saveFengyaoPreferences(value: FengyaoPreferences): boolean {
    if (!readFengyaoPreferences().ok) return false;
    return writePreference(PREFERENCES_KEY, JSON.stringify(value));
}

export async function listFengyaoWindows() {
    const windows = await listGhostWindows();
    return windows.filter(({ title }) => /梦幻西游|mhtab/i.test(title));
}

export function wholeFengyaoFrame({
    width,
    height,
}: Pick<WindowShot, 'width' | 'height'>): MessageRegion {
    return { x: 0, y: 0, width, height, frameWidth: width, frameHeight: height };
}

export function fengyaoRegionMatchesFrame(
    region: MessageRegion | null,
    { width, height }: Pick<WindowShot, 'width' | 'height'>,
): region is MessageRegion {
    return isMessageRegion(region) && region.frameWidth === width && region.frameHeight === height;
}

/** 窗口句柄每次重新获取。整窗模式按截图尺寸生成选区。 */
export async function startSavedFengyao() {
    const status = await fengyaoStatus();
    if (status.running) return 'running';

    const saved = readFengyaoPreferences();
    if (!saved.ok) throw new Error(saved.error);
    const preferences = saved.value;
    if (!preferences?.windowTitle) throw new Error('首次使用请先选择游戏窗口');
    const reminders = activeReminders(preferences.reminders);
    if (!reminders.length) throw new Error('请先开启至少一种提醒');
    const fengyao = reminders.find(({ kind }) => kind === 'fengyao');
    if (fengyao?.scenes.some((scene) => !status.rules.scenes.some(({ name }) => name === scene))) {
        throw new Error('已保存的封妖地图有变化，请重新选择');
    }

    const matches = (await listFengyaoWindows()).filter(
        ({ title }) => title === preferences.windowTitle,
    );
    if (!matches.length) throw new Error('未找到上次使用的游戏窗口');
    if (matches.length > 1) throw new Error('有多个同名游戏窗口，请手动选择');
    const [{ hwnd }] = matches;
    const region = preferences.region;
    const image = await captureFengyaoWindow(hwnd);
    if (image.title !== preferences.windowTitle) throw new Error('游戏窗口已变化，请重新选择');
    if (region && !fengyaoRegionMatchesFrame(region, image)) {
        throw new Error('游戏窗口尺寸已变化，请重新框选或改用整个窗口');
    }
    if ((await fengyaoStatus()).running) return 'running';
    await startFengyao({ hwnd, reminders, region: region ?? wholeFengyaoFrame(image) });
    return 'started';
}
