import { computed, effectScope, ref, watch } from 'vue';
import { writePreference } from '../services/local-data';
import { notify } from './use-notify';

export type FontFamily = 'wenkai' | 'sans' | 'serif' | 'zhuque' | 'rounded';

export const FONT_OPTIONS: { value: FontFamily; label: string }[] = [
    { value: 'wenkai', label: '霞鹜文楷' },
    { value: 'sans', label: '思源黑体' },
    { value: 'serif', label: '思源宋体' },
    { value: 'zhuque', label: '朱雀仿宋' },
    { value: 'rounded', label: '资源圆体' },
];

const STORAGE_KEY = 'mh-font-family';

function readStoredFont(): FontFamily {
    try {
        const stored = globalThis.localStorage?.getItem(STORAGE_KEY);
        return FONT_OPTIONS.find((option) => option.value === stored)?.value ?? 'wenkai';
    } catch {
        return 'wenkai';
    }
}

const font = ref<FontFamily>(readStoredFont());
const selectedFont = computed(
    () => FONT_OPTIONS.find((option) => option.value === font.value) ?? FONT_OPTIONS[0]!,
);
const scope = effectScope(true);
let wired = false;

/** 字体独立于主题与字号；监听不随设置页卸载，启动前恢复到根属性。 */
export function useFontFamily() {
    if (!wired) {
        wired = true;
        scope.run(() => {
            watch(
                font,
                (value, previous) => {
                    document.documentElement.dataset.font = value;
                    if (previous !== undefined && !writePreference(STORAGE_KEY, value)) {
                        notify.error('本次设置已生效，未能记住');
                    }
                },
                { immediate: true },
            );
        });
    }
    return { font, selectedFont };
}
