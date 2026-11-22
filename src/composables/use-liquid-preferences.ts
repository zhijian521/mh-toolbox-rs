import { ref, watch } from 'vue';
import type { GlassMode } from '../components/liquid-glass';

const themeKey = 'mh-liquid-appearance';
const materialKey = 'mh-liquid-material';
const appearance = ref<'light' | 'dark'>(
    localStorage.getItem(themeKey) === 'dark' ? 'dark' : 'light',
);
const material = ref<GlassMode>(
    localStorage.getItem(materialKey) === 'clear' ? 'clear' : 'frosted',
);

watch(appearance, (value) => localStorage.setItem(themeKey, value));
watch(material, (value) => localStorage.setItem(materialKey, value));

export function useLiquidPreferences() {
    return { appearance, material };
}
