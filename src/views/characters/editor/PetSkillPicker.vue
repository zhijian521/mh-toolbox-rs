<script setup lang="ts">
import { nextTick, ref } from 'vue';
import { petAssetsLoading } from '../../../services/pet-assets';
import PetImage from '../PetImage.vue';
import PetAssetPickerPanel from './PetAssetPickerPanel.vue';
import { usePetPickerPanel } from './use-pet-picker-panel';

/** 每格保留独立触发器，候选资源与交互共用选择面板。 */
const props = defineProps<{ index: number }>();
const emit = defineEmits<{ remove: [] }>();
const selected = defineModel<string>({ default: '' });
const root = ref<HTMLElement | null>(null);
const trigger = ref<HTMLButtonElement | null>(null);
const panel = ref<HTMLElement | null>(null);
const open = ref(false);
const { panelStyle, flipUp, onEscape } = usePetPickerPanel(root, panel, open, closePanel);

function closePanel(returnFocus = false) {
    if (!open.value) return;
    open.value = false;
    if (returnFocus) void nextTick(() => trigger.value?.focus({ preventScroll: true }));
}
function toggle() {
    if (open.value) closePanel();
    else open.value = true;
}
function choose(name: string) {
    selected.value = name;
    closePanel(true);
}
function clear() {
    emit('remove');
    closePanel();
}
</script>

<template>
    <div ref="root" class="slot skill-picker" @keydown.esc="onEscape">
        <button
            ref="trigger"
            type="button"
            class="skill-trigger"
            :aria-label="'第 ' + (props.index + 1) + ' 个技能：' + (selected || '未选择')"
            :aria-expanded="open"
            @click="toggle"
        >
            <PetImage v-if="selected" :name="selected" />
            <small :class="{ empty: !selected }">{{ selected || '选择技能' }}</small>
        </button>
        <div
            v-if="open"
            ref="panel"
            class="skill-panel pet-picker-panel"
            :class="{ up: flipUp }"
            :style="panelStyle"
            role="group"
            :aria-label="'选择第 ' + (props.index + 1) + ' 个技能'"
            :aria-busy="petAssetsLoading"
        >
            <PetAssetPickerPanel
                kind="skill"
                :selected="selected"
                :clear-label="'清除第 ' + (props.index + 1) + ' 个技能'"
                @choose="choose"
                @clear="clear"
            />
        </div>
    </div>
</template>

<style scoped>
.skill-picker {
    position: relative;
}
.skill-trigger {
    display: grid;
    justify-items: center;
    gap: 5px;
    width: 100%;
    padding: 4px 2px;
    border: var(--w-hair) solid transparent;
    border-radius: var(--r-2);
    background: transparent;
    color: inherit;
    font: inherit;
    cursor: pointer;
    transition:
        border-color var(--t-quick) var(--ease-soft),
        background var(--t-quick) var(--ease-soft);
}
.skill-trigger:hover,
.skill-trigger[aria-expanded='true'] {
    border-color: var(--rule-2);
    background: var(--paper-2);
}
.skill-trigger:focus-visible {
    outline: var(--ring);
    outline-offset: var(--ring-offset);
}
.skill-trigger small {
    color: var(--ink-2);
    font-size: var(--fs-mini);
    text-align: center;
    overflow-wrap: anywhere;
}
.skill-trigger small.empty {
    color: var(--muted);
}
</style>
