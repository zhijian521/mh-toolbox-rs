/** 后台监听的唯一系统入口；页面离开和最小化不停止 Rust 任务。 */
import { commands, type MessageRegion, type WatchConfig } from './bindings';
import { readLocalData, writePreference } from './local-data';

export type { MessageRegion, WatchConfig, WatchStatus_Serialize as WatchStatus, WindowShot } from './bindings';

export const fengyaoStatus = () => commands.fengyaoStatus();
export const captureFengyaoWindow = (hwnd: number) => commands.fengyaoCapture(hwnd);
export const startFengyao = (config: WatchConfig) => commands.fengyaoStart(config);
export const stopFengyao = () => commands.fengyaoStop();

const PREFERENCES_KEY = 'mh-fengyao-preferences';

export interface FengyaoPreferences {
    scenes: string[];
    windowTitle: string;
    region: MessageRegion | null;
}

/** 选区同时用于启动条件和偏好读取，拒绝越界与无法识别的小区域。 */
export function isMessageRegion(raw: unknown): raw is MessageRegion {
    if (!raw || typeof raw !== 'object') return false;
    const r = raw as MessageRegion;
    return [r.x, r.y, r.width, r.height, r.frameWidth, r.frameHeight].every(
        (value) => Number.isInteger(value) && value >= 0,
    ) && r.width >= 80 && r.height >= 25 && r.frameWidth <= 16384 && r.frameHeight <= 16384
        && r.x + r.width <= r.frameWidth && r.y + r.height <= r.frameHeight;
}

function parsePreferences(raw: unknown): FengyaoPreferences {
    if (!raw || typeof raw !== 'object') throw new TypeError('封妖设置无效');
    const value = raw as Record<string, unknown>;
    if (!Array.isArray(value.scenes)
        || !value.scenes.every((scene): scene is string => typeof scene === 'string' && scene.length > 0)
        || typeof value.windowTitle !== 'string'
        || (value.region !== null && !isMessageRegion(value.region))) {
        throw new TypeError('封妖设置无效');
    }
    return {
        scenes: [...new Set(value.scenes)],
        windowTitle: value.windowTitle,
        region: value.region,
    };
}

export const readFengyaoPreferences = () => readLocalData(PREFERENCES_KEY, parsePreferences);

/** 记住手动选择；读取失败时保留原件，本次监听仍可继续。 */
export function saveFengyaoPreferences(value: FengyaoPreferences): boolean {
    if (!readFengyaoPreferences().ok) return false;
    return writePreference(PREFERENCES_KEY, JSON.stringify(value));
}
