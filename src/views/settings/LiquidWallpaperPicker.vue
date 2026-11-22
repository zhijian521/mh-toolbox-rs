<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { GlassButton, GlassSearch } from '../../components/liquid-glass';
import { usePagination } from '../../composables/use-pagination';
import { openExternal } from '../../services/desktop';
import { loadWallpaperImage, WALLPAPER_CDN, WALLPAPER_SITE } from '../../services/xyq-wallpapers';
import catalog from './xyq-wallpapers.json';

const props = defineProps<{ selected: string }>();
const emit = defineEmits<{ select: [url: string]; close: [] }>();
const query = ref('');
const matches = computed(() => catalog.filter((item) => item.name.includes(query.value.trim())));
const { page, pages, visible } = usePagination(matches, 6);
const currentIndex = catalog.findIndex((item) => WALLPAPER_CDN + item.image === props.selected);
if (currentIndex >= 0) page.value = Math.floor(currentIndex / 6) + 1;
watch(query, () => (page.value = 1));

const previews = ref<Record<string, string>>({});
watch(
    visible,
    (items, _, onCleanup) => {
        const controller = new AbortController();
        const images = new Map<string, string>();
        previews.value = {};
        onCleanup(() => {
            controller.abort();
            for (const image of images.values()) URL.revokeObjectURL(image);
        });
        for (const path of new Set(items.map((item) => item.thumb))) {
            void loadWallpaperImage(WALLPAPER_CDN + path, controller.signal)
                .then((image) => {
                    if (controller.signal.aborted) return URL.revokeObjectURL(image);
                    images.set(path, image);
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
    <div class="wallpaper-picker">
        <header>
            <h2>选择官网壁纸</h2>
            <GlassButton size="small" variant="plain" @click="emit('close')">关闭</GlassButton>
        </header>
        <GlassSearch v-model:value="query" aria-label="搜索壁纸名称" placeholder="搜索壁纸名称" />
        <div v-if="visible.length" class="wallpaper-grid">
            <button
                v-for="item in visible"
                :key="item.image"
                type="button"
                class="wallpaper-tile"
                :aria-pressed="WALLPAPER_CDN + item.image === selected"
                @click="emit('select', WALLPAPER_CDN + item.image)"
            >
                <span class="wallpaper-thumb">
                    <img v-if="previews[item.thumb]" :src="previews[item.thumb]" alt="" />
                    <small v-else>{{ previews[item.thumb] === '' ? '暂无预览' : '载入中…' }}</small>
                </span>
                <span class="wallpaper-name">{{ item.name }}</span>
            </button>
        </div>
        <p v-else role="status">没有找到匹配的壁纸。</p>
        <footer>
            <a :href="WALLPAPER_SITE" @click.prevent="openExternal(WALLPAPER_SITE)"
                >梦幻西游壁纸站 ↗</a
            >
            <div v-if="pages > 1" class="wallpaper-pages">
                <GlassButton size="small" variant="plain" :disabled="page <= 1" @click="page--"
                    >上一页</GlassButton
                >
                <span aria-live="polite">{{ page }} / {{ pages }}</span>
                <GlassButton size="small" variant="plain" :disabled="page >= pages" @click="page++"
                    >下一页</GlassButton
                >
            </div>
        </footer>
    </div>
</template>

<style scoped>
.wallpaper-picker {
    display: grid;
    gap: 12px;
}
.wallpaper-picker :is(header, footer),
.wallpaper-pages {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 4px 8px;
    flex-wrap: wrap;
}
.wallpaper-picker :is(h2, p) {
    margin: 0;
}
.wallpaper-picker glass-search {
    --glass-search-height: 32px;
}
.wallpaper-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 9px;
}
.wallpaper-tile {
    padding: 0;
    overflow: hidden;
    border: 1px solid var(--liquid-outline);
    border-radius: 10px;
    background: light-dark(#ffffff4a, #1a292b83);
    color: inherit;
    font: inherit;
    text-align: left;
    cursor: pointer;
}
.wallpaper-tile:is(:hover, [aria-pressed='true']) {
    border-color: var(--liquid-focus);
}
.wallpaper-tile[aria-pressed='true'] {
    box-shadow: 0 0 0 1px var(--liquid-focus);
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
.wallpaper-picker footer {
    font-size: var(--fs-xs);
}
.wallpaper-picker a {
    color: var(--liquid-focus);
}
.wallpaper-pages {
    font-variant-numeric: tabular-nums;
}
@media (max-width: 480px) {
    .wallpaper-grid {
        grid-template-columns: repeat(2, minmax(0, 1fr));
    }
}
</style>
