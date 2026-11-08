<script setup lang="ts">
import { computed } from 'vue';
import type { GearDetail, GearSlotName } from './gear';
import {
    gearPropertyGroups,
    type GearPropertyGroup,
    type GearPropertyItem,
} from './gear-properties';

const props = defineProps<{ detail: GearDetail; slotName?: GearSlotName; editable?: boolean }>();
interface PropertySlot {
    item: GearPropertyItem;
    group: GearPropertyGroup;
}
defineSlots<{
    label?(props: { group: GearPropertyGroup }): unknown;
    stats?(props: PropertySlot): unknown;
    cond?(props: PropertySlot): unknown;
    lines?(props: PropertySlot): unknown;
}>();
const groups = computed(() => gearPropertyGroups(props.detail, props.slotName, props.editable));
</script>

<template>
    <dl class="gear-properties" :class="{ editable }" aria-label="装备属性">
        <div
            v-for="group in groups"
            :key="group.key"
            class="property-group gear-color"
            :class="['kind-' + group.kind, 'gear-color-' + group.kind]"
            :data-group="group.key"
        >
            <dt class="property-label" :class="{ tag: group.tag }">
                <slot name="label" :group="group">{{ group.label }}</slot>
            </dt>
            <dd
                class="property-items"
                :class="{
                    inline: group.inline,
                    paired: editable && group.key === 'base' && group.items.length > 1,
                }"
            >
                <div
                    v-for="item in group.items"
                    :key="item.source + '-' + item.index"
                    class="property-item"
                >
                    <slot :name="item.source" :item="item" :group="group">
                        <span v-if="item.name" class="property-name">{{ item.name }}</span>
                        <span class="property-value" :class="{ numeric: item.source === 'stats' }">
                            {{ item.value
                            }}<span v-if="item.row.extra" class="property-extra">
                                [{{ item.row.extra }}]</span
                            >
                        </span>
                    </slot>
                </div>
            </dd>
        </div>
    </dl>
</template>

<style scoped>
.gear-properties {
    display: grid;
    grid-template-columns: max-content minmax(0, 1fr);
    align-items: baseline;
    gap: 4px 8px;
    min-width: 0;
    margin: 8px 0 0;
    font-size: var(--fs-sm);
    line-height: 1.6;
}
.property-group {
    display: contents;
}
.property-label {
    justify-self: start;
    padding: 0 3px;
    color: var(--property-ink);
    font-size: var(--fs-mini);
    white-space: nowrap;
}
.property-label.tag {
    padding: 0 4px;
    border-radius: var(--r-1);
    background: color-mix(in srgb, var(--property-ink) 12%, var(--paper-2));
}
.kind-status .property-items {
    font-size: var(--fs-mini);
}
.property-items {
    min-width: 0;
    margin: 0;
    color: var(--property-ink);
    font-variant-numeric: tabular-nums;
}
.property-items.inline {
    display: flex;
    flex-wrap: wrap;
    gap: 0 6px;
}
.property-item {
    min-width: 0;
    overflow-wrap: anywhere;
}
.gear-properties:not(.editable) .inline .property-item + .property-item::before {
    margin-right: 6px;
    color: var(--muted);
    content: '·';
}
.property-name {
    margin-right: 4px;
    white-space: nowrap;
}
.property-value.numeric {
    white-space: nowrap;
}
.property-extra {
    color: var(--muted);
    font-size: var(--fs-mini);
}
.editable {
    --gear-row-h: calc(32px * var(--fs-scale));
    grid-template-columns: minmax(0, 1fr);
    row-gap: 10px;
    align-items: start;
}
.editable .property-group {
    display: grid;
    grid-template-columns: calc(84px * var(--fs-scale)) minmax(0, 1fr);
    align-items: start;
    gap: 8px;
}
.editable .property-label {
    display: flex;
    align-items: center;
    justify-content: center;
    justify-self: stretch;
    height: var(--gear-row-h);
    padding: 0;
    border-radius: var(--r-2);
    font-size: var(--fs-sm);
    text-align: center;
}
.editable .property-items {
    display: grid;
    gap: 6px;
}
.editable .property-items.paired {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
}
.editable .property-item {
    color: var(--property-ink);
}
</style>
