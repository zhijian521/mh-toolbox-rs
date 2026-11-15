/** 业务读取共用失败与就绪状态；解析、默认值和应用数据由各领域负责。 */
import type { Ref } from 'vue';
import { hasDesktop } from './desktop';
import type { LocalData } from './local-data';

interface LoadOptions<TLocal, TRemote> {
    loaded: Ref<boolean>;
    loadError: Ref<string>;
    error: string;
    readLocal: () => LocalData<TLocal>;
    readRemote: () => Promise<TRemote | null>;
    applyLocal: (value: TLocal | null) => void | Promise<void>;
    applyRemote: (value: TRemote) => void;
}

/** 先应用完整结果再开放写入；读取或解析失败时保留原数据，不能当作空表。 */
export async function loadData<TLocal, TRemote>(
    options: LoadOptions<TLocal, TRemote>,
): Promise<void> {
    options.loaded.value = false;
    try {
        if (hasDesktop()) {
            const value = await options.readRemote();
            if (value === null) {
                options.loadError.value = options.error;
                return;
            }
            options.applyRemote(value);
        } else {
            const result = options.readLocal();
            if (!result.ok) {
                options.loadError.value = result.error;
                return;
            }
            await options.applyLocal(result.value);
        }
        options.loadError.value = '';
        options.loaded.value = true;
    } catch (cause) {
        console.error(options.error, cause);
        options.loadError.value = options.error;
    }
}
