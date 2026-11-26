import { computed, ref, shallowRef, watch } from 'vue';
import { readPreference, writePreference } from '../services/local-data';
import { isWallpaperUrl, loadWallpaperImage } from '../services/xyq-wallpapers';

function wallpaperPair(id: string, name: string) {
    return {
        id,
        name,
        light: new URL(`../../assets/textures/wallpaper-previews/${id}-light.webp`, import.meta.url)
            .href,
        dark: new URL(`../../assets/textures/wallpaper-previews/${id}-dark.webp`, import.meta.url)
            .href,
        thumbnail: {
            light: new URL(
                `../../assets/textures/wallpaper-previews/thumbs/${id}-light.webp`,
                import.meta.url,
            ).href,
            dark: new URL(
                `../../assets/textures/wallpaper-previews/thumbs/${id}-dark.webp`,
                import.meta.url,
            ).href,
        },
    };
}

const defaultWallpaper = wallpaperPair('beach', 'macOS Tahoe · 湖畔昼夜');
export const SYSTEM_WALLPAPERS = [
    defaultWallpaper,
    wallpaperPair('curvy', '银灰曲线'),
    wallpaperPair('blendpills', '彩色胶囊'),
    wallpaperPair('glass-chip', '玻璃花瓣'),
    wallpaperPair('fold', '暖色折面'),
    wallpaperPair('tahoe', 'macOS Tahoe · 玻璃波纹'),
    wallpaperPair('monterey', 'macOS Monterey · 紫色山脊'),
];

const themeKey = 'mh-liquid-appearance';
const appearance = ref<'light' | 'dark'>(readPreference(themeKey) === 'dark' ? 'dark' : 'light');

const wallpaperKey = 'mh-liquid-wallpaper';
const saved = readPreference(wallpaperKey) ?? '';
const chosenSystemWallpaper = shallowRef(
    SYSTEM_WALLPAPERS.find((item) => `system:${item.id}` === saved),
);
const selectedWallpaper = ref(isWallpaperUrl(saved) ? saved : '');
const activeImage = ref('');
const loadingWallpaper = ref('');
const failedWallpaper = ref('');
const systemWallpaper = computed(() =>
    activeImage.value ? undefined : (chosenSystemWallpaper.value ?? defaultWallpaper),
);
const wallpaper = computed(() => systemWallpaper.value?.[appearance.value] ?? activeImage.value);
const wallpaperSource = computed(() => (systemWallpaper.value ? 'system' : 'online'));
const canResetWallpaper = computed(
    () =>
        systemWallpaper.value?.id !== defaultWallpaper.id ||
        !!(loadingWallpaper.value || failedWallpaper.value),
);
let request: AbortController | undefined;

function replaceImage(next: string) {
    const previous = activeImage.value;
    activeImage.value = next;
    if (previous) URL.revokeObjectURL(previous);
}

function selectSystemWallpaper(option: (typeof SYSTEM_WALLPAPERS)[number] | undefined) {
    request?.abort();
    loadingWallpaper.value = '';
    failedWallpaper.value = '';
    replaceImage('');
    selectedWallpaper.value = '';
    const choice = option?.id === defaultWallpaper.id ? undefined : option;
    chosenSystemWallpaper.value = choice;
    writePreference(wallpaperKey, choice ? `system:${choice.id}` : '');
}

async function selectWallpaper(url: string) {
    request?.abort();
    loadingWallpaper.value = '';
    failedWallpaper.value = '';
    if (!url) return selectSystemWallpaper(undefined);
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
        chosenSystemWallpaper.value = undefined;
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
        wallpaperSource,
        systemWallpaper,
        canResetWallpaper,
        selectSystemWallpaper,
        selectedWallpaper,
        loadingWallpaper,
        failedWallpaper,
        selectWallpaper,
    };
}
