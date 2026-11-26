<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import {
    GlassButton,
    GlassSearch,
    GlassSegment,
    GlassSegmented,
} from '../../components/liquid-glass';
import GlassCompactPager from '../../components/liquid-glass/GlassCompactPager.vue';
import { usePagination } from '../../composables/use-pagination';
import { loadWallpaperImage, WALLPAPER_CDN } from '../../services/xyq-wallpapers';
import { useLiquidPreferences, SYSTEM_WALLPAPERS } from '../../composables/use-liquid-preferences';
import catalog from './xyq-wallpapers.json';

const props = defineProps<{ selected: string; active: boolean }>();
const emit = defineEmits<{ choose: [url: string]; close: [] }>();
const { appearance, systemWallpaper, selectSystemWallpaper } = useLiquidPreferences();
const source = ref<'system' | 'online'>(props.selected ? 'online' : 'system');
function applySystemWallpaper(option: (typeof SYSTEM_WALLPAPERS)[number]) {
    selectSystemWallpaper(option);
    emit('close');
}
const query = ref('');
const matches = computed(() => catalog.filter((item) => item.name.includes(query.value.trim())));
const { page, pages, visible } = usePagination(matches, 6);
const currentIndex = catalog.findIndex((item) => WALLPAPER_CDN + item.image === props.selected);
if (currentIndex >= 0) page.value = Math.floor(currentIndex / 6) + 1;
watch(query, () => (page.value = 1));

const previews = ref<Record<string, string>>({});
let images: string[] = [];
function releasePreviews() {
    for (const url of images) URL.revokeObjectURL(url);
    images = [];
}
onBeforeUnmount(releasePreviews);
watch(
    [visible, () => props.active && source.value === 'online'],
    ([items, active], _, onCleanup) => {
        releasePreviews();
        if (!active) return;
        const controller = new AbortController();
        previews.value = {};
        onCleanup(() => controller.abort());
        for (const path of new Set(items.map((item) => item.thumb))) {
            void loadWallpaperImage(WALLPAPER_CDN + path, controller.signal)
                .then((image) => {
                    if (controller.signal.aborted) return URL.revokeObjectURL(image);
                    images.push(image);
                    previews.value[path] = image;
                })
                .catch(() => {
                    if (!controller.signal.aborted) previews.value[path] = '';
                });
        }
    },
    { immediate: true },
);
</script>

<template>
    <div class="wallpaper-picker lg-form-fields">
        <header>
            <h2>选择壁纸</h2>
            <GlassButton size="small" variant="plain" @click="emit('close')">关闭</GlassButton>
        </header>
        <GlassSegmented
            v-model:value="source"
            class="wallpaper-sources lg-equal-pair"
            aria-label="壁纸来源"
        >
            <GlassSegment value="system">系统壁纸</GlassSegment>
            <GlassSegment value="online">官网壁纸</GlassSegment>
        </GlassSegmented>
        <template v-if="source === 'system'">
            <p class="lg-caption">随浅色和深色主题自动切换。</p>
            <div class="wallpaper-grid" role="group" aria-label="系统壁纸">
                <button
                    v-for="option in SYSTEM_WALLPAPERS"
                    :key="option.id"
                    type="button"
                    class="wallpaper-tile"
                    :aria-pressed="systemWallpaper?.id === option.id"
                    @click="applySystemWallpaper(option)"
                >
                    <span class="wallpaper-thumb">
                        <img :src="option.thumbnail[appearance]" alt="" decoding="async" />
                    </span>
                    <span class="wallpaper-name">{{ option.name }}</span>
                </button>
            </div>
        </template>
        <template v-else>
            <GlassSearch
                v-model:value="query"
                class="lg-price-search"
                aria-label="搜索壁纸名称"
                placeholder="搜索壁纸名称"
            />
            <div v-if="visible.length" class="wallpaper-grid">
                <button
                    v-for="item in visible"
                    :key="item.image"
                    type="button"
                    class="wallpaper-tile"
                    :aria-pressed="WALLPAPER_CDN + item.image === selected"
                    @click="emit('choose', WALLPAPER_CDN + item.image)"
                >
                    <span class="wallpaper-thumb">
                        <img v-if="previews[item.thumb]" :src="previews[item.thumb]" alt="" />
                        <small v-else>{{
                            previews[item.thumb] === '' ? '暂无预览' : '载入中…'
                        }}</small>
                    </span>
                    <span class="wallpaper-name">{{ item.name }}</span>
                </button>
            </div>
            <p v-else role="status">没有找到匹配的壁纸。</p>
            <GlassCompactPager v-model:page="page" :pages="pages" label="壁纸分页" />
        </template>
    </div>
</template>

<style scoped>
/* 弹窗面板半透明，按钮文字统一用页面墨色并关掉材质文字阴影
 * （阴影在 glass-button.lg-component 已全局关，这里只补前景与字距）。 */
.wallpaper-picker {
    --glass-foreground: var(--liquid-ink);
    --glass-accent-text: var(--liquid-ink);
    display: grid;
    gap: 12px;
}
.wallpaper-picker glass-button {
    letter-spacing: normal;
}
.wallpaper-picker header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 4px 8px;
    flex-wrap: wrap;
}
.wallpaper-picker :is(h2, p) {
    margin: 0;
}
.wallpaper-sources {
    width: min(168px, 100%);
}
.wallpaper-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 9px;
}
.wallpaper-tile {
    padding: 0;
    overflow: hidden;
    /* `overflow: hidden` 也是滚动容器，会被公共规则的 `scrollbar-gutter: stable`
     * 预留一条 10px 轨道：卡片 170px、内容只剩 158px，缩略图铺满后右侧露出
     * 一条白底。与 .lg-scroll-hidden 同一口径，这里显式撤掉 gutter。 */
    scrollbar-gutter: auto;
    border: 1px solid var(--liquid-outline);
    border-radius: 10px;
    background: var(--lg-content-base);
    color: inherit;
    font: inherit;
    text-align: left;
    cursor: pointer;
}
@media (hover: hover) {
    .wallpaper-tile:hover {
        background-color: var(--lg-field-fill);
        border-color: var(--liquid-muted);
    }
}
.wallpaper-tile[aria-pressed='true'] {
    border-color: var(--liquid-muted);
    background: var(--lg-field-active-fill);
    box-shadow: var(--lg-edge-rim);
}
.wallpaper-tile:focus-visible {
    border-color: transparent;
    outline-offset: -2px;
}
.wallpaper-thumb {
    display: grid;
    place-items: center;
    width: 100%;
    aspect-ratio: 16 / 9;
    background: var(--liquid-outline);
}
.wallpaper-thumb img {
    width: 100%;
    height: 100%;
    min-height: 0;
    object-fit: cover;
}
.wallpaper-name {
    display: block;
    padding: 5px 7px;
    font-size: var(--fs-sm);
    overflow-wrap: anywhere;
}
@media (max-width: 480px) {
    .wallpaper-grid {
        grid-template-columns: repeat(2, minmax(0, 1fr));
    }
}
</style>
