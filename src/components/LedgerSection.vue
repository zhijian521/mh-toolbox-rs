<script setup lang="ts">
import SealMark from './SealMark.vue';

/**
 * 账簿语境里的「一块」：文武线外框 + 朱印小标 + 标题 + 右侧提示/操作。
 *
 * 结构靠线不靠阴影，所以没有任何圆角与投影——真要区分层级就再加一道内框线。
 */
withDefaults(defineProps<{ title: string; seal?: string; hint?: string }>(), {
    seal: '',
    hint: '',
});
</script>

<template>
    <section class="frame ledger-section">
        <header class="section-head">
            <h2>
                <SealMark v-if="seal" :text="seal" />
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
 * 与 CONVENTIONS §2.4-9 直接冲突。层级靠文武线外框和朱印小标交代，不靠字重。 */
h2 {
    display: flex;
    align-items: center;
    gap: 8px;
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
