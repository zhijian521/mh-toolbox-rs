<script setup lang="ts">
import { onMounted, ref, watch } from 'vue';
import LedgerSection from '../../components/LedgerSection.vue';
import { useFontScale } from '../../composables/use-font-scale';
import { declaredTokens, tokenFontSize } from './tokens';

/**
 * 字号阶梯：令牌名从样式表读、`px` 值实测，两列都不在这里抄。
 *
 * 早先这张表手写着 8 档 `px` 字符串，`tokens.css` 一改它就变成谎话。
 * 现在把每个 `--fs-*` 套成 `font-size` 读计算值，于是左列永远是**当前档位下的真实像素**：
 * 切到「较大」时数字会跟着长，这恰好是这一页该展示的东西——设计者要看的是
 * 「这行在用户眼里多大」，不是「初始值写的是多少」。
 *
 * `USAGE` 只给读感；将来新增一档字号，它会带着原名自动出现在表里。
 */
const USAGE: Record<string, string> = {
    '--fs-mini': '印章 · 表头',
    '--fs-xs': '元信息 · 时间',
    '--fs-sm': '胶囊 · 流水',
    '--fs-base': '正文 · 表单',
    '--fs-md': '分栏标题',
    '--fs-lg': '弹窗标题',
    '--fs-xl': '页面标题',
    '--fs-amount': '金额',
};

const rows = ref<{ token: string; px: number; label: string }[]>([]);
const { scale } = useFontScale();

function measure() {
    /* `--fs-scale` 是系数本身（一个纯数字），不是档位，得排掉。 */
    rows.value = declaredTokens('--fs-')
        .filter((token) => token !== '--fs-scale')
        .map((token) => ({
            token,
            px: tokenFontSize(token),
            label: USAGE[token] ?? '样例',
        }));
}

onMounted(measure);
/* 滑块只改 `--fs-scale`，DOM 上没有任何变化能触发重绘；等一帧让 `apply()` 先落地再量。 */
watch(scale, () => requestAnimationFrame(measure));
</script>

<template>
    <LedgerSection title="字号阶梯" hint="霞鹜文楷 · 八档 · 受上方滑块控制">
        <div class="type-scale">
            <div v-for="item in rows" :key="item.token" class="type-row">
                <code class="type-token">{{ item.token }}</code>
                <em class="type-px">{{ Math.round(item.px * 10) / 10 }}px</em>
                <span class="type-sample" :style="{ fontSize: `var(${item.token})` }">
                    {{ item.label }} · 梦幻养老助手 328.6 万
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
