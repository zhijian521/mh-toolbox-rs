<script setup lang="ts">
import { onMounted, ref } from 'vue';
import LedgerSection from '../../components/LedgerSection.vue';
import { colorTokens, declaredTokens } from './tokens';

/**
 * 色板：**清单从样式表读**，不在这里抄第二份。
 *
 * 早先这张表是手写的 13 行，而 `tokens.css` 里已经有 25 枚以上的颜色令牌——
 * 后来新增的 `--seal` / `--seal-edge` / `--on-seal` 一次都没出现在色板上。
 * 现在枚举全部 `--*` 再筛出颜色，色板恒等于真源；新增令牌不需要改这个文件。
 *
 * `LABELS` 只提供**读感**，不是数据：没登记的令牌照样会出现，只是标签显示原名。
 * 顺序也是样式表里的声明顺序（纸 → 线 → 朱 → 印面 → 诸色 → 立体），不是字母序——
 * 字母序会把 `--on-seal` 排到 `--seal` 前面，读的人看不出它们是一对。
 */
const LABELS: Record<string, string> = {
    '--bg': '页面底',
    '--paper': '纸面',
    '--paper-2': '纸面·次',
    '--well': '凹槽',
    '--ink': '墨',
    '--ink-2': '正文',
    '--muted': '淡墨',
    '--rule': '账线',
    '--rule-2': '描边',
    '--cinnabar': '朱',
    '--cinnabar-ink': '朱·深',
    '--on-cinnabar': '朱上字',
    '--seal': '印面',
    '--seal-edge': '印边',
    '--on-seal': '印上字',
    '--ochre': '赭',
    '--moss': '苔',
    '--bevel-hi': '受光',
    '--bevel-lo': '背光',
    '--shadow': '投影',
    '--shadow-lg': '投影·大',
    '--warn-bg': '警示底',
    '--scrollbar-thumb': '滑杆',
    '--scrollbar-thumb-hover': '滑杆·悬停',
    '--scrollbar-thumb-active': '滑杆·按下',
};

const swatches = ref<{ token: string; label: string }[]>([]);

onMounted(() => {
    swatches.value = colorTokens(declaredTokens()).map((token) => ({
        token,
        label: LABELS[token] ?? token.replace(/^--/, ''),
    }));
});
</script>

<template>
    <LedgerSection title="色板" hint="纸是暖的，墨是灰的，朱只给三处">
        <div class="swatches">
            <div v-for="item in swatches" :key="item.token" class="swatch">
                <i :style="{ '--c': `var(${item.token})` }" />
                <span>
                    <b>{{ item.label }}</b>
                    <code>{{ item.token }}</code>
                </span>
            </div>
        </div>
        <p v-if="swatches.length" class="note">
            这 {{ swatches.length }} 枚是从 <code>tokens.css</code> 运行时读出来的，不是手写的清单——
            新增令牌会自动出现在这里。半透明的（受光 / 背光 / 投影 /
            遮罩）显示的是它叠在纸上的样子。
        </p>
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
    /* `--scrollbar-thumb-active` 这类长名要能断行，断在连字符上比溢出好；
     * 行高收一点，两行的格子才不会比同行高出半个字。 */
    line-height: 1.35;
    overflow-wrap: anywhere;
}
</style>
