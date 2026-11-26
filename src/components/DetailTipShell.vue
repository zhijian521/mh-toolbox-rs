<script setup lang="ts">
/** 浮片传送到主题外壳，避免滚动容器裁剪。 */
import { inject, watch } from 'vue';
import { glassLedger } from './glass-ledger';
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
const glass = inject(glassLedger, null);
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
    <Teleport :to="glass ? '.liquid-app' : 'body'">
        <div
            :id="tooltipId"
            ref="el"
            v-bind="$attrs"
            class="detail-tip dual-rule"
            :class="[glass?.overlayClass, { on: open, interactive }]"
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
