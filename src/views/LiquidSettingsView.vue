<script setup lang="ts">
import { GlassCard, GlassSegment, GlassSegmented } from '../components/liquid-glass';
import { useLiquidPreferences } from '../composables/use-liquid-preferences';

const { appearance, material } = useLiquidPreferences();
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
            <div class="liquid-settings-row">
                <span id="liquid-material-label">应用材质</span>
                <GlassSegmented v-model:value="material" aria-labelledby="liquid-material-label">
                    <GlassSegment value="clear">通透</GlassSegment>
                    <GlassSegment value="frosted">磨砂</GlassSegment>
                </GlassSegmented>
            </div>
        </GlassCard>
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
</style>
