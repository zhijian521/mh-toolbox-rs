<script setup lang="ts">
import LedgerSection from '../../components/LedgerSection.vue';

/** 令牌清单。新增颜色令牌时加一行，色板自动多一格。 */
const swatches: { token: string; label: string }[] = [
    { token: '--bg', label: '页面底' },
    { token: '--paper', label: '纸面' },
    { token: '--paper-2', label: '纸面·次' },
    { token: '--well', label: '凹槽' },
    { token: '--rule', label: '账线' },
    { token: '--rule-2', label: '描边' },
    { token: '--ink', label: '墨' },
    { token: '--ink-2', label: '正文' },
    { token: '--muted', label: '淡墨' },
    { token: '--cinnabar', label: '朱' },
    { token: '--ochre', label: '赭' },
    { token: '--indigo', label: '靛' },
    { token: '--moss', label: '苔' },
];
</script>

<template>
    <LedgerSection title="色板" seal="色" hint="纸是暖的，墨是灰的，朱只给三处">
        <div class="swatches">
            <div v-for="item in swatches" :key="item.token" class="swatch">
                <i :style="{ '--c': `var(${item.token})` }" />
                <span>
                    <b>{{ item.label }}</b>
                    <code>{{ item.token }}</code>
                </span>
            </div>
        </div>
    </LedgerSection>
</template>

<style scoped>
.swatches {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(148px, 1fr));
    gap: 8px;
}
.swatch {
    display: flex;
    align-items: center;
    gap: 9px;
    padding: 6px 8px;
    border: var(--w-hair) solid var(--rule);
}
/* 色块本身是唯一允许的「裸色」：它展示的就是令牌，再套一层变量就没意义了。 */
.swatch i {
    flex: none;
    width: 26px;
    height: 26px;
    border: var(--w-hair) solid var(--rule-2);
    background: var(--c);
}
.swatch span {
    display: flex;
    flex-direction: column;
    min-width: 0;
    color: var(--muted);
    font-size: var(--fs-xs);
}
.swatch b {
    color: var(--ink);
    font-size: var(--fs-sm);
    font-weight: 400;
}
.swatch code {
    font-family: var(--font-ui);
    font-size: var(--fs-mini);
    letter-spacing: 0;
}
</style>
