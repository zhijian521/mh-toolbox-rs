<script setup lang="ts">
/** 浮片常驻 body，避免滚动容器裁剪；内容更新后沿用同一套锚点定位。 */
import { watch } from 'vue';
import { useAnchoredTip } from '../composables/use-anchored-tip';

defineOptions({ inheritAttrs: false });
const props = defineProps<{
    open: boolean;
    anchor: DOMRect | null;
    tooltipId?: string;
    layer?: number;
    interactive?: boolean;
}>();
const emit = defineEmits<{ mouseenter: []; mouseleave: [] }>();
const { el, pos, place } = useAnchoredTip();
function reposition() {
    if (props.open) void place(props.anchor);
}
watch([() => props.open, () => props.anchor], reposition, { flush: 'post' });
watch(
    [el, () => props.open],
    ([, open], _old, cleanup) => {
        if (!open || !el.value) return;
        const observer = new ResizeObserver(reposition);
        observer.observe(el.value);
        window.addEventListener('resize', reposition);
        cleanup(() => {
            observer.disconnect();
            window.removeEventListener('resize', reposition);
        });
    },
    { flush: 'post', immediate: true },
);
</script>

<template>
    <Teleport to="body">
        <div
            :id="tooltipId"
            ref="el"
            v-bind="$attrs"
            class="detail-tip dual-rule"
            :class="{ on: open, interactive }"
            :style="{ left: `${pos.left}px`, top: `${pos.top}px`, zIndex: layer }"
            role="tooltip"
            :aria-hidden="!open"
            @mouseenter="emit('mouseenter')"
            @mouseleave="emit('mouseleave')"
        >
            <div v-if="open" class="tip-content"><slot /></div>
        </div>
    </Teleport>
</template>

<style src="./detail-tip.css"></style>
