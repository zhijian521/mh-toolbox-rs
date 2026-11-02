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
 * `md` 26 / `lg` 31，与 `SlotButton` 逐像素同值——两种按钮并排
 * （比如页头左边一枚压印块、右边一枚槽按钮）基线才对得齐。尺寸仍走 `--tile-h`，
 * 父级要精确值就覆写变量。`sm`（24px）2026-11-02 与 `SlotButton` 那档一起删掉：
 * 与 `md` 只差 2px，并排读不出区别，业务页也没用过。
 *
 * ---- 印记变体 ----
 * `seal` 把块面灌成朱红、字翻成纸白，用于**主操作**（一屏只该有一枚）。
 * 换色要连带两件事：一是三个块面（常态 / 悬停 / 按下）——`PressTile` 的默认是
 * 「纸色变实」「转灰」，沿用会闪成白纸、按下去闪成灰块；二是**光本身**——
 * 那套高光是按纸调的，压在朱红上会过曝（亮色下左上角白度实测 82%）。
 * 两处都在下面 `.seal` 段里，`PressTile` 一行不动。
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
        size?: 'md' | 'lg';
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
        <PressTile class="press-btn-tile">
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
}
/* 悬停不必单独写：块自己会把 `color` 转成朱红，内层继承即可。
 * 只有印记块要盖掉它——朱红面上的朱红字等于没有字。 */
.press-btn.seal .press-btn-inner,
.press-btn.seal:hover:not(:disabled) .press-btn-inner {
    color: var(--on-seal);
}

/* 印记：三个面一起给。只给 `--tile-face` 的话，指上去闪白纸、按下去闪灰块。 */
.press-btn.seal {
    --tile-face: var(--seal);
    --tile-face-hover: color-mix(in srgb, var(--seal) 88%, var(--ink));
    --tile-face-active: color-mix(in srgb, var(--seal) 74%, var(--ink));

    /* 朱红块的受光面与背光面：都从块面自己派生，不借用纸的那套。
     * 背光不能直接取 `--seal-edge`：它在亮色比块面深（#8a2620）、在暗色却比块面**浅**
     * （#c88471），照用会让暗色的底棱变成一条发光的线。压 30% 黑两个主题都成立。 */
    --seal-lt: color-mix(in srgb, var(--seal) 62%, var(--paper-base));
    --seal-dp: color-mix(in srgb, var(--seal) 70%, #000);
}

/* ---------- 朱红块单独一套棱 ----------
 *
 * 为什么不能跟纸共用：`PressTile` 的棱是按**纸**调的。
 * 亮色的顶线是 `--bevel-hi`（82% 不透明的奶白）——压在 `#f8f3e6` 的纸上等于没画，
 * 压在 `#a8322b` 的朱红上就是把块顶成一条纯白，读作塑料高光；
 * 底棱用 `--rule-2`（暖黄棕），对纸是「暗一档」，对朱红却是「亮一档」的土黄。
 * 同一条面膜在两个面上做出相反的明暗，于是纸块读作「平 + 底厚 + 弱影」、
 * 红块读作「白顶 + 黄边」，不是同一个光源下的两块纸。
 *
 * 暗色为什么本来是对的：那里的 `--bevel-hi` 只有 18% 白，提亮量在两块上是同一量级。
 * 所以这一套不是「再调一遍材质」，只是**把亮色失真的那部分收窄**：亮线改成朱色的
 * 受光面、暗线改成朱色的背光面，强度与纸块同量级。
 *
 * 几何、圆角、过渡、内容影、三个块面色全在 `PressTile` 里，这里只碰 box-shadow。
 * 这是**有意的例外**，不是新开一套材质：将来出现第三种块面色，得再给它一份配方——
 * 那时才该考虑把棱色提成变量（现在提，等于为一种颜色改六条规则，不划算）。
 *
 * 选择器为什么带两个类：`PressTile` 的 `:root.dark .press-tile` 是 0,4,0，
 * 单靠 `.press-btn.seal .press-btn-tile` 也是 0,4,0——打平就交给样式注入顺序，
 * 而那个顺序由打包器决定。多写一个 `.press-tile` 抬到 0,5,0，不赌。
 */
.press-btn.seal .press-btn-tile.press-tile {
    box-shadow:
        inset 0 1px 0 color-mix(in srgb, var(--seal-lt) 62%, transparent),
        inset 1px 0 0 color-mix(in srgb, var(--seal-lt) 30%, transparent),
        inset -1px 0 0 color-mix(in srgb, var(--seal-dp) 38%, transparent),
        inset 0 -2px 0 color-mix(in srgb, var(--seal-dp) 72%, transparent),
        0 3px 0 var(--shadow),
        0 8px 12px -5px var(--shadow-lg);
}

/* 常态与悬停**不重写 `background-image`**，这是有意的，不是漏了。
 *
 * 亮色下 `PressTile` 那条三层渐变是**整条失效**的：第三条
 * `color-mix(in srgb, var(--bevel-lo) 170%, transparent)` 的百分比超过 100%，
 * 浏览器判为无效值，连带整条 `background-image` 一起丢掉（计算值 `none`）；
 * 暗色那套写的是 100%，生效。所以在亮色里，纸块的「上亮下暗」其实全靠这几条
 * inset 棱，一层渐变都没画。
 *
 * 跟着它走：这里不写，就等于自动与本主题的纸块同源——亮色两块都没有那层偏光，
 * 暗色两块都有。若哪天修掉那个 170%，这一段要补一层朱色偏光，否则红块会比纸块少一层。
 */

/* 悬停只抬影子，不重画光——块面变深由 `--tile-face-hover` 负责，与纸块同一条逻辑。 */
.press-btn.seal:hover:not(:disabled) .press-btn-tile.press-tile {
    box-shadow:
        inset 0 1px 0 color-mix(in srgb, var(--seal-lt) 76%, transparent),
        inset 1px 0 0 color-mix(in srgb, var(--seal-lt) 42%, transparent),
        inset -1px 0 0 color-mix(in srgb, var(--seal-dp) 46%, transparent),
        inset 0 -2px 0 color-mix(in srgb, var(--seal-dp) 78%, transparent),
        0 4px 0 var(--shadow),
        0 10px 16px -5px var(--shadow-lg);
}

/* 按下：`PressTile` 会把渐变换成一条纸色高光（那是「压回纸里」的说法），
 * 在朱红块上必须是朱色的，否则按下去块面闪白。内凹的亮线仍从右下起——
 * 光还是从左上来，只是这一次照到对面那条棱。 */
.press-btn.seal:active:not(:disabled) .press-btn-tile.press-tile {
    background-image: linear-gradient(
        325deg,
        color-mix(in srgb, var(--seal-lt) 30%, transparent),
        transparent 60%
    );
    box-shadow:
        inset 1px 1px 4px var(--seal-dp),
        inset -1px 0 0 color-mix(in srgb, var(--seal-lt) 45%, transparent),
        inset 0 -1px 0 color-mix(in srgb, var(--seal-lt) 52%, transparent);
}

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
 * 印记块上不能用朱红环（红压红看不见），换成墨。 */
.press-btn:focus-visible .press-btn-tile {
    outline: 2px solid var(--cinnabar);
    outline-offset: 3px;
}
.press-btn.seal:focus-visible .press-btn-tile {
    outline-color: color-mix(in srgb, var(--ink) 55%, transparent);
}
</style>
