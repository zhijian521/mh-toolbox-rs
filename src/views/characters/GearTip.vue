<script setup lang="ts">
import DetailTipShell from '../../components/DetailTipShell.vue';
import type { ReadonlyGearDetail, GearSlotName } from './gear';
import GearTipContent from './GearTipContent.vue';

/** 装备内容与编辑器共用属性布局；浮层开合及落位由 DetailTipShell 管理。 */
defineProps<{
    /** 锚点：触发浮片的那个格子。`null` 表示没有指向任何格子。 */
    anchor: DOMRect | null;
    detail: ReadonlyGearDetail | null;
    slotName?: GearSlotName;
    tooltipId?: string;
    layer?: number;
    interactive?: boolean;
}>();
const emit = defineEmits<{ mouseenter: []; mouseleave: [] }>();
</script>

<template>
    <DetailTipShell
        class="gear-tip"
        :open="detail !== null"
        :anchor="anchor"
        :tooltip-id="tooltipId"
        :layer="layer"
        :interactive="interactive"
        @mouseenter="() => emit('mouseenter')"
        @mouseleave="() => emit('mouseleave')"
    >
        <template v-if="detail">
            <GearTipContent :detail="detail" :slot-name="slotName" />
            <slot />
        </template>
    </DetailTipShell>
</template>
