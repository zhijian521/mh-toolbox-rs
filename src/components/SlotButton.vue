<script setup lang="ts">
import AppIcon from './AppIcon.vue';
import type { IconName } from './icons';

/**
 * 槽按钮：内容落在凹槽里；悬停时朱印落进槽中。
 *
 * 结构分两层，这是它和普通按钮最大的差别：
 *   - **按钮本体 = 槽**。深度来自全局 `.well`，常态与悬停**都不变**。
 *   - **朱印 = 一层 `.slot-stamp`**（`inset: 1px`，面来自 `.stamp`）。悬停时淡入并
 *     `scale 0.94 → 1`，四周仍露出槽底与金边。
 *
 * 为什么不能直接给按钮刷朱红：底色一改，金边和槽就整片被盖掉，读起来是
 * 「换了块色板」，不是「一枚印落进槽里」。两态的差异必须落在子层。
 *
 * 三种形态由 props 的组合决定，不另开组件：只有 `text` 是纯文字、`icon` + `text`
 * 是图标带字、只有 `icon` 是纯图标（正方形）。判定写在模板的类名上而不是另设
 * `variant` prop——多一个 prop 就多一处「声明与内容不一致」的可能
 * （`variant="icon"` 却塞了文字），而「有没有 text」是现成的、不会骗人。
 *
 * ---- 两个变体 ----
 * 默认是「空槽」：悬停才落印，适合次要动作，一屏里可以有很多枚。
 * `seal` 是「印已落定」：印面常驻、字压在印上，用于**主操作**——
 * 同一屏只该有一枚，否则等于没有主次。它不新开组件、也不叫 `variant`：
 * 变的是「印在不在」，不是控件形态，与上面的三种形态正交。
 *
 * 尺寸仍是变量说了算：父级给 `--slot-h` / `--slot-w`，两者同一值即正方形；不传就是一枚
 * 26px 高的自然宽按钮。`size` 只是把常用两档写成**预设**——`sm` / `lg` 落在同一批变量上，
 * 不另开一套。所以它不构成第二个尺寸入口：父级要精确值，用更高特异性的选择器覆写
 * `--slot-h` 即可，两边不会打架。`md` 故意**不写规则**：默认高度就是「听父级的」，
 * 一旦给 `md` 也声明 `--slot-h`，侧栏那种「父级传 30px、子级继承」的用法会被盖掉。
 *
 * `label` 出 `title` 与 `aria-label`，其余属性（含
 * `aria-expanded`）由 attrs 透传到 button——**不要**为 ARIA 属性单独声明 prop：
 * 一旦声明，Vue 就不再自动透传，而组件内部又拿不到带连字符的 key
 * （`$props['aria-x']` 在 `<script setup>` 里恒为 undefined，重命名解构也一样），
 * 属性会静默消失。类型检查由 `src/types/vue-augment.d.ts` 放开。
 */
withDefaults(
    defineProps<{
        label: string;
        /** 可见文字。不传就是纯图标。 */
        text?: string;
        /** 图标。不传就是纯文字。 */
        icon?: IconName;
        disabled?: boolean;
        /** 印已落定：印面常驻、字压在印上。用于主操作，一屏只该有一枚。 */
        seal?: boolean;
        /**
         * 尺寸预设。`md` 是默认（26px，且听父级 `--slot-h`），`sm` 24px，`lg` 31px。
         *
         * 31 是**页头那一行**的规格：22px 的页标题加上下留白正好容得下它，
         * 再大一档就会顶到页头那条通栏账线；同时也够到桌面端点按的舒适下限。
         * （早先这里写「等于全局 `.btn` 的 min-height」——`.btn` 整套已删，
         * 全站只剩这一种按钮，尺寸不再由别人定。）
         */
        size?: 'sm' | 'md' | 'lg';
    }>(),
    { text: '', disabled: false, seal: false, size: 'md' },
);
</script>

<template>
    <button
        type="button"
        class="slot-btn well"
        :class="[`size-${size}`, { 'icon-only': icon && !text, seal }]"
        :title="label"
        :aria-label="label"
        :disabled="disabled"
    >
        <span class="slot-stamp stamp" aria-hidden="true" />
        <AppIcon v-if="icon" :name="icon" />
        <span v-if="text" class="slot-text">{{ text }}</span>
    </button>
</template>

<style scoped>
/* 深度来自全局 `.well`；这里只写「一枚 26px 的方印槽」这件几何。 */
.slot-btn {
    --icon-size: calc(16px * var(--fs-scale));

    position: relative;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 5px;
    width: var(--slot-w, auto);
    height: var(--slot-h, 26px);
    padding: 0 9px;
    border-radius: var(--r-2);
    color: var(--ink-2);
    transition:
        color var(--t-quick) var(--ease-soft),
        width 220ms var(--ease-soft),
        height 220ms var(--ease-soft);
}

