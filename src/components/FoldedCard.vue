<script setup lang="ts">
/** 侧折纸卡只提供纸面与纸脊；方向只镜像装饰，正文和交互顺序保持不变。 */
withDefaults(
    defineProps<{
        as?: 'section' | 'article' | 'div';
        spine?: 'left' | 'right';
    }>(),
    { as: 'section', spine: 'right' },
);
</script>

<template>
    <component :is="as" class="folded-card" :data-spine="spine">
        <span class="folded-spine" aria-hidden="true" />
        <slot />
    </component>
</template>

<style scoped>
.folded-card {
    --folded-spine-w: 14px;
    --folded-inset-left: 0px;
    --folded-inset-right: var(--folded-spine-w);
    --folded-radius-left: var(--r-ticket);
    --folded-radius-right: 0px;
    --ticket-rule-mask: repeating-linear-gradient(90deg, #000 0 2px, transparent 2px 5px);

    position: relative;
    isolation: isolate;
    min-width: 0;
    padding-block: var(--folded-pad-block, 16px);
    padding-inline: calc(var(--folded-pad-inline, 16px) + var(--folded-inset-left))
        calc(var(--folded-pad-inline, 16px) + var(--folded-inset-right));
    border-radius: var(--r-ticket);
}
.folded-card[data-spine='left'] {
    --folded-inset-left: var(--folded-spine-w);
    --folded-inset-right: 0px;
    --folded-radius-left: 0px;
    --folded-radius-right: var(--r-ticket);
}
.folded-card::before,
.folded-card::after {
    content: '';
    position: absolute;
    pointer-events: none;
    border-radius: var(--folded-radius-left) var(--folded-radius-right) var(--folded-radius-right)
        var(--folded-radius-left);
}
.folded-card::before {
    z-index: -1;
    inset: 0 var(--folded-inset-right) 0 var(--folded-inset-left);
    background: var(--folded-paper);
    box-shadow: var(--folded-paper-shadow);
}
.folded-card::after {
    z-index: -2;
    inset: 1px var(--folded-inset-right) -2px var(--folded-inset-left);
    background: var(--folded-layer);
}
.folded-spine {
    position: absolute;
    z-index: 2;
    inset: 1px 0 0 auto;
    width: var(--folded-spine-w);
    border-radius: 0 var(--r-ticket) var(--r-ticket) 0;
    background: var(--folded-spine-image);
    box-shadow: var(--folded-spine-shadow);
    pointer-events: none;
}
.folded-spine::after {
    content: '';
    position: absolute;
    inset: 10px auto 10px 5px;
    width: 2px;
    background: var(--folded-crease-image);
    opacity: 0.65;
}
.folded-card[data-spine='left'] > .folded-spine {
    right: auto;
    left: 0;
    transform: scaleX(-1);
}
</style>
