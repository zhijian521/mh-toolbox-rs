import type { Ref } from 'vue';
import { parseLocalData } from './local-data';

/** 浏览器跨页同步；桌面版独占 SQLite 数据目录，不依赖 storage 事件。 */
export function onStorageSync(key: string, apply: (raw: string | null) => void): void {
    if (typeof window === 'undefined') return;

    window.addEventListener('storage', (event) => {
        // null 键代表 clear()，同样需要清空当前数据。
        if (event.key !== null && event.key !== key) return;

        // 删除值与解析失败不同；后者由各 store 保留原数据。
        apply(event.newValue);
    });
}

/** 全份解析成功后才应用；失败保留内存并通过领域读取错误阻止写回。 */
export function onLocalDataSync<T>(
    key: string,
    options: {
        parse: (raw: unknown) => T;
        apply: (value: T | null) => void;
        loadError: Ref<string>;
    },
): void {
    onStorageSync(key, (raw) => {
        const result = parseLocalData(raw, options.parse);
        if (!result.ok) {
            options.loadError.value = result.error;
            return;
        }
        options.apply(result.value);
        options.loadError.value = '';
    });
}
