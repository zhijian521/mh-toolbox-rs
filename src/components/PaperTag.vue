<script setup lang="ts">
/** 双孔纸签只承载内容；装饰层镂空，外层按钮或排序项负责交互与焦点。 */
</script>

<template>
    <span class="paper-tag">
        <span class="paper-tag-binding" aria-hidden="true" />
        <span class="paper-tag-content"><slot /></span>
    </span>
</template>

<style scoped>
.paper-tag {
    --paper-tag-hole-x: 15px;
    --paper-tag-hole-y: 17px;
    --paper-tag-mask:
        radial-gradient(
            circle at var(--paper-tag-hole-x) var(--paper-tag-hole-y),
            transparent 3.7px,
            var(--ink-base) 4.3px
        ),
        radial-gradient(
            circle at var(--paper-tag-hole-x) calc(100% - var(--paper-tag-hole-y)),
            transparent 3.7px,
            var(--ink-base) 4.3px
        );
    position: relative;
    isolation: isolate;
    display: flex;
    align-items: center;
    box-sizing: border-box;
    flex: 1;
    width: 100%;
    min-width: 0;
    min-height: var(--paper-tag-min-h, calc(70px * var(--fs-scale)));
    padding: var(--paper-tag-pad, 14px 14px 14px 40px);
    border-radius: var(--r-ticket);
}
.paper-tag::before,
.paper-tag::after {
    content: '';
    position: absolute;
    z-index: -1;
    inset: 0;
    border-radius: inherit;
    pointer-events: none;
    -webkit-mask-image: var(--paper-tag-mask);
    mask-image: var(--paper-tag-mask);
    -webkit-mask-composite: source-in;
    mask-composite: intersect;
}
.paper-tag::before {
    background: var(--paper-tag-face);
    box-shadow: var(--paper-tag-shadow);
    transition:
        background-color var(--t-quick) var(--ease-soft),
        box-shadow var(--t-quick) var(--ease-soft);
}
.paper-tag::after {
    z-index: -2;
    background: var(--paper-tag-layer);
    transform: translateY(2px);
    box-shadow: inset 0 -1px 0 var(--rule-2);
}
.paper-tag-binding {
    position: absolute;
    top: 0;
    bottom: 0;
    left: 0;
    width: 30px;
    pointer-events: none;
}
.paper-tag-binding::before,
.paper-tag-binding::after {
    content: '';
    position: absolute;
    left: calc(var(--paper-tag-hole-x) - 5px);
    top: calc(var(--paper-tag-hole-y) - 5px);
    box-sizing: border-box;
    width: 10px;
    height: 10px;
    border: 1px solid var(--paper-tag-hole-edge);
    border-radius: 50%;
    box-shadow: var(--paper-tag-hole-shadow);
}
.paper-tag-binding::after {
    top: auto;
    bottom: calc(var(--paper-tag-hole-y) - 5px);
}
.paper-tag-content {
    width: 100%;
    min-width: 0;
}
/* 深棱与浅棱相邻，再整体断续裁剪，形成纸上压痕，不是实心虚线。 */
.paper-tag-content::before {
    content: '';
    position: absolute;
    top: 10px;
    bottom: 10px;
    left: 29px;
    width: 2px;
    background-image: var(--paper-tag-rule-image);
    -webkit-mask-image: repeating-linear-gradient(
        180deg,
        var(--ink-base) 0 4px,
        transparent 4px 7px
    );
    mask-image: repeating-linear-gradient(180deg, var(--ink-base) 0 4px, transparent 4px 7px);
    pointer-events: none;
}
</style>
