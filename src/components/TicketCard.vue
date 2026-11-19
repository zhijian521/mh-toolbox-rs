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
    --ticket-mask:
        radial-gradient(
            circle at 0 var(--ticket-notch-y, 44px),
            transparent 5px,
            var(--ink-base) 5.5px
        ),
        radial-gradient(
            circle at 100% var(--ticket-notch-y, 44px),
            transparent 5px,
            var(--ink-base) 5.5px
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
/* 缺口透出所在区块的真实底色，文字与交互不参与遮罩。 */
.ticket-card::before {
    content: '';
    position: absolute;
    z-index: -1;
    pointer-events: none;
    inset: 0;
    border-radius: inherit;
    background-color: var(--ticket-paper);
    background-image: var(--ticket-image);
    box-shadow: var(--ticket-shadow);
    -webkit-mask-image: var(--ticket-mask);
    mask-image: var(--ticket-mask);
    -webkit-mask-composite: source-in;
    mask-composite: intersect;
}
/* 仅在下沿露出 2px 纸层，不给内容或卡片四周叠加模糊滤镜。 */
.ticket-card::after {
    content: '';
    position: absolute;
    z-index: -2;
    pointer-events: none;
    left: 1px;
    right: 1px;
    bottom: -2px;
    height: calc(var(--r-ticket) + 2px);
    border-radius: 0 0 var(--r-ticket) var(--r-ticket);
    background: var(--ticket-layer);
}
</style>
