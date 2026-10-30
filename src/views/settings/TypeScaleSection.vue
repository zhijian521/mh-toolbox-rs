<script setup lang="ts">
import LedgerSection from '../../components/LedgerSection.vue';

/**
 * 字号阶梯。`px` 是「默认档」下的实际值，`size` 走令牌所以会跟着滑块缩放。
 * 两列都留着：左边告诉设计者原值，右边让他看见缩放后的样子。
 */
const typeScale: { token: string; px: string; usage: string; size: string }[] = [
    { token: '--fs-mini', px: '10px', usage: '印章 · 表头', size: 'var(--fs-mini)' },
    { token: '--fs-xs', px: '11px', usage: '元信息 · 时间', size: 'var(--fs-xs)' },
    { token: '--fs-sm', px: '12px', usage: '胶囊 · 流水', size: 'var(--fs-sm)' },
    { token: '--fs-base', px: '13.5px', usage: '正文 · 表单', size: 'var(--fs-base)' },
    { token: '--fs-md', px: '14.5px', usage: '分栏标题', size: 'var(--fs-md)' },
    { token: '--fs-lg', px: '17px', usage: '弹窗标题', size: 'var(--fs-lg)' },
    { token: '--fs-xl', px: '22px', usage: '页面标题', size: 'var(--fs-xl)' },
    { token: '--fs-amount', px: '29px', usage: '金额', size: 'var(--fs-amount)' },
];
</script>

<template>
    <LedgerSection title="字号阶梯" seal="字" hint="霞鹜文楷 · 八档 · 受上方滑块控制">
        <div class="type-scale">
            <div v-for="item in typeScale" :key="item.token" class="type-row">
                <code class="type-token">{{ item.token }}</code>
                <em class="type-px">{{ item.px }}</em>
                <span class="type-sample" :style="{ fontSize: item.size }">
                    {{ item.usage }} · 梦幻养老助手 328.6 万
                </span>
            </div>
        </div>
    </LedgerSection>
</template>

<style scoped>
.type-scale {
    display: flex;
    flex-direction: column;
    gap: 7px;
}
.type-row {
    display: flex;
    align-items: baseline;
    gap: 14px;
    padding-bottom: 7px;
    border-bottom: 1px dashed var(--rule);
}
.type-row:last-child {
    padding-bottom: 0;
    border-bottom: 0;
}
.type-token {
    flex: none;
    width: 96px;
    color: var(--muted);
    font-family: var(--font-ui);
    font-size: var(--fs-xs);
    letter-spacing: 0;
}
.type-px {
    flex: none;
    width: 52px;
    color: var(--muted);
    font-family: var(--font-ui);
    font-size: var(--fs-xs);
    font-style: normal;
}
.type-sample {
    color: var(--ink);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}
</style>
