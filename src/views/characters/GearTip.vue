<script setup lang="ts">
import { computed } from 'vue';
import DetailTipShell from '../../components/DetailTipShell.vue';
import type { ReadonlyGearDetail, GearSlotName } from './gear';
import GearProperties from './GearProperties.vue';

/** 装备内容与编辑器共用属性布局；浮层开合及落位由 DetailTipShell 管理。 */
const props = defineProps<{
    /** 锚点：触发浮片的那个格子。`null` 表示没有指向任何格子。 */
    anchor: DOMRect | null;
    detail: ReadonlyGearDetail | null;
    slotName?: GearSlotName;
    tooltipId?: string;
    layer?: number;
    interactive?: boolean;
}>();
const emit = defineEmits<{ mouseenter: []; mouseleave: [] }>();

/* 条件合并成一行小字：`130 级 · 五行 木 · 女`。
 * 游戏里它们分三行，那是为了塞进固定宽的框；浮片没这个限制，一行读完更省高度。
 * 等级自 2026-11-11 起是独立的一格（`detail.level`），条件只剩五行 / 装备角色。 */
const level = computed(() => props.detail?.level ?? 0);
const requires = computed(() => props.detail?.requires?.join(' · ') ?? '');
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
            <div class="tip-name">{{ detail.name || slotName }}</div>
            <div class="meta tip-kind">
                {{ detail.kind }}<template v-if="level"> · {{ level }} 级</template
                ><template v-if="requires"> · {{ requires }}</template>
            </div>
            <!-- 风味文本压到两行：它是「这件东西有来历」，不是要背下来的属性。
                 排在属性之前是为了先给个由头，但绝不能让它把属性挤出屏幕。 -->
            <p v-if="detail.flavor" class="flavor">{{ detail.flavor }}</p>

            <GearProperties :detail="detail" :slot-name="slotName" />

            <div v-if="detail.foot" class="meta tip-foot">{{ detail.foot }}</div>
            <div v-if="detail.note" class="meta tip-note"><span>备注</span>{{ detail.note }}</div>
            <slot />
        </template>
    </DetailTipShell>
</template>
