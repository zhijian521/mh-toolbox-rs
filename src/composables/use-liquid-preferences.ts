import { computed, ref, watch } from 'vue';
import { readPreference, writePreference } from '../services/local-data';
import { isWallpaperUrl, loadWallpaperImage } from '../services/xyq-wallpapers';
import lightWallpaper from '../../assets/textures/liquid-wallpaper-light.webp';
import darkWallpaper from '../../assets/textures/liquid-wallpaper-dark.webp';

const themeKey = 'mh-liquid-appearance';
const appearance = ref<'light' | 'dark'>(readPreference(themeKey) === 'dark' ? 'dark' : 'light');

/** 液态支线只提供霞鹜文楷与资源圆体两档；不与正式版的三档 mh-font-family 共用，
 *  免得「系统默认」流进来后玻璃组件失去统一的字形。默认仍是支线原本的圆体。 */
export type LiquidFont = 'wenkai' | 'rounded';
const fontKey = 'mh-liquid-font';
const font = ref<LiquidFont>(readPreference(fontKey) === 'wenkai' ? 'wenkai' : 'rounded');

const wallpaperKey = 'mh-liquid-wallpaper';
const saved = readPreference(wallpaperKey) ?? '';
const selectedWallpaper = ref(isWallpaperUrl(saved) ? saved : '');
const activeImage = ref('');
const loadingWallpaper = ref('');
const failedWallpaper = ref('');
const wallpaper = computed(
    () => activeImage.value || (appearance.value === 'dark' ? darkWallpaper : lightWallpaper),
);
let request: AbortController | undefined;

function replaceImage(next: string) {
    const previous = activeImage.value;
    activeImage.value = next;
    if (previous) URL.revokeObjectURL(previous);
}

async function selectWallpaper(url: string) {
    request?.abort();
    loadingWallpaper.value = '';
    failedWallpaper.value = '';
    if (!url) {
        replaceImage('');
        selectedWallpaper.value = '';
        writePreference(wallpaperKey, '');
        return;
    }
    if (activeImage.value && url === selectedWallpaper.value) return;
    const controller = new AbortController();
    request = controller;
    loadingWallpaper.value = url;
    try {
        const image = await loadWallpaperImage(url, controller.signal);
        if (controller.signal.aborted) {
            URL.revokeObjectURL(image);
            return;
        }
        replaceImage(image);
        selectedWallpaper.value = url;
        writePreference(wallpaperKey, url);
    } catch {
        if (!controller.signal.aborted) failedWallpaper.value = url;
    } finally {
        if (request === controller) {
            loadingWallpaper.value = '';
            request = undefined;
        }
    }
}

if (selectedWallpaper.value) void selectWallpaper(selectedWallpaper.value);
if (import.meta.hot)
    import.meta.hot.dispose(() => {
        request?.abort();
        replaceImage('');
    });

watch(appearance, (value) => writePreference(themeKey, value));
watch(font, (value) => writePreference(fontKey, value));

export function useLiquidPreferences() {
    return {
        appearance,
        font,
        wallpaper,
        activeImage,
        selectedWallpaper,
        loadingWallpaper,
        failedWallpaper,
        selectWallpaper,
    };
}
