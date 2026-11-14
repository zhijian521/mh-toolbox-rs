/** 本地业务数据区分未保存与读取失败；失败时由数据层暂停覆盖。 */
export type LocalData<T> = { ok: true; value: T | null } | { ok: false; error: string };

export function readLocalData<T>(key: string, parse: (raw: unknown) => T): LocalData<T> {
    try {
        if (!globalThis.localStorage) throw new Error('本地存储不可用');
        const raw = globalThis.localStorage.getItem(key);
        return { ok: true, value: raw === null ? null : parse(JSON.parse(raw)) };
    } catch (error) {
        console.error('读取本地数据失败：' + key, error);
        return { ok: false, error: '本地数据读取失败，已暂停写入以免覆盖原有数据' };
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
