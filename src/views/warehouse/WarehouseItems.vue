<script setup lang="ts">
/** 仓库与交易共用图标、选中态和只读属性浮层。 */
import { onBeforeUnmount, onMounted, ref, useId, watch } from 'vue';
import AppIcon from '../../components/AppIcon.vue';
import PressTile from '../../components/PressTile.vue';
import GearTip from '../characters/GearTip.vue';
import IconTile from '../characters/IconTile.vue';
import PetImage from '../characters/PetImage.vue';
import PetTip from '../characters/PetTip.vue';
import { useGearIcon } from '../characters/use-gear-icon';
import { warehouseName, type ReadonlyWarehouseItem } from './warehouse';

const props = withDefaults(defineProps<{
    items: readonly ReadonlyWarehouseItem[];
    labelPrefix?: string;
    disabled?: boolean;
    selectable?: boolean;
    selectedIds?: ReadonlySet<string>;
    inspectOnly?: boolean;
}>(), { labelPrefix: '查看并修改' });
const emit = defineEmits<{ itemclick: [item: ReadonlyWarehouseItem] }>();
const { icon } = useGearIcon();
const tipId = useId();
const hovered = ref<ReadonlyWarehouseItem | null>(null);
const anchor = ref<DOMRect | null>(null);
let hideTimer: ReturnType<typeof setTimeout> | undefined;

function keepTip() {
    clearTimeout(hideTimer);
}
function hideTip() {
    keepTip();
    hovered.value = null;
    anchor.value = null;
}
function scheduleHide() {
    keepTip();
    // 图标与浮层之间留出鼠标通过的时间，长详情可在浮层内滚动。
    hideTimer = setTimeout(hideTip, 160);
}
function showTip(item: ReadonlyWarehouseItem, event: Event) {
    if (props.disabled) return;
    keepTip();
    anchor.value = (event.currentTarget as HTMLElement).getBoundingClientRect();
    hovered.value = item;
}
function dismissTip(event: KeyboardEvent) {
    if (!hovered.value) return;
    event.stopPropagation();
    hideTip();
}
function activate(item: ReadonlyWarehouseItem, event: MouseEvent) {
    if (props.disabled) return;
    if (props.inspectOnly) showTip(item, event);
    else {
        hideTip();
        emit('itemclick', item);
    }
}
function scroll(event: Event) {
    if (event.target instanceof Element && event.target.closest('.detail-tip')) return;
    hideTip();
}
watch([() => props.items, () => props.disabled], hideTip);
onMounted(() => {
    window.addEventListener('resize', hideTip);
    window.addEventListener('scroll', scroll, true);
});
onBeforeUnmount(() => {
    hideTip();
    window.removeEventListener('resize', hideTip);
    window.removeEventListener('scroll', scroll, true);
});
defineExpose({ hideTip });
</script>

<template>
    <div class="warehouse-grid character-theme">
        <button
            v-for="item in items"
            :key="item.id"
            :data-asset-id="item.id"
            type="button"
            class="character-choice warehouse-item"
            :class="{ 'warehouse-item-selected': selectable && selectedIds?.has(item.id) }"
            :aria-label="`${labelPrefix} ${warehouseName(item)}`"
            :aria-pressed="selectable ? selectedIds?.has(item.id) === true : undefined"
            :aria-describedby="hovered?.id === item.id ? `${tipId}-${item.kind}` : undefined"
            :disabled="disabled"
            @mouseenter="showTip(item, $event)"
            @mouseleave="scheduleHide"
            @focus="showTip(item, $event)"
            @blur="hideTip"
            @keydown.esc="dismissTip"
            @click="activate(item, $event)"
        >
            <template v-if="item.kind === 'gear'">
                <IconTile
                    v-if="icon(item.gear)"
                    class="warehouse-gear-icon"
                    :src="icon(item.gear)"
                    aria-hidden="true"
                />
                <PressTile v-else still class="warehouse-gear-icon" aria-hidden="true">
                    <span class="warehouse-icon-fallback">{{ item.gear.slot.slice(0, 1) }}</span>
                </PressTile>
            </template>
            <PressTile v-else still class="warehouse-pet-icon" aria-hidden="true">
                <PetImage :name="item.pet.portrait || ''" kind="portrait" :title="null" />
            </PressTile>
            <span
                v-if="selectable && selectedIds?.has(item.id)"
                class="warehouse-item-check"
                aria-hidden="true"
            ><AppIcon name="check" /></span>
        </button>
        <GearTip
            :tooltip-id="`${tipId}-gear`"
            :anchor="anchor"
            :detail="hovered?.kind === 'gear' ? hovered.gear.detail : null"
            :slot-name="hovered?.kind === 'gear' ? hovered.gear.slot : undefined"
            :layer="90"
            interactive
            @mouseenter="keepTip"
            @mouseleave="scheduleHide"
        >
            <template v-if="hovered?.kind === 'gear'">
                <div v-if="hovered.soul?.length" class="warehouse-soul">
                    <span class="meta">命魂之玉</span>
                    <div v-for="(row, i) in hovered.soul" :key="i" class="meta">
                        {{ row.label }} {{ row.value }}
                    </div>
                </div>
                <div v-if="hovered.server" class="meta warehouse-tip-server">{{ hovered.server }}</div>
            </template>
        </GearTip>
        <PetTip
            :tooltip-id="`${tipId}-pet`"
            :anchor="anchor"
            :pet="hovered?.kind === 'pet' ? hovered.pet : null"
            :layer="90"
            interactive
            @mouseenter="keepTip"
            @mouseleave="scheduleHide"
        >
            <div v-if="hovered?.server" class="meta warehouse-tip-server">{{ hovered.server }}</div>
        </PetTip>
    </div>
</template>

<style scoped>
.warehouse-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, var(--warehouse-cell-size, 80px));
    gap: 8px;
    align-content: start;
}
.warehouse-item {
    position: relative;
    justify-content: center;
    min-height: var(--warehouse-cell-size, 80px);
}
.warehouse-item-selected {
    outline: 1px solid var(--accent);
    outline-offset: -2px;
    background: color-mix(in srgb, var(--accent) 8%, var(--paper));
}
.warehouse-item-check {
    position: absolute;
    right: 2px;
    bottom: 2px;
    display: grid;
    place-items: center;
    width: 18px;
    height: 18px;
    border-radius: var(--r-pill);
    background: var(--accent);
    color: var(--on-seal);
    --icon-size: 12px;
}
.warehouse-gear-icon,
.warehouse-pet-icon {
    --tile-w: var(--warehouse-tile-size, 64px);
    --tile-h: var(--warehouse-tile-size, 64px);
    --tile-r: var(--r-3);
}
.warehouse-gear-icon {
    --shot: var(--warehouse-gear-size, 52px);
    --tile-drop: 0.6;
    --tile-face: light-dark(var(--paper), color-mix(in srgb, var(--paper-2) 84%, var(--ink)));
}
.warehouse-icon-fallback {
    color: color-mix(in srgb, var(--ink-2) 78%, transparent);
    font-size: calc(20px * var(--fs-scale));
    line-height: 1;
}
.warehouse-pet-icon {
    --tile-drop: 0.75;
    --tile-face: color-mix(in srgb, var(--well) 55%, var(--paper-2));
}
.warehouse-pet-icon :deep(.pet-image.portrait) {
    --pet-icon-size: var(--warehouse-pet-size, 56px);
    background: transparent;
}
.warehouse-soul,
.warehouse-tip-server {
    margin-top: 8px;
    padding-top: 6px;
    border-top: var(--w-hair) dotted var(--rule-2);
    overflow-wrap: anywhere;
}
</style>
