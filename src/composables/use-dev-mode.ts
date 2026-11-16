import { computed, ref } from 'vue';
import { writePreference } from '../services/local-data';
import { notify } from './use-notify';

const STORAGE_KEY = 'mh-dev-mode';

/** 模块级共享开关；存储不可读或值不是 '1' 时默认关闭。 */
function readStoredDevMode(): boolean {
    try {
        return globalThis.localStorage?.getItem(STORAGE_KEY) === '1';
    } catch {
        return false;
    }
}

const enabled = ref(readStoredDevMode());

/** 对外的可写句柄：模板里 `v-model` 直接绑，切换时同时落存储。 */
const devMode = computed({
    get: () => enabled.value,
    set: (value: boolean) => {
        enabled.value = value;
        if (!writePreference(STORAGE_KEY, value ? '1' : '0')) {
            notify.error('本次设置已生效，未能记住');
        }
    },
});

export function useDevMode() {
    return { devMode };
}
