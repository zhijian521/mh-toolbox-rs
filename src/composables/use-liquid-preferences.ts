import { computed, ref, watch } from 'vue';
import { readPreference, writePreference } from '../services/local-data';
import { isWallpaperUrl, loadWallpaperImage } from '../services/xyq-wallpapers';
import lightWallpaper from '../../assets/textures/liquid-wallpaper-light.webp';
import darkWallpaper from '../../assets/textures/liquid-wallpaper-dark.webp';

const themeKey = 'mh-liquid-appearance';
const appearance = ref<'light' | 'dark'>(readPreference(themeKey) === 'dark' ? 'dark' : 'light');

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

export function useLiquidPreferences() {
    return {
        appearance,
        wallpaper,
        activeImage,
        selectedWallpaper,
        loadingWallpaper,
        failedWallpaper,
        selectWallpaper,
    };
}
