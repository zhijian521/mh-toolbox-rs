<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, useId, watch } from 'vue';
import AppIcon from './AppIcon.vue';

type CascadePath = [string, string | null];

interface CascadeGroup {
    value: string;
    label: string;
    children: readonly { value: string | null; label: string }[];
}

const props = defineProps<{
    modelValue: CascadePath;
    groups: readonly CascadeGroup[];
    label: string;
    clearLabel?: string;
    allLabel?: string;
    disabled?: boolean;
}>();

const emit = defineEmits<{
    'update:modelValue': [path: CascadePath];
    clear: [];
}>();
const root = ref<HTMLElement | null>(null);
const trigger = ref<HTMLButtonElement | null>(null);
const open = ref(false);
const activeValue = ref('');
const placement = ref({ offset: 0, width: 156, height: 228, above: false });
const popupId = useId();
const valueId = `${popupId}-value`;
const childId = `${popupId}-children`;
let hoverTimer: ReturnType<typeof setTimeout> | undefined;

const currentGroup = computed(() =>
    props.groups.find((group) => group.value === props.modelValue[0]),
);
const activeGroup = computed(() =>
    props.groups.find((group) => group.value === activeValue.value && group.children.length > 0),
);
const displayValue = computed(() => {
    const group = currentGroup.value;
    if (!group) return props.allLabel ?? '未选';
    const child = group.children.find((child) => child.value === props.modelValue[1]);
    return child ? `${group.label} / ${child.label}` : group.label;
});

function place() {
    const button = trigger.value;
    if (!button) return;
    const area = {
        left: 0,
        top: 0,
        right: document.documentElement.clientWidth,
        bottom: document.documentElement.clientHeight,
    };
    for (let element = button.parentElement; element; element = element.parentElement) {
        const { overflowX, overflowY } = getComputedStyle(element);
        if (overflowX === 'visible' && overflowY === 'visible') continue;
        const rect = element.getBoundingClientRect();
        if (overflowX !== 'visible') {
            area.left = Math.max(area.left, rect.left);
            area.right = Math.min(area.right, rect.right);
        }
        if (overflowY !== 'visible') {
            area.top = Math.max(area.top, rect.top);
            area.bottom = Math.min(area.bottom, rect.bottom);
        }
    }

    const rect = button.getBoundingClientRect();
    const scale = Number(getComputedStyle(button).getPropertyValue('--fs-scale')) || 1;
    const gutter = 6;
    const width = Math.min(156 * scale, Math.max(0, area.right - area.left - 2 * gutter) / 2);
    const left = Math.max(area.left + gutter, Math.min(rect.left, area.right - 2 * width - gutter));
    const below = area.bottom - rect.bottom - gutter;
    const above = rect.top - area.top - gutter;
    const preferredHeight = 232 * scale;
    const opensAbove = below < preferredHeight && above > below;
    placement.value = {
        offset: left - rect.left,
        width,
        height: Math.max(0, Math.min(preferredHeight, opensAbove ? above : below)),
        above: opensAbove,
    };
}

function columnOptions(level: number) {
    return [...(root.value?.querySelectorAll<HTMLButtonElement>(`[data-level="${level}"]`) ?? [])];
}

function focusOption(level: number, position?: number) {
    const options = columnOptions(level);
    const option =
        position === undefined
            ? (options.find((option) => option.hasAttribute('aria-current')) ?? options[0])
            : options[position];
    if (!option) return;
    option.focus({ preventScroll: true });
    const column = option.closest<HTMLElement>('.cascade-column');
    if (!column) return;
    const box = column.getBoundingClientRect();
    const row = option.getBoundingClientRect();
    if (row.top < box.top) column.scrollTop += row.top - box.top;
    else if (row.bottom > box.bottom) column.scrollTop += row.bottom - box.bottom;
}

function focusGroup(value: string) {
    focusOption(1, columnOptions(1).findIndex((option) => (option.dataset.group ?? '') === value));
}

function clearHover() {
    clearTimeout(hoverTimer);
    hoverTimer = undefined;
}

function activate(value: string) {
    clearHover();
    if (activeValue.value === value) return;
    const focused = document.activeElement;
    if (focused instanceof HTMLButtonElement && focused.dataset.level === '2' && root.value?.contains(focused)) {
        focusGroup(value);
    }
    activeValue.value = value;
}

function hover(event: PointerEvent, value: string) {
    if (event.pointerType === 'touch') return;
    clearHover();
    // 移向右列时短暂经过别的一级，给指针留出横穿的时间。
    if (activeValue.value) hoverTimer = setTimeout(() => activate(value), 100);
    else activate(value);
}

