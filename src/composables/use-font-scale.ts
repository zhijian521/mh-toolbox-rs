import { effectScope, ref, watch } from 'vue';
import { writePreference } from '../services/local-data';
import { notify } from './use-notify';

export type FontScale = 'small' | 'default' | 'large';

const STORAGE_KEY = 'mh-font-scale';

/** 模块级共享字号；仅修改根令牌，系数兼顾中文辨识与既有版式。 */
const FACTOR: Record<FontScale, number> = {
    small: 0.92,
    default: 1,
    large: 1.1,
};

/** 存储异常回落默认值；只接受自有档位，排除原型链属性。 */
function readStoredScale(): FontScale {
    try {
        const stored = globalThis.localStorage?.getItem(STORAGE_KEY);
        return stored && Object.hasOwn(FACTOR, stored) ? (stored as FontScale) : 'default';
    } catch {
        return 'default';
    }
}

const scale = ref<FontScale>(readStoredScale());

function apply() {
    document.documentElement.style.setProperty('--fs-scale', String(FACTOR[scale.value]));
}

let wired = false;

/** 独立作用域避免首次调用组件卸载时停止全局偏好同步。 */
const scope = effectScope(true);

function wire() {
    if (wired) return;
    wired = true;
    scope.run(() => {
        watch(scale, () => {
            apply();
            if (!writePreference(STORAGE_KEY, scale.value)) {
                notify.error('本次设置已生效，未能记住');
            }
        });
    });
    apply();
}

export function useFontScale() {
    wire();
    return { scale };
}
