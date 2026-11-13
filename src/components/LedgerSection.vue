<script setup lang="ts">
import PaperCard from './PaperCard.vue';
/**
 * 账簿语境里的「一块」：一张抬起的纸片 + 区块标 + 标题 + 右侧提示/操作。
 *
 * 外壳是全局 `.board`（2026-11-05 起全站统一，材质与缘由写在 `base.css` 那一节）：
 * 圆角、上亮下暗的棱、下沿 3px 纸的断面、两层落影。它躺在 `PageShell` 的台面上，
 * 与统计签、物价卡、角色卡同一个物理关系——这一页里不再有「线框」和「凸块」两套材质。
 *
 * **这里一份材质都不重写**：改厚度只要改 `.board`，全站跟着变；组件这边只管内容怎么摆。
 * 原先 `.frame` 那套文武线留给浮层（角色编辑器、捉鬼测试面板），它们是「盖在纸上的东西」，
 * 不是「摆在台面上的纸」。
 *
 * 标题左侧那道凸起短竖条（`.section-mark`）是块内唯一的立体记号：它得有点厚度才读得出
 * 「一块从这里开始」，材质与凹槽、印面同一套 `--bevel-*`。
 *
 * 不再收 `seal` 那样的单字：八个区块各带一枚朱印，块与块之间就被红点压闷了；
 * 印章该留给「已入账 / 已达成」这类状态。标记是恒定的一竖，不需要每块编一个字。
 *
 * ---- `max-height` / `height`：给「长清单」用的 ----
 * 开发帮助页的色板、图标目录是清单，条目数会跟着令牌与图标一起长；一张卡长到两屏之后，
 * 往下翻的人就分不清自己是在这张卡里还是在下一张卡里。传 `max-height` 之后**卡头不动、
 * 内容自己滚**：`.ledger-section` 变成一列 flex，`.section-body` 拿走剩下的高度并 `overflow`。
 * 只给这一处用，业务页不传——那里的卡片高度由内容决定，读者本来就要一眼看全。
 * 传的是 CSS 长度原样（`62vh`），组件不解释它：视口高度只有页面知道。
 *
 * **`height` 是 `max-height` 的「写死」版**（2026-11-06）：上限只管「长了不超出」，
 * 内容少的那一屏卡片会缩回去，于是它下面那些卡跟着上下跳。原子组件那张要的是反过来
 * ——高度恒定，组与组之间切换时页面纹丝不动。两者互斥，`height` 优先。
 * 写死之后 **`section-body` 自己不滚**（不然卡片里会有一圈滚动条、里面再套两圈）：
 * 它的子内容自己决定怎么滚（那张卡是左右两栏各自滚）。
 */
withDefaults(defineProps<{ title: string; hint?: string; maxHeight?: string; height?: string }>(), {
    hint: '',
    maxHeight: '',
    height: '',
});
</script>

<template>
    <PaperCard
        class="ledger-section"
        :class="{ capped: maxHeight || height, fixed: height }"
        :style="
            height
                ? { '--section-h': height }
                : maxHeight
                  ? { '--section-max': maxHeight }
                  : undefined
        "
    >
        <header class="section-head">
            <h2>
                <span class="section-mark" aria-hidden="true" />
                {{ title }}
            </h2>
            <span v-if="hint" class="hint">{{ hint }}</span>
            <div v-if="$slots.actions" class="section-actions">
                <slot name="actions" />
            </div>
        </header>
        <!-- 恒定包一层：`capped` 时要让滚动区与卡头分开，不包就没法只滚内容。
             默认态它只是个普通块盒，对现有卡片零影响（四张卡与八个页面都已复核）。
             `tabindex` 只在 `max-height` 时给：**可滚动的区域必须能用键盘滚**（PgUp/PgDn、方向键），
             否则鼠标滚轮是唯一入口。它同时会进 Tab 序列，并拿到全局那圈焦点环——
             那正是「这里还能往下」最直白的说法。`height` 时这一层不滚，所以不给。 -->
        <div class="section-body" :tabindex="maxHeight && !height ? 0 : undefined">
            <slot />
        </div>
    </PaperCard>
</template>

<style scoped>
.ledger-section {
    padding: var(--block-pad);
}

/* 有上限时：卡头固定、内容滚动。`min-height: 0` 是必须的——flex 子项的默认
 * `min-height: auto` 会让它撑到内容高度，`overflow` 永远不触发。 */
.ledger-section.capped {
    display: flex;
    flex-direction: column;
}
/* 只有 `max-height` 才是「上限」：给 `height` 时不设这道闸，否则两者一起传会互相打架。 */
.capped:not(.fixed) {
    max-height: var(--section-max);
}
/* 写死高度：卡高恒定，翻组、换内容都不动。 */
.fixed {
    height: var(--section-h);
}
.capped .section-head {
    flex: none;
}
.capped .section-body {
    flex: 1;
    min-height: 0;
    overflow: auto;
    /* 轨道固定占位并压进卡片内边距，列表显隐时内容宽度保持不变。 */
    scrollbar-gutter: stable;
    margin-right: calc(-1 * var(--scrollbar-w));
}
/* 写死高度时这一层退回纯容器：它自己滚的话，卡片里会有一圈滚动条、内容里再套几圈。
 * 固定轨道与负外边距一并收回，避免无滚动内容也被挤窄。 */
.fixed .section-body {
    overflow: hidden;
    scrollbar-gutter: auto;
    margin-right: 0;
}

.section-head {
    display: flex;
    /* 不用 baseline：`h2` 自己也是个 flex 容器，它第一个 item 是那枚空标记，
     * 而空元素的基线就是自身底边——于是 11px 的 hint 被对齐到标记底边，
     * 比标题文字还低 2.5px，整行读起来是「小字掉下去了」。
     * 改底边对齐后两者的字底严格重合（实测 128.30 = 128.30），且 `h2` 仍是 19 高。
     * 也不要把 `h2` 退回 inline 排版来修：那会让 18px 的标记撑高行框到 20.6。 */
    align-items: flex-end;
    gap: 10px;
    margin-bottom: 12px;
}
/* 不写 `font-weight`，也不写 `font-size`：区块标题与全站标题共用 `base.css` 的 `h2`
 * （400 / `--fs-md`）。这里曾写 600，scoped 选择器特异性高于全局 `h2`，
 * 把标题顶成了浏览器合成加粗；文楷本地只有 Regular，合成的笔画外扩会把撇捺糊成块，
 * 与 CONVENTIONS §2.4-9 直接冲突。层级靠文武线外框和区块标交代，不靠字重。 */
h2 {
    display: flex;
    align-items: center;
    /* 标与字之间 7px：再宽标题会读成「标 + 空格 + 标题」，再窄那道竖条就贴上字了。 */
    gap: 7px;
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