function show() {
    if (props.disabled || (!props.groups.length && !props.allLabel)) return;
    activate(props.modelValue[0]);
    place();
    open.value = true;
    void nextTick(() => focusOption(1));
}

function close(restoreFocus = false) {
    if (!open.value) return;
    clearHover();
    open.value = false;
    if (restoreFocus) trigger.value?.focus({ preventScroll: true });
}

function choose(category: string, sub: string | null = '') {
    emit('update:modelValue', [category, sub]);
    close(true);
}

function showChildren(category: string) {
    activate(category);
    void nextTick(() => focusOption(2));
}

function clear() {
    close();
    emit('clear');
    trigger.value?.focus({ preventScroll: true });
}

function onKeydown(event: KeyboardEvent) {
    if (!open.value) {
        if (event.target === trigger.value && event.key === 'ArrowDown') {
            event.preventDefault();
            show();
        }
        return;
    }
    if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        close(true);
        return;
    }
    if (event.key === 'Tab') {
        close(true);
        return;
    }
    if (!(event.target instanceof HTMLButtonElement)) return;
    const level = Number(event.target.dataset.level);
    if (!level) return;
    const values = columnOptions(level);
    const index = values.indexOf(event.target);
    switch (event.key) {
        case 'ArrowDown':
        case 'ArrowUp': {
            event.preventDefault();
            const step = event.key === 'ArrowDown' ? 1 : -1;
            const next = (index + step + values.length) % values.length;
            focusOption(level, next);
            if (level === 1) activate(values[next]?.dataset.group ?? '');
            break;
        }
        case 'ArrowRight':
            if (level !== 1 || event.target.dataset.hasChildren !== 'true') break;
            event.preventDefault();
            showChildren(event.target.dataset.group ?? '');
            break;
        case 'ArrowLeft':
            if (level !== 2) break;
            event.preventDefault();
            focusGroup(activeValue.value);
            break;
    }
}

function onPointerDown(event: PointerEvent) {
    if (event.target instanceof Node && !root.value?.contains(event.target)) close();
}

function onScroll(event: Event) {
    if (open.value && event.target instanceof Node && !root.value?.contains(event.target)) place();
}

function onResize() {
    if (open.value) place();
}

watch(
    () => props.disabled,
    (disabled) => {
        if (disabled) close();
    },
);
onMounted(() => {
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onResize);
});
onBeforeUnmount(() => {
    clearHover();
    document.removeEventListener('pointerdown', onPointerDown);
    document.removeEventListener('scroll', onScroll, true);
    window.removeEventListener('resize', onResize);
});
</script>

<template>
    <div ref="root" class="cascade-select" @keydown="onKeydown">
        <button
            ref="trigger"
            type="button"
            class="field cascade-trigger"
            :class="{ 'has-clear': clearLabel }"
            :aria-label="label"
            :aria-describedby="valueId"
            :aria-expanded="open"
            :aria-controls="open ? popupId : undefined"
            aria-haspopup="dialog"
            :disabled="disabled"
            @click="open ? close(true) : show()"
        >
            <span :id="valueId" :title="displayValue">{{ displayValue }}</span>
            <AppIcon v-if="!clearLabel" name="chevron-down" :class="{ 'is-open': open }" />
        </button>
        <button
            v-if="clearLabel"
            type="button"
            class="cascade-clear"
            :aria-label="clearLabel"
            :title="clearLabel"
            :disabled="disabled"
            @click="clear"
        >
            <AppIcon name="close" />
        </button>
        <div
            v-if="open"
            :id="popupId"
            class="cascade-popup"
            :class="{ 'opens-above': placement.above }"
            :style="{
                '--cascade-offset': `${placement.offset}px`,
                '--cascade-width': `${placement.width}px`,
                '--cascade-height': `${placement.height}px`,
            }"
            :aria-label="label"
            role="dialog"
        >
            <div class="cascade-column" role="group" aria-label="一级分类">
                <button
                    v-if="allLabel"
                    type="button"
                    class="cascade-option"
                    data-level="1"
                    tabindex="-1"
                    :aria-current="!modelValue[0] ? 'true' : undefined"
                    @pointerenter="hover($event, '')"
                    @click="choose('')"
                >
                    {{ allLabel }}
                </button>
                <div
                    v-for="group in groups"
                    :key="group.value"
                    class="cascade-parent"
                    :class="{ 'is-active': group === activeGroup }"
                    @pointerenter="hover($event, group.value)"
                >
                    <button
                        type="button"
                        class="cascade-option"
                        data-level="1"
                        :data-group="group.value"
                        :data-has-children="group.children.length > 0"
                        tabindex="-1"
                        :aria-current="group === currentGroup ? 'true' : undefined"
                        @click="choose(group.value)"
                    >
                        <span :title="group.label">{{ group.label }}</span>
                    </button>
                    <button
                        v-if="group.children.length"
                        type="button"
                        class="cascade-next"
                        tabindex="-1"
                        :aria-label="`展开${group.label}的二级分类`"
                        :aria-expanded="group === activeGroup"
                        :aria-controls="group === activeGroup ? childId : undefined"
                        @click="showChildren(group.value)"
                    >
                        <AppIcon name="chevron-right" />
                    </button>
                </div>
            </div>
            <div
                v-if="activeGroup"
                :id="childId"
                :key="activeGroup.value"
                class="cascade-column cascade-children"
                role="group"
                :aria-label="`${activeGroup.label}的二级分类`"
                @pointerenter="clearHover"
            >
                <button
                    v-for="child in activeGroup.children"
                    :key="child.value === null ? 'custom' : 'value:' + child.value"
                    type="button"
                    class="cascade-option"
                    data-level="2"
                    tabindex="-1"
                    :aria-current="
                        activeGroup === currentGroup && modelValue[1] === child.value
                            ? 'true'
                            : undefined
                    "
                    @click="choose(activeGroup.value, child.value)"
                >
                    <span :title="child.label">{{ child.label }}</span>
                </button>
            </div>
        </div>
    </div>