/* ---------- 尺寸预设 ----------
 * 只写 `sm` / `lg`，两档都落在 `--slot-h` / `--icon-size` 上——高度还是那句
 * `var(--slot-h, 26px)`，所以父级用更高特异性的选择器覆写变量时仍然生效。
 *
 * `md` **故意不写规则**：它就是「什么都不声明」，默认高度才轮得到继承父级的
 * `--slot-h`（侧栏 footer 传 30px 就是这么用的）。给 md 补一条 `--slot-h: 26px`
 * 会把那份继承盖掉，侧栏那格会无声退回 26px。
 */
.slot-btn.size-sm {
    --icon-size: calc(14px * var(--fs-scale));
    --slot-h: calc(24px * var(--fs-scale));
    --stamp-inset: 1px;

    padding: 0 calc(8px * var(--fs-scale));
}
.slot-btn.size-lg {
    --icon-size: calc(17px * var(--fs-scale));
    --slot-h: calc(31px * var(--fs-scale));
    /* 比 1px 再放开 1px：大槽里 1px 的槽底读不出来，印会像贴在框上。
     * 2px 是「看得出有圈边、又不至于把印缩成一块小牌」的临界值。 */
    --stamp-inset: 2px;

    padding: 0 calc(11px * var(--fs-scale));
}
/* 字也跟一档：31px 的槽配 12px 的字，四周会空出一圈，看着像「字没长大」。 */
.slot-btn.size-lg .slot-text {
    font-size: var(--fs-base);
}

/* 纯图标要正方形：宽度默认取高度，父级显式给了 `--slot-w` 才听父级的。
 * 父级若要正方形，把 `--slot-w` 传成与 `--slot-h` 同一个值即可（侧栏就是这么用的）。 */
.slot-btn.icon-only {
    width: var(--slot-w, var(--slot-h, 26px));
    padding: 0;
}

/* 朱印：内缩 `--stamp-inset` 落进槽里，只留一道槽底 + 一道金边，印面才占得住这块地。
 * 面本身来自全局 `.stamp`（底色 / 受光 / 高光 / 投影），这里只有「藏起来、悬停时按下去」
 * 这件事——它是真元素而不是 `::before`，否则没法挂 `.stamp`。
 *
 * 内缩必须是变量而不是写死 1px：按钮放大后，1px 在 31px 的槽里只占 3%（26px 时是 4%），
 * 那圈「槽底 + 金边」就细到看不见，读起来是一枚红块贴在框上，而不是印落进槽里。
 * 所以每个尺寸档自己给内缩（见下方预设），圆角跟着内缩一起减，边缘才不会露白。
 */
.slot-stamp {
    position: absolute;
    inset: var(--stamp-inset, 1px);
    border-radius: calc(var(--r-2) - var(--stamp-inset, 1px));
    opacity: 0;
    transform: scale(0.94);
    transition:
        opacity var(--t-quick) var(--ease-soft),
        transform 200ms var(--ease-snap),
        background-color var(--t-quick) var(--ease-soft),
        box-shadow var(--t-quick) var(--ease-soft);
}

.slot-btn:hover:not(:disabled) .slot-stamp {
    opacity: 1;
    transform: scale(1);
}
.slot-btn:hover:not(:disabled) {
    color: var(--on-seal);
}

/* 按下：印被压进槽底的凹痕。 */
.slot-btn:active:not(:disabled) .slot-stamp {
    background-color: color-mix(in srgb, var(--seal) 78%, var(--ink));
    background-image: linear-gradient(180deg, var(--bevel-lo), transparent 58%);
    box-shadow: inset 0 2px 4px var(--bevel-lo);
}

/* ---------- 变体：印已落定（主操作） ----------
 * 印面常驻，于是「悬停才出现」这个反馈就没有了——补一个更轻的：悬停时印压深一档。
 * 不要换成描边或改字重：这套界面里主次只由「有没有朱色」表达，
 * 一旦靠描边区分，就会出现「既像主操作又像按下态」的第三种读法。
 */
.slot-btn.seal {
    color: var(--on-seal);
}
.slot-btn.seal .slot-stamp {
    opacity: 1;
    transform: scale(1);
}
.slot-btn.seal:hover:not(:disabled) .slot-stamp {
    background-color: color-mix(in srgb, var(--seal) 88%, var(--ink));
}

/* 禁用：不给第二套配色。半透明就够——禁用态的信息是「点不动」，不是「另一种状态」。 */
.slot-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
}

/* 图标要压在印面上面：绝对定位的 `.slot-stamp` 会盖住非定位内容。
 * 16px 是这个控件的规格——14px 在 24px 的印面上只占四成，四周一圈留白，
 * 看着就是「里面小小的」；16px 撑到三分之二才饱满。尺寸仍走 `--icon-size`。 */
.slot-btn :deep(.app-icon) {
    position: relative;
    z-index: 1;
}

/* 文字同图标一样要抬到印面之上。行高压到 1：26px 的槽里 12px 字号再带默认行高，
 * 视觉重心会往上飘半格。 */
.slot-text {
    position: relative;
    z-index: 1;
    font-size: var(--fs-sm);
    line-height: 1;
    white-space: nowrap;
}

/* 聚焦环不能用朱红：悬停时底就是朱红，红环会消失。 */
.slot-btn:focus-visible {
    outline: 2px solid color-mix(in srgb, var(--ink) 45%, transparent);
    outline-offset: 1px;
}
</style>
