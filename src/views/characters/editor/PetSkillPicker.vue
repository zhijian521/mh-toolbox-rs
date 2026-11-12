<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import PressButton from '../../../components/PressButton.vue';
import {
    loadPetAssets,
    petAssets,
    petAssetsError,
    petAssetsLoading,
} from '../../../services/pet-assets';
import PetImage from '../PetImage.vue';
import { usePetPickerPanel } from './use-pet-picker-panel';

/** 一格技能对应一个选择浮层；开合、外点与 Esc 留在此处，定位与皮肤由两类选择器共用。 */
const props = defineProps<{ index: number }>();
const emit = defineEmits<{ remove: [] }>();
const selected = defineModel<string>({ default: '' });
const root = ref<HTMLElement | null>(null);
const trigger = ref<HTMLButtonElement | null>(null);
const panel = ref<HTMLElement | null>(null);
const search = ref<HTMLInputElement | null>(null);
const open = ref(false);
const query = ref('');
const limit = ref(48);
const { panelStyle, flipUp } = usePetPickerPanel(root, panel, search, open);
const filtered = computed(() => {
    const needle = query.value.trim();
    const all = petAssets.value?.skills ?? [];
    return needle ? all.filter((one) => one.name.includes(needle)) : all;
});
function load() {
    void loadPetAssets().catch(() => {});
}
onMounted(load);

function closePanel(returnFocus = false) {
    if (!open.value) return;
    open.value = false;
    if (returnFocus) void nextTick(() => trigger.value?.focus({ preventScroll: true }));
}
function onEscape(event: KeyboardEvent) {
    if (!open.value) return;
    event.preventDefault();
    event.stopPropagation();
    closePanel(true);
}
function toggle() {
    if (open.value) closePanel();
    else {
        query.value = '';
        limit.value = 48;
        open.value = true;
    }
}
function choose(name: string) {
    selected.value = name;
    closePanel(true);
}
function clear() {
    emit('remove');
    closePanel();
}
function onPointerDown(event: PointerEvent) {
    if (root.value?.contains(event.target as Node)) return;
    closePanel();
}
onMounted(() => document.addEventListener('pointerdown', onPointerDown));
onBeforeUnmount(() => document.removeEventListener('pointerdown', onPointerDown));
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
            <div class="skill-tools pet-picker-tools">
                <input
                    ref="search"
                    v-model="query"
                    class="field"
                    type="search"
                    placeholder="搜索技能"
                    aria-label="搜索召唤兽技能"
                    :disabled="!petAssets"
                    @input="limit = 48"
                />
                <PressButton
                    v-if="selected"
                    danger
                    text="清除"
                    :label="'清除第 ' + (props.index + 1) + ' 个技能'"
                    size="sm"
                    @click="clear"
                />
            </div>
            <p v-if="petAssetsLoading" class="pet-picker-state" role="status">
                正在加载召唤兽资源…
            </p>
            <p v-else-if="petAssetsError" class="pet-picker-state error" role="alert">
                {{ petAssetsError }}
                <PressButton text="重试" label="重试加载召唤兽技能" size="sm" @click="load" />
            </p>
            <div v-if="petAssets && filtered.length" class="skill-grid pet-picker-grid">
                <button
                    v-for="one in filtered.slice(0, limit)"
                    :key="one.id"
                    class="pet-picker-choice"
                    type="button"
                    :aria-pressed="selected === one.name"
                    :aria-label="'选择技能：' + one.name"
                    @click="choose(one.name)"
                >
                    <PetImage :name="one.name" /><span>{{ one.name }}</span>
                </button>
            </div>
            <p v-if="petAssets && !filtered.length" class="pet-picker-state" role="status">
                未找到技能
            </p>
            <PressButton
                v-if="filtered.length > limit"
                class="skill-more pet-picker-more"
                text="显示更多"
                label="显示更多召唤兽技能"
                size="sm"
                @click="limit += 48"
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