</template>

<style scoped>
.cascade-select {
    position: relative;
    display: flex;
    flex: 1;
    min-width: 0;
}
.cascade-trigger,
.cascade-option {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 6px;
    width: 100%;
    min-width: 0;
    text-align: left;
    cursor: pointer;
    --icon-size: calc(13px * var(--fs-scale));
}
.cascade-trigger > span,
.cascade-option > span {
    min-width: 0;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
}
.cascade-trigger :deep(svg),
.cascade-option :deep(svg) {
    flex: none;
}
.cascade-trigger.has-clear {
    padding-inline-end: calc(27px * var(--fs-scale));
}
.cascade-clear,
.cascade-next {
    display: grid;
    flex: none;
    place-items: center;
    width: calc(23px * var(--fs-scale));
    padding: 0;
    border: 0;
    border-radius: var(--r-1);
    background: transparent;
    color: var(--muted);
    cursor: pointer;
    --icon-size: calc(13px * var(--fs-scale));
}
.cascade-clear {
    position: absolute;
    inset: 2px 3px 2px auto;
}
:is(.cascade-clear, .cascade-next):hover:not(:disabled) {
    background: color-mix(in srgb, var(--accent) 10%, transparent);
    color: var(--accent);
}
.cascade-trigger .is-open {
    transform: rotate(180deg);
}
.cascade-popup {
    position: absolute;
    z-index: 20;
    top: calc(100% + 4px);
    left: var(--cascade-offset);
    display: flex;
    align-items: stretch;
    border-radius: var(--r-2);
    background: var(--popover-bg);
    box-shadow: var(--popover-shadow), 0 0 0 var(--w-hair) var(--popover-edge);
}
.cascade-popup.opens-above {
    top: auto;
    bottom: calc(100% + 4px);
}
.cascade-column {
    width: var(--cascade-width);
    max-height: var(--cascade-height);
    overscroll-behavior: contain;
    overflow: auto;
    padding: 4px;
}
.cascade-children {
    border-inline-start: var(--w-hair) solid var(--rule);
}
.cascade-option {
    min-height: calc(26px * var(--fs-scale));
    padding: 4px 7px;
    border: 0;
    border-radius: var(--r-1);
    background: transparent;
    color: var(--ink-2);
    font: inherit;
    font-size: var(--fs-sm);
}
.cascade-parent {
    display: flex;
    border-radius: var(--r-1);
}
.cascade-option:is(:hover, :focus-visible),
.cascade-parent.is-active {
    background: color-mix(in srgb, var(--accent) 9%, transparent);
    color: var(--ink);
}
.cascade-option[aria-current='true'] {
    color: var(--accent);
}
:is(.cascade-option, .cascade-next, .cascade-clear):focus-visible {
    outline: 1px solid var(--accent);
    outline-offset: -1px;
}
</style>
