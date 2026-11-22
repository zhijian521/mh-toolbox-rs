<script setup lang="ts">
import { computed, ref } from 'vue';
import GlassDialog from '../components/liquid-glass/GlassDialog.vue';
import { GlassButton, GlassCard, GlassSegment, GlassSegmented } from '../components/liquid-glass';
import { useLiquidPreferences } from '../composables/use-liquid-preferences';
import { WALLPAPER_CDN } from '../services/xyq-wallpapers';
import LiquidWallpaperPicker from './settings/LiquidWallpaperPicker.vue';
import catalog from './settings/xyq-wallpapers.json';

const {
    appearance,
    wallpaper,
    activeImage,
    selectedWallpaper,
    loadingWallpaper,
    failedWallpaper,
    selectWallpaper,
} = useLiquidPreferences();
const pickerOpen = ref(false);
const currentName = computed(
    () =>
        catalog.find((item) => WALLPAPER_CDN + item.image === selectedWallpaper.value)?.name ??
        '官网壁纸',
);

function applyWallpaper(url: string) {
    pickerOpen.value = false;
    void selectWallpaper(url);
}
</script>

<template>
    <section class="liquid-settings" aria-labelledby="liquid-settings-title">
        <h1 id="liquid-settings-title">设置</h1>
        <GlassCard class="liquid-settings-panel" :radius="16">
            <div class="liquid-settings-row">
                <span id="liquid-theme-label">主题</span>
                <GlassSegmented v-model:value="appearance" aria-labelledby="liquid-theme-label">
                    <GlassSegment value="light">浅色</GlassSegment>
                    <GlassSegment value="dark">深色</GlassSegment>
                </GlassSegmented>
            </div>
            <div class="liquid-settings-row background-row">
                <div class="background-label">
                    <img :src="wallpaper" alt="" class="current-wallpaper" />
                    <div>
                        <span>应用背景</span>
                        <small aria-live="polite">{{
                            loadingWallpaper
                                ? '正在载入壁纸…'
                                : activeImage
                                  ? currentName
                                  : '默认壁纸 · 随主题切换'
                        }}</small>
                    </div>
                </div>
                <div class="background-actions">
                    <GlassButton
                        v-if="selectedWallpaper || loadingWallpaper || failedWallpaper"
                        size="small"
                        variant="plain"
                        @click="applyWallpaper('')"
                        >恢复默认</GlassButton
                    >
                    <GlassButton size="small" aria-haspopup="dialog" @click="pickerOpen = true"
                        >选择壁纸</GlassButton
                    >
                </div>
            </div>
            <div v-if="failedWallpaper" role="status" class="background-error">
                <span>壁纸未能载入，请检查网络。</span>
                <GlassButton size="small" variant="plain" @click="selectWallpaper(failedWallpaper)"
                    >重试</GlassButton
                >
            </div>
        </GlassCard>
        <GlassDialog
            v-model:open="pickerOpen"
            class="wallpaper-dialog"
            label="选择官网壁纸"
            detents="82% large"
        >
            <LiquidWallpaperPicker
                v-if="pickerOpen"
                :selected="selectedWallpaper"
                @select="applyWallpaper"
                @close="pickerOpen = false"
            />
        </GlassDialog>
    </section>
</template>

<style scoped>
.liquid-settings {
    width: var(--liquid-column-width);
    margin: 0 auto;
    padding: 16px 0;
}

.liquid-settings h1 {
    margin: 0 0 10px;
}

.liquid-settings-panel {
    --glass-foreground: var(--liquid-ink);
    --glass-text-shadow: none;
    display: block;
    padding-inline: 12px;
    background-color: light-dark(#efffec45, #14241f40);
}

.liquid-settings-row {
    display: flex;
    flex-wrap: wrap;
    justify-content: space-between;
    align-items: center;
    gap: 6px 12px;
    min-height: 44px;
    padding-block: 6px;
}

.liquid-settings-row + .liquid-settings-row {
    border-top: 1px solid var(--liquid-outline);
}

.liquid-settings-row glass-segmented {
    --glass-segmented-height: 30px;
    --glass-segmented-track: light-dark(#d8e8dfbd, #091511bd);
    --glass-segmented-thumb: light-dark(
        color-mix(in srgb, var(--glass-tab-selection), #f6fff9 82%),
        var(--glass-tab-selection)
    );
    --glass-segmented-selected: var(--glass-tab-selected);
    letter-spacing: normal;
}

.liquid-settings-row glass-segment {
    padding-inline: 10px;
}
.background-label,
.background-actions,
.background-error {
    display: flex;
    align-items: center;
    gap: 8px;
}
.background-label {
    flex: 1 1 160px;
    min-width: 0;
}
.background-label small {
    display: block;
    color: var(--liquid-ink);
    opacity: 0.8;
    overflow-wrap: anywhere;
}
.current-wallpaper {
    width: 48px;
    height: 32px;
    object-fit: cover;
    border: 1px solid var(--liquid-outline);
    border-radius: 7px;
}
.background-error {
    padding-bottom: 8px;
    font-size: var(--fs-sm);
}
.wallpaper-dialog {
    --glass-dialog-width: 580px;
}
</style>
