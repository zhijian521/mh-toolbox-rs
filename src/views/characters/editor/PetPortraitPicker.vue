<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import PressButton from '../../../components/PressButton.vue';
import PressTile from '../../../components/PressTile.vue';
import {
    loadPetAssets,
    petAssets,
    petAssetsError,
    petAssetsLoading,
} from '../../../services/pet-assets';
import PetImage from '../PetImage.vue';
import { usePetPickerPanel } from './use-pet-picker-panel';

/** 收起时仅一枚头像，展开后与技能共用浮层定位、资源状态和候选反馈。 */
const selected = defineModel<string>({ default: '' });
const picker = ref<HTMLDetailsElement | null>(null);
const summary = ref<HTMLElement | null>(null);
const panel = ref<HTMLElement | null>(null);
const search = ref<HTMLInputElement | null>(null);
const open = ref(false);
const query = ref('');
const limit = ref(48);
const { panelStyle, flipUp } = usePetPickerPanel(picker, panel, search, open);
const filtered = computed(() =>
    (petAssets.value?.portraits ?? []).filter((one) => one.name.includes(query.value.trim())),
);
function load() {
    void loadPetAssets().catch(() => {});
}
onMounted(load);

function onToggle() {
    const expanded = picker.value?.open ?? false;
    if (expanded && !open.value) {
        query.value = '';
        limit.value = 48;
    }
    open.value = expanded;
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
function onEscape(event: KeyboardEvent) {
    if (!picker.value?.open) return;
    event.preventDefault();
    event.stopPropagation();
    closePanel(true);
}
function onPointerDown(event: PointerEvent) {
    if (picker.value?.contains(event.target as Node)) return;
    closePanel();
}
onMounted(() => document.addEventListener('pointerdown', onPointerDown));
onBeforeUnmount(() => document.removeEventListener('pointerdown', onPointerDown));
</script>

<template>
    <details ref="picker" class="portrait-picker" @toggle="onToggle" @keydown.esc="onEscape">
        <summary ref="summary" aria-label="选择召唤兽头像">
            <PressTile class="portrait-plate">
                <PetImage :name="selected" kind="portrait" />
            </PressTile>
        </summary>
        <div
            ref="panel"
            class="portrait-panel pet-picker-panel"
            :class="{ up: flipUp }"
            :style="panelStyle"
            :aria-busy="petAssetsLoading"
        >
            <div class="portrait-tools pet-picker-tools">
                <input
                    ref="search"
                    v-model="query"
                    class="field"
                    type="search"
                    placeholder="搜索召唤兽"
                    aria-label="搜索召唤兽头像"
                    :disabled="!petAssets"
                    @input="limit = 48"
                />
                <PressButton
                    v-if="selected"
                    text="清除"
                    label="清除召唤兽头像"
                    size="sm"
                    @click="choose('')"
                />
            </div>
            <p v-if="petAssetsLoading" class="pet-picker-state" role="status">
                正在加载召唤兽资源…
            </p>
            <p v-else-if="petAssetsError" class="pet-picker-state error" role="alert">
                {{ petAssetsError }}
                <PressButton text="重试" label="重试加载召唤兽资源" size="sm" @click="load" />
            </p>
            <div v-if="petAssets && filtered.length" class="portrait-grid pet-picker-grid">
                <button
                    v-for="one in filtered.slice(0, limit)"
                    :key="one.id"
                    class="pet-picker-choice"
                    type="button"
                    :aria-pressed="selected === one.id"
                    :aria-label="'选择头像：' + one.name"
                    @click="choose(one.id)"
                >
                    <PetImage :name="one.id" kind="portrait" /><span>{{ one.name }}</span>
                </button>
            </div>
            <p v-if="petAssets && !filtered.length" class="pet-picker-state" role="status">
                未找到头像
            </p>
            <PressButton
                v-if="filtered.length > limit"
                class="portrait-more pet-picker-more"
                text="显示更多"
                label="显示更多召唤兽头像"
                size="sm"
                @click="limit += 48"
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
