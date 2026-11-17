<script setup lang="ts">
import { computed, watch } from 'vue';
import { useAnchoredTip } from '../../composables/use-anchored-tip';
import type { ReadonlyGearDetail, GearSlotName } from './gear';
import GearProperties from './GearProperties.vue';

/**
 * 装备详情浮片：鼠标停在格子上时浮出来的一张纸。
 *
 * **必须 `Teleport` 到 body**：浮片是 `position: fixed`，但若挂在格子内部，
 * `.char-body` 的 `overflow: auto` 会把它裁掉下半截（fixed 之所以能逃出滚动容器，
 * 前提是祖先没有 transform / filter / contain 之类的包含块）。
 *
 * 落位由 `useAnchoredTip` 算（与召唤兽浮片共用同一套翻边规则），这里只负责
 * 「内容变了就重新量一次」。
 *
 * 常驻 DOM、只切 `on` 类（不用 `v-if`）：一旦卸载，尺寸就量不到，
 * 每次都要「先显示再量再定位」，第一帧会闪一下原位。
 *
 * 属性与编辑器共用分类签布局，浮层外壳、锚点与装备格保持原样。
 */
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

const { el, pos, place } = useAnchoredTip();

watch(
    [() => props.detail, () => props.anchor],
    ([detail]) => {
        if (!detail) return;
        /* 内容换了才知道新高度，`place()` 内部会先等 DOM 更新。 */
        void place(props.anchor);
    },
);

/* 条件合并成一行小字：`130 级 · 五行 木 · 女`。
 * 游戏里它们分三行，那是为了塞进固定宽的框；浮片没这个限制，一行读完更省高度。
 * 等级自 2026-11-11 起是独立的一格（`detail.level`），条件只剩五行 / 装备角色。 */
const level = computed(() => props.detail?.level ?? 0);
const requires = computed(() => props.detail?.requires?.join(' · ') ?? '');
</script>

<template>
    <Teleport to="body">
        <div
            ref="el"
            :id="tooltipId"
            class="gear-tip detail-tip dual-rule"
            :class="{ on: detail !== null, interactive }"
            :style="{ left: `${pos.left}px`, top: `${pos.top}px`, zIndex: layer }"
            role="tooltip"
            :aria-hidden="detail === null"
            @mouseenter="emit('mouseenter')"
            @mouseleave="emit('mouseleave')"
        >
            <div v-if="detail" class="tip-content">
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
                <div v-if="detail.note" class="meta tip-note">
                    <span>备注</span>{{ detail.note }}
                </div>
                <slot />
            </div>
        </div>
    </Teleport>
</template>

<style scoped src="./detail-tip.css"></style>
