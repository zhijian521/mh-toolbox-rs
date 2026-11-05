<script setup lang="ts">
import AppIcon from './AppIcon.vue';
import PressTile from './PressTile.vue';
import type { IconName } from './icons';

/**
 * 压印块按钮：内容落在一块**凸起的纸**上。
 *
 * 与 `SlotButton` 是同一件事的两种材质：
 *   - `SlotButton` 是**凹**的——按钮本体是槽，悬停时一枚朱印落进槽里；
 *   - `PressButton` 是**凸**的——按钮本体就是那块纸，按下去被压回纸里。
 *
 * 两种都在用，界线按「这块地方的语言」分（见 `CONVENTIONS.md` §2.3-2）：
 * 页面里的动作（页头、面板、表单）用这一枚；左栏底部那两枚工具、开发页的槽按钮演示
 * 仍走 `SlotButton`。**同一屏幕上不要混**——一凹一凸并排，读起来是两种器件。
 *
 * ---- 三个形态由 props 组合定 ----
 * 只有 `text` 是纯文字、`icon` + `text` 是图标带字、只有 `icon` 是纯图标（正方形）。
 * 判定写在类名上而不是另设 `variant`：`icon && !text` 是现成的、不会骗人的依据。
 *
 * ---- 尺寸 ----
 * `sm` 20 / `md` 26 / `lg` 31。`md` 与 `SlotButton` 的 `md` 逐像素同值——两种按钮并排
 * （比如页头左边一枚压印块、右边一枚槽按钮）基线才对得齐。尺寸仍走 `--tile-h`，
 * 父级要精确值就覆写变量。
 *
 * `sm`（2026-11-05 加）是**注脚级**：给「附在说明文字右端」「塞在读数格边上」这种
 * 位置用，第一处是收益页速记卡那一行的导出 / 导入。20 比 26 矮 6、字号降一档
 * （`--fs-mini`）、左右内距从 11 收到 6——一眼看得出它与 `md` 是两种份量，不会
 * 被当成「同一枚按钮小了一点点」。
 *
 * 它**不是** 2026-11-02 删掉的那档 24 回来了：24 只比 md 小 2px，并排放着读不出区别，
 * 业务页一次没用过，是「看起来能调小」的假入口；20 差 6px 且带字号与内距变化，
 * 有明确用途。`SlotButton` 暂时没有这一档——槽按钮长在工具条与页头，没出现过注脚级
 * 的用法，真要用时按同值补上，md/lg 同值那条约定不变。
 *
 * ---- 印记变体 ----
 * `seal` 把块面灌成朱红、字翻成纸白，用于**主操作**（一屏只该有一枚）。
 *
 * 朱面的块、棱、三个状态都在 `PressTile` 的 `tone="seal"` 里（2026-11-03 收进去）：
 * 同一块朱红，角色卡上满级的门派字印与页头这枚按钮必须是同一个朱、同一道光。
 * 本组件只留一件**它自己该管**的事——内层字色（见 `.press-btn-inner` 那段）。
 */
withDefaults(
    defineProps<{
        label: string;
        /** 可见文字。不传就是纯图标。 */
        text?: string;
        /** 图标。不传就是纯文字。 */
        icon?: IconName;
        disabled?: boolean;
        /** 块面灌朱：主操作，一屏一屏只该有一枚。 */
        seal?: boolean;
        /**
         * 尺寸。`sm` 20 / `md` 26 / `lg` 31。
         *
         * `sm` 是注脚级（塞在说明行、读数格边上），字号与内距一并收窄，见文件头。
         */
        size?: 'sm' | 'md' | 'lg';
    }>(),
    { text: '', disabled: false, seal: false, size: 'md' },
);
</script>

<template>
    <button
        type="button"
        class="press-btn"
        :class="[`size-${size}`, { 'icon-only': icon && !text, seal }]"
        :title="label"
        :aria-label="label"
        :disabled="disabled"
    >
        <PressTile class="press-btn-tile" :tone="seal ? 'seal' : 'paper'">
            <span class="press-btn-inner">
                <AppIcon v-if="icon" :name="icon" />
                <span v-if="text">{{ text }}</span>
            </span>
        </PressTile>
    </button>
</template>

<style scoped>
/* 按钮壳只负责「可点 / 焦点 / 禁用」，几何全部下给块：
 * `--tile-*` 与 `--icon-size` 是自定义属性，会一路继承进 `PressTile`。
 * 高度 26 是默认档（与 `SlotButton` 的 `md` 同值）。 */
.press-btn {
    --tile-h: calc(26px * var(--fs-scale));
    --tile-r: var(--r-2);
    --icon-size: calc(15px * var(--fs-scale));

    padding: 0;
    border: 0;
    background: none;
    color: inherit;
    font-size: var(--fs-sm);
    cursor: pointer;
}
.press-btn.size-lg {
    --tile-h: calc(31px * var(--fs-scale));
    --icon-size: calc(17px * var(--fs-scale));

    font-size: var(--fs-base);
}
/* 注脚级（2026-11-05）：20 高、字降一档，内距与图标一起收。缘由见文件头「尺寸」那段——
 * 它不是「小一号的 md」，是另一种份量：塞在说明文字右端、读数格边上，不抢主线。 */
