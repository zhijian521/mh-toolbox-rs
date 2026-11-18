<script setup lang="ts">
import { nextTick, ref } from 'vue';
import PressTile from '../../../components/PressTile.vue';
import { petAssetsLoading } from '../../../services/pet-assets';
import PetImage from '../PetImage.vue';
import PetAssetPickerPanel from './PetAssetPickerPanel.vue';
import { usePetPickerPanel } from './use-pet-picker-panel';

/** 收起时只显示头像；候选资源与交互共用选择面板。 */
const selected = defineModel<string>({ default: '' });
const picker = ref<HTMLDetailsElement | null>(null);
const summary = ref<HTMLElement | null>(null);
const panel = ref<HTMLElement | null>(null);
const open = ref(false);
const { panelStyle, flipUp, onEscape } = usePetPickerPanel(picker, panel, open, closePanel);

function onToggle() {
    open.value = picker.value?.open ?? false;
}
function closePanel(returnFocus = false) {
    if (!picker.value?.open) return;
    picker.value.open = false;
    open.value = false;
    if (returnFocus) void nextTick(() => summary.value?.focus({ preventScroll: true }));
}
function choose(id: string) {
    selected.value = id;
    closePanel(true);
}
</script>

<template>
    <details ref="picker" class="portrait-picker" @toggle="onToggle" @keydown.esc="onEscape">
        <summary ref="summary" aria-label="选择召唤兽头像">
            <PressTile class="portrait-plate">
                <PetImage :name="selected" kind="portrait" />
            </PressTile>
        </summary>
        <div
            v-if="open"
            ref="panel"
            class="portrait-panel pet-picker-panel"
            :class="{ up: flipUp }"
            :style="panelStyle"
            :aria-busy="petAssetsLoading"
        >
            <PetAssetPickerPanel
                kind="portrait"
                :selected="selected"
                clear-label="清除召唤兽头像"
                @choose="choose"
                @clear="choose('')"
            />
        </div>
    </details>
</template>

<style scoped>
.portrait-picker {
    position: relative;
    flex: none;
    --pick-size: 64px;
}
summary {
    position: relative;
    display: block;
    width: var(--pick-size);
    height: var(--pick-size);
    list-style: none;
    cursor: pointer;
}
.portrait-plate {
    --tile-w: var(--pick-size);
    --tile-h: var(--pick-size);
    --tile-r: var(--r-3);
    --tile-face: color-mix(in srgb, var(--well) 55%, var(--paper-2));
    --tile-drop: 0.75;
    --tile-face-hover: color-mix(in srgb, var(--well) 40%, var(--paper-2));
    --tile-face-active: color-mix(in srgb, var(--well) 72%, var(--paper-2));
}
summary::-webkit-details-marker {
    display: none;
}
summary::marker {
    content: '';
}
summary :deep(.pet-image.portrait) {
    --pet-icon-size: calc(var(--pick-size) - 8px);
    background: transparent;
}
details[open] summary::after {
    content: '';
    position: absolute;
    bottom: -7px;
    left: 50%;
    width: 22px;
    height: 2px;
    border-radius: 1px;
    background: var(--accent);
    transform: translateX(-50%);
}
summary:focus-visible {
    outline: var(--ring);
    outline-offset: var(--ring-offset);
}
</style>
