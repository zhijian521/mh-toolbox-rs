<script setup lang="ts">
/** 共用票据外壳；可变签头用 header 插槽同步票口，只裁装饰而不裁内容和焦点。 */
import { ref, watch } from 'vue';

withDefaults(defineProps<{ as?: 'section' | 'article' | 'div' }>(), { as: 'section' });
const paper = ref<HTMLElement | null>(null);
const heading = ref<HTMLElement | null>(null);
const notch = ref<string>();

watch(
    heading,
    (element, _previous, onCleanup) => {
        notch.value = undefined;
        if (!element) return;
        const align = () => {
            if (!paper.value) return;
            const bottom =
                element.getBoundingClientRect().bottom - paper.value.getBoundingClientRect().top;
            notch.value = `calc(${bottom}px - var(--w-hair) / 2)`;
        };
        align();
        if (typeof ResizeObserver === 'undefined') return;
        const observer = new ResizeObserver(align);
        observer.observe(element);
        // watcher 随组件卸载清理；这里只改遮罩坐标，不回写签头尺寸，避免尺寸反馈循环。
        onCleanup(() => observer.disconnect());
    },
    { flush: 'post' },
);
</script>

<template>
    <component
        :is="as"
        ref="paper"
        class="ticket-card"
        :style="notch ? { '--ticket-notch-y': notch } : undefined"
    >
        <!-- header 以分隔线收尾，线后的间距放在默认内容中，票口才与线心重合。 -->
        <div v-if="$slots.header" ref="heading" class="ticket-heading">
            <slot name="header" />
        </div>
        <slot />
    </component>
</template>

<style scoped>
.ticket-card {
    --ticket-notch-radius: 6px;
    --ticket-mask:
        radial-gradient(
            circle at 0 var(--ticket-notch-y, 44px),
            transparent var(--ticket-notch-radius),
            var(--ink-base) calc(var(--ticket-notch-radius) + 0.5px)
        ),
        radial-gradient(
            circle at 100% var(--ticket-notch-y, 44px),
            transparent var(--ticket-notch-radius),
            var(--ink-base) calc(var(--ticket-notch-radius) + 0.5px)
        );

    position: relative;
    isolation: isolate;
    min-width: 0;
    border-radius: var(--r-ticket);
}
.ticket-heading {
    flex: none;
    min-width: 0;
}
/* 两层共用缺口，纸层不会填平票口；文字与交互不参与遮罩。 */
.ticket-card::before,
.ticket-card::after {
    content: '';
    position: absolute;
    pointer-events: none;
    border-radius: inherit;
    -webkit-mask-image: var(--ticket-mask);
    mask-image: var(--ticket-mask);
    -webkit-mask-composite: source-in;
    mask-composite: intersect;
}
.ticket-card::before {
    z-index: -1;
    inset: 0;
    background-color: var(--ticket-paper);
    background-image: var(--ticket-image);
    box-shadow: var(--ticket-shadow);
}
/* 左右露出 1px 清晰纸棱，下沿保留 2px 厚度，不以模糊暗影代替侧边。 */
.ticket-card::after {
    z-index: -2;
    inset: 1px -1px -2px;
    background-color: var(--ticket-layer);
    background-image: var(--ticket-layer-image);
}
</style>
