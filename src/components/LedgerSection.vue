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
h2 {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: var(--fs-md);
    font-weight: 600;
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