.press-btn.size-sm {
    --tile-h: calc(20px * var(--fs-scale));
    --icon-size: calc(12px * var(--fs-scale));

    font-size: var(--fs-mini);
}
/* 内距 11 / 图标—字距 5 是 md 的比例；20 高的块里照抄会把两个字挤到贴边、把图标顶到拐角。
 * 两条都写在按钮这一层，压在下面 `.press-btn-tile` / `.press-btn-inner` 的默认值之上。 */
.press-btn.size-sm .press-btn-tile {
    padding: 0 calc(6px * var(--fs-scale));
}
.press-btn.size-sm .press-btn-inner {
    gap: 4px;
}

/* 内边距写在块上：块是 `box-sizing: border-box` + 固定高，padding 直接用；
 * 写在按钮壳上不会传到块里（padding 不继承）。
 * 11px 与 `SlotButton` 的 `lg` 同值，两枚并排时字与边的距离一致。 */
.press-btn-tile {
    padding: 0 calc(11px * var(--fs-scale));
}
/* 纯图标要正方形：宽取高。写在按钮上而不是块上——`--tile-w` 会继承进去，
 * 而在块上写 `var(--tile-w, ...)` 等于自己引用自己，解析成无效值。 */
.press-btn.icon-only {
    --tile-w: var(--tile-h);
}
.press-btn.icon-only .press-btn-tile {
    padding: 0;
}

/* 内层只做**一件事**：印记块上把字翻成纸白。常态不设色——继承块的 `--ink-2`
 * （`PressTile` 的默认值），不在这里抄第二遍；悬停也不写，块自己会把 `color`
 * 转成朱红，内层跟着继承即可（见下一条）。
 *
 * 之所以要留这一层、而不是在块上直接设色：块上有 `:hover` 那条规则，朱红块指上去时
 * 字必须仍压得住朱红面（`--on-seal`），内层自带颜色既不受那条规则管，
 * 也不用 `:deep()` 去赌样式注入顺序。 */
.press-btn-inner {
    display: flex;
    align-items: center;
    /* 5px 与 `SlotButton` 的图标—文字间距同值。 */
    gap: 5px;
    line-height: 1;
    /* 文字不许折行：块高是 `--tile-h` 写死的（26 / 31），一折行，两行字从块里溢出来，
     * 而块的棱与影还停在原高度——看起来像贴纸被撕开。宁可让调用方发现「这里放不下」，
     * 也不要它自己挤成两行。角色卡头那枚「确认」就是这么暴露出来的：
     * 原先写「确认删除」，在 358px 宽的卡头里折成了「确认删 / 除」。 */
    white-space: nowrap;
}
/* 悬停不必单独写：块自己会把 `color` 转成朱红，内层继承即可。
 * 只有印记块要盖掉它——朱红面上的朱红字等于没有字。 */
.press-btn.seal .press-btn-inner,
.press-btn.seal:hover:not(:disabled) .press-btn-inner {
    color: var(--on-seal);
}

/* 朱面的块、棱、三态全在 `PressTile` 的 `tone="seal"` 里（2026-11-03 从本文件收过去的）：
 * 角色卡上满级的门派字印、页头这枚主操作按钮，是同一块朱红。
 *
 * 本文件从此不碰 box-shadow，也不碰 background-image。斜向渐变只有暗色有（三层，
 * 2026-11-05 收窄到 60/45/40），亮色不叠——亮色下块的「上亮下暗」全靠 inset 棱。
 * 原先那条「170% 非法值让整条失效」的写法已经删掉，见 `PressTile` 基础规则那段。
 * **按钮没有任何自己的材质**：改 `PressTile` 就是改所有按钮，别在这里补一份。
 */

/* 禁用：半透明就够——禁用态的信息是「点不动」，不是「另一种状态」。
 * `pointer-events: none` 是为了让块收不到 `:hover`：不然鼠标停在上面，
 * 字照样转朱红，读起来像能点。按钮本体仍保留 `not-allowed` 光标。 */
.press-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
}
.press-btn:disabled .press-btn-tile {
    pointer-events: none;
}

/* 焦点环画在块上、跟随块的圆角——与工具页 `.tool-item:focus-visible .tool-tile` 同一条。
 * 印记块上不能用朱红环（红压红看不见），整条换成墨环。 */
.press-btn:focus-visible .press-btn-tile {
    outline: var(--ring);
    outline-offset: var(--ring-offset);
}
.press-btn.seal:focus-visible .press-btn-tile {
    outline: var(--ring-inv);
}
</style>
