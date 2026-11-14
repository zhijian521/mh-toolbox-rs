const STORAGE_KEY = 'mh-home-shortcuts';

/** 首页入口顺序属于本机偏好，不进入账本备份。 */
export function readHomeShortcuts(): unknown {
    try {
        const raw = globalThis.localStorage?.getItem(STORAGE_KEY);
        return raw ? JSON.parse(raw) : undefined;
    } catch {
        return undefined;
    }
}

export function saveHomeShortcuts(ids: readonly string[]): boolean {
    try {
        if (!globalThis.localStorage) return false;
        globalThis.localStorage.setItem(STORAGE_KEY, JSON.stringify(ids));
        return true;
    } catch {
        return false;
    }
}
