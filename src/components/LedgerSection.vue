<script setup lang="ts">
/**
 * 账簿语境里的「一块」：文武线外框 + 区块标 + 标题 + 右侧提示/操作。
 *
 * 结构靠线不靠阴影，所以没有任何圆角与投影。标题左侧那道凸起短竖条（`.section-mark`）
 * 是唯一例外：它是个**记号**，得有点厚度才读得出「一块从这里开始」，
 * 材质与凹槽、印面同一套 `--bevel-*`（定义在 `base.css`）。
 *
 * 不再收 `seal` 那样的单字：八个区块各带一枚朱印，块与块之间就被红点压闷了；
 * 印章该留给「已入账 / 已达成」这类状态。标记是恒定的一竖，不需要每块编一个字。
 */
withDefaults(defineProps<{ title: string; hint?: string }>(), { hint: '' });
</script>

<template>
    <section class="frame ledger-section">
        <header class="section-head">
            <h2>
                <span class="section-mark" aria-hidden="true" />
                {{ title }}
            </h2>
            <span v-if="hint" class="hint">{{ hint }}</span>
            <div v-if="$slots.actions" class="section-actions">
                <slot name="actions" />
            </div>
        </header>
        <slot />
    </section>
</template>

<style scoped>
.ledger-section {
    padding: 15px 18px 18px;
}
.section-head {
    display: flex;
    align-items: baseline;
    gap: 10px;
    margin-bottom: 12px;
}
/* 不写 `font-weight`，也不写 `font-size`：区块标题与全站标题共用 `base.css` 的 `h2`
 * （400 / `--fs-md`）。这里曾写 600，scoped 选择器特异性高于全局 `h2`，
 * 把标题顶成了浏览器合成加粗；文楷本地只有 Regular，合成的笔画外扩会把撇捺糊成块，
 * 与 CONVENTIONS §2.4-9 直接冲突。层级靠文武线外框和区块标交代，不靠字重。 */
h2 {
    display: flex;
    align-items: center;
    /* 标与字之间 7px：再宽标题会读成「标 + 空格 + 标题」，再窄那道竖条就贴上字了。 */
    gap: 7px;
}
.hint {
    font-size: var(--fs-xs);
    letter-spacing: 0.04em;
}
.section-actions {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-left: auto;
}
</style>
