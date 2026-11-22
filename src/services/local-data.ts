/** 本地业务数据区分未保存与读取失败；失败时由数据层暂停覆盖。 */
export type LocalData<T> = { ok: true; value: T | null } | { ok: false; error: string };

function readFailure(error: unknown): LocalData<never> {
    console.error('读取本地数据失败', error);
    return { ok: false, error: '本地数据读取失败，已暂停写入以免覆盖原有数据' };
}

/** 首次读取与跨窗口同步共用；删除键与损坏数据是两种结果。 */
export function parseLocalData<T>(raw: string | null, parse: (raw: unknown) => T): LocalData<T> {
    try {
        return { ok: true, value: raw === null ? null : parse(JSON.parse(raw)) };
    } catch (error) {
        return readFailure(error);
    }
}

export function readLocalData<T>(key: string, parse: (raw: unknown) => T): LocalData<T> {
    try {
        if (!globalThis.localStorage) throw new Error('本地存储不可用');
        return parseLocalData(globalThis.localStorage.getItem(key), parse);
    } catch (error) {
        return readFailure(error);
    }
}

export function writeLocalData(key: string, value: unknown): void {
    if (!globalThis.localStorage) throw new Error('本地存储不可用');
    globalThis.localStorage.setItem(key, JSON.stringify(value));
}

/** 集合损坏时拒绝整份读取，不把残缺列表当作可保存的数据。 */
export function parseLocalList<T>(raw: unknown, parse: (raw: unknown) => T[]): T[] {
    if (!Array.isArray(raw)) throw new TypeError('数据不是数组');
    const list = parse(raw);
    if (list.length !== raw.length) throw new TypeError('存在无法读取的记录');
    return list;
}

/** 偏好不可读时使用默认值，业务数据仍走带错误回执的独立读取路径。 */
export function readPreference(key: string): string | null {
    try {
        return globalThis.localStorage?.getItem(key) ?? null;
    } catch {
        return null;
    }
}

/** 偏好仍按原始字符串保存；记忆失败不撤销本次界面选择。 */
export function writePreference(key: string, value: string): boolean {
    try {
        if (!globalThis.localStorage) throw new Error('本地存储不可用');
        globalThis.localStorage.setItem(key, value);
        return true;
    } catch (error) {
        console.error('保存偏好失败：' + key, error);
        return false;
    }
}
