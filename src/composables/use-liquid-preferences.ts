import { computed, ref, shallowRef, watch } from 'vue';
import { readPreference, writePreference } from '../services/local-data';
import { isWallpaperUrl, loadWallpaperImage } from '../services/xyq-wallpapers';
import lightWallpaper from '../../assets/textures/liquid-wallpaper-light.webp';
import darkWallpaper from '../../assets/textures/liquid-wallpaper-dark.webp';

function wallpaperPair(id: string, name: string) {
    return {
        id,
        name,
        light: new URL(`../../assets/textures/wallpaper-previews/${id}-light.webp`, import.meta.url).href,
        dark: new URL(`../../assets/textures/wallpaper-previews/${id}-dark.webp`, import.meta.url).href,
        thumbnail: {
            light: new URL(`../../assets/textures/wallpaper-previews/thumbs/${id}-light.webp`, import.meta.url).href,
            dark: new URL(`../../assets/textures/wallpaper-previews/thumbs/${id}-dark.webp`, import.meta.url).href,
        },
    };
}

export const SYSTEM_WALLPAPERS = [
    wallpaperPair('curvy', '银灰曲线'),
    wallpaperPair('blendpills', '彩色胶囊'),
    wallpaperPair('glass-chip', '玻璃花瓣'),
    wallpaperPair('fold', '暖色折面'),
    wallpaperPair('tahoe', 'macOS Tahoe · 玻璃波纹'),
    wallpaperPair('monterey', 'macOS Monterey · 紫色山脊'),
    wallpaperPair('beach', 'macOS Tahoe · 湖畔昼夜'),
];


const themeKey = 'mh-liquid-appearance';
const appearance = ref<'light' | 'dark'>(readPreference(themeKey) === 'dark' ? 'dark' : 'light');

const wallpaperKey = 'mh-liquid-wallpaper';
const saved = readPreference(wallpaperKey) ?? '';
const systemWallpaper = shallowRef(SYSTEM_WALLPAPERS.find((item) => `system:${item.id}` === saved));
const selectedWallpaper = ref(isWallpaperUrl(saved) ? saved : '');
const activeImage = ref('');
const loadingWallpaper = ref('');
const failedWallpaper = ref('');
const displayedWallpaper = computed(() => {
    const theme = appearance.value;
    if (systemWallpaper.value) return { source: 'system', image: systemWallpaper.value[theme] };
    if (activeImage.value) return { source: 'online', image: activeImage.value };
    return { source: 'default', image: theme === 'dark' ? darkWallpaper : lightWallpaper };
});
const wallpaper = computed(() => displayedWallpaper.value.image);
const wallpaperSource = computed(() => displayedWallpaper.value.source);
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
    systemWallpaper.value = option;
    writePreference(wallpaperKey, option ? `system:${option.id}` : '');
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
        systemWallpaper.value = undefined;
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
        selectSystemWallpaper,
        activeImage,
        selectedWallpaper,
        loadingWallpaper,
        failedWallpaper,
        selectWallpaper,
    };
}
