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
 *
 * 三档小字的语义（哪一档给 `.note` / `.hint` / `.meta`）定义在 §2.4-23 与
 * `base.css` 的「文本」段——这里只是它的中文摘要。改那边记得同步这三行，
 * 否则「元信息」会同时出现在 `--fs-xs` 和 `--fs-mini` 上，翻到这个页面的人
 * 就会照着选错档。
 */
const USAGE: Record<string, string> = {
    '--fs-mini': '印 · 小签 · 元信息',
    '--fs-xs': '块级说明 · 行标签',
    '--fs-sm': '胶囊 · 行内提示',
    '--fs-base': '正文 · 表单',
    '--fs-md': '分栏标题',
    '--fs-xl': '页面标题',
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
    <LedgerSection title="字号阶梯" hint="霞鹜文楷 · 六档 · 受上方滑块控制">
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
    gap: 12px;
    padding-bottom: 7px;
    border-bottom: 1px dashed var(--rule);
}
.type-row:last-child {
    padding-bottom: 0;
    border-bottom: 0;
}
/* 三列宽度是按「与色板并排」那一档留的余量：并排时每张 456 宽、内容区 426，
 * 两列定宽加两处 gap 占 142，样例还剩 284——而最长那行（`--fs-xl` 的
 * 「梦幻养老助手 328.6 万」）实测约 265，不会吃省略号。
 * 再窄就截字了：`.type-sample` 是 `nowrap` + ellipsis，截了不报错，只是看不全。 */
.type-token {
    flex: none;
    width: 84px;
    color: var(--muted);
    font-family: var(--font-ui);
    font-size: var(--fs-xs);
    letter-spacing: 0;
}
.type-px {
    flex: none;
    width: 46px;
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
