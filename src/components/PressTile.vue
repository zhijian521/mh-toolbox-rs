<script setup lang="ts">
/**
 * 压印块：一块微微凸起的纸，内容印在上面。
 *
 * 只画材质，不认识内容——工具页的图标格、左栏的牌记都套这一块。两处原本各有一套
 * 立体写法：工具格是「上亮下暗的四棱 + 落地影」，牌记是「一圈细线框 + 2px 底边」。
 * 后者在 34px 见方时读作「贴了张带框的图」，前者才是「纸上有一块东西」。合并之后
 * 只留一种：**光从左上来**，与全站的凹槽（`.well`）、印面（`.stamp`）同一套光向。
 *
 * ## 为什么是这五层
 *
 *   ① 块面        —— `--paper` 92%（几乎就是实色纸），比页面底亮一档，是「凸」的第一信息。
 *                    58% 时只比底色亮两三阶，光画得再准也读不出高低差。
 *   ② 斜向受光    —— 左上角一点偏光（radial）＋ 145° 高光渐变，向中下方散掉；
 *   ③ 四棱不对称  —— 上、左各 1px 亮线（受光），下 2px、右 1px 暗线（背光）。
 *                    **四面等宽就成了边框**，不对称才读得出光的方向。
 *   ④ 下沿 2px 厚度 —— 用 `--rule-2` 而不是 `--bevel-lo`：后者亮色下只有 12% 黑，
 *                      压在浅底上差十阶，画出来等于没画。2px 而不是 1px 是因为
 *                      1px 只读成描边，2px 才读成「这块东西有厚度」。
 *   ⑤ 落地影      —— `3px` 硬边（厚度）+ `8px` 软影（离纸很近，所以不散开）。
 *
 * ## 内容不做字口
 *
 * 试过三种：叠一层亮线一层暗线（1px）、SVG 光照浮雕（`feSpecularLighting`）、
 * 单侧暗影。前两种在 26px 的线图标上都是「笔画外面多一圈边」，3 倍放大看像描粗了
 * 一遍，1:1 看是发虚；第三种能读，但省下的那点厚度不值当把线图标的清晰度押上去。
 * 线图标要的是**落在纸上**，不是自己凸起来，所以内容只留一层 0.5px 的接吻影
 * （`.press-content`），让它贴着块面而不是浮在上面。
 *
 * ## 几何走变量，不写死
 *
 * 与 `SlotButton` 的 `--slot-*`、`VerticalSlider` 的 `--vs-*` 同一条约定：
 *   - `--tile-w`  块的宽（必给；不给就是内容宽）
 *   - `--tile-h`  块的高，默认与宽同值（方形）
 *   - `--tile-r`  圆角，默认 9px
 *   - `--tile-drop` 落地影的尺度，默认 1。小尺寸不缩会糊成一团：34px 的牌记
 *                 落 8px 软影，读作「浮起来的卡片」而不是「压在纸上的块」。
 *   - `--tile-face` 块面颜色，默认纸色。**只有放在纸色底上的地方才需要改**：
 *                 工具页的底是 `--bg`，比纸暗一档，块自己就浮起来了；左栏底色就是
 *                 `--paper`，块面与底同色时，暗色下整块会消失得只剩内容。
 *   - `--tile-face-hover` / `--tile-face-active`
 *                 悬停与按下时的块面色。默认值是「纸色变实」与「转向凹槽的灰」——
 *                 那是纸块的说法。**灌了色的块必须自己给**：`--tile-face: var(--seal)`
 *                 的朱红按钮若沿用默认值，指上去会闪成一张白纸、按下去闪成一块灰。
 * 圆角与棱厚都**不乘** `--fs-scale`：曲率是绝对的，字放大时圆角一起变大会读成另一种控件。
 *
 * ## `wide`：大块要收光
 *
 * 那颗左上角的偏光是**按百分比**给椭圆尺寸的（`120% × 96%`），而它是照 56px 的图标格
 * 调的：在那个尺寸上只是「左上角一点」。同一组百分比摊到 265 × 72 的统计签、乃至
 * 1100 宽的长条上，光会铺掉半张纸——暗色下直接读成一条横向渐变，不像一块纸。
 *
 * `wide` 把偏光换成**固定像素**（190 × 122 起步、暗色再压一档强度）：无论块多宽，
 * 光都只是左上那一小块。体积大于「一个图标格」的块都该传它（统计签、物价卡这类
 * 200px 以上的面）。不传就还是图标格那一套，别为了统一全站都给 `wide`——
 * 小方块用固定像素的偏光会显得光斑偏小、块面发死。
 *
 * ## 交互态
 *
 * 悬停提亮、按下凹回纸里，两条都在组件里——这两个状态与「一块可点的凸起」绑死，
 * 不是使用方的语义差异。差别只在悬停的**范围**：图标格里整格可点，但块只在自己
 * 被指到时变亮，名称那边由父级另给反馈，不靠块去替它表态。
 *
 * **不可点的地方传 `still`**（角色卡的辅助技能图标格就是）：那两条反馈是「按我」
 * 的承诺，长在点不动的块上等于骗人去点，而「点了没反应」比没有这个块更糟。
 * 只关状态、不关材质——凸起的棱、落地影、块面一律照旧，因为它仍然是纸上的一块东西。
 *
 * ## `tone`：纸面还是朱面
 *
 * 块默认是纸；`tone="seal"` 换成朱红面（主操作按钮、满级的门派字印）。
 *
 * **朱面的棱必须自己一套，不能借纸的那套**：纸的顶线是 `--bevel-hi`（不透明的奶白），
 * 压在 `#a8322b` 上是一条纯白塑料高光；底棱是 `--rule-2`（暖黄棕），对纸是「暗一档」，
 * 对朱红却是「亮一档」。同一条面膜在两个面上做出相反的明暗，两块就不是同一个光源下的东西。
 * 所以这一档把亮线换成朱色的受光面、暗线换成朱色的背光面，强度与纸块同量级。
 *
 * 三样东西连带换：块面三个（常态 / 悬停 / 按下）、棱、内容色（`--on-seal`）。
 * `PressButton` 的 `seal` 变体就是这一档，它自己不再写任何一条 box-shadow——
 * 两边各写一份配方，改一处忘一处就变成「按钮的朱和字印的朱不是一个朱」。
 */
withDefaults(defineProps<{ still?: boolean; tone?: 'paper' | 'seal'; wide?: boolean }>(), {
    still: false,
    tone: 'paper',
    wide: false,
});
</script>

<template>
    <span class="press-tile" :class="[{ still }, { 'tone-seal': tone === 'seal' }, { wide }]">
        <span class="press-content"><slot /></span>
    </span>
</template>

<style scoped>
.press-tile {
    display: grid;
    place-items: center;
    box-sizing: border-box;
    width: var(--tile-w, auto);
    height: var(--tile-h, var(--tile-w, auto));
    border-radius: var(--tile-r, 9px);
    background-color: var(--tile-face, color-mix(in srgb, var(--paper) 92%, transparent));
    background-image:
        /* 左上角那一点偏光：像纸被顶起来时正对着光的那个角先亮起来。
         * 没有它，块面只是一整片均匀的浅色，「光从哪来」要靠四条棱去猜。 */
        radial-gradient(
            120% 96% at 20% 6%,
            color-mix(in srgb, var(--bevel-hi) 62%, transparent),
            transparent 52%
        ),
        linear-gradient(
            145deg,
            color-mix(in srgb, var(--bevel-hi) 78%, transparent),
            transparent 58%
        ),
        linear-gradient(
            315deg,
            color-mix(in srgb, var(--bevel-lo) 170%, transparent),
            transparent 62%
        );
    box-shadow:
        inset 0 1px 0 var(--bevel-hi),
        inset 1px 0 0 color-mix(in srgb, var(--bevel-hi) 62%, transparent),
        inset -1px 0 0 color-mix(in srgb, var(--rule-2) 46%, transparent),
        inset 0 -2px 0 color-mix(in srgb, var(--rule-2) 76%, transparent),
        0 calc(3px * var(--tile-drop, 1)) 0 var(--shadow),
        0 calc(8px * var(--tile-drop, 1)) calc(12px * var(--tile-drop, 1))
            calc(-5px * var(--tile-drop, 1)) var(--shadow-lg);
    /* 内容用次级墨（`--ink-2`），不是正墨（`--ink`）。
     *
     * 这条改过一次。原先用 `--ink`：理由是「牌记那只字是满墨的，淡一号的图标放在
     * 凸起的块面上读作占位图」。真摆上 12px 的按钮文字后，`#292520` 落在 `#f8f3e6`
     * 的块面上是 14:1，比同一行的说明字重一大截，看着像加粗过。当时的做法是留一个
     * `--tile-fg` 让调用方覆盖——绕了一圈还是同一个效果，却把「这一块该用多深」
     * 的答案分成了两处（默认一处、覆盖处一处），删掉覆盖就退回满墨。
     *
     * 现在直接改默认值：**凸起的块自己就是受光的浅面，压在它上面的内容该比正文轻一档**，
     * 这是材质决定的，不是某个调用方的偏好，所以没有理由做成变量。
     *
     * 不受影响的两处（各自有显式色，不继承这一条）：牌记是 `<img>`；朱红块上的字由
     * `PressButton` 的 `seal` 段给 `--on-seal`。
     *
     * 角色页装备块原先靠 `.gear-name { color: var(--ink) }` 顶回正墨——2026-11-04 那一格
     * 重排之后，名字挪到块外（进的是凹槽，不是块），块里只剩图，这条随之不成例。 */
    color: var(--ink-2);
    transition:
        background-color var(--t-quick) var(--ease-soft),
        box-shadow var(--t-quick) var(--ease-soft),
        transform var(--t-quick) var(--ease-soft),
        color var(--t-quick) var(--ease-soft);
}

/* 内容落影：0.5px 偏移、0.4px 模糊，跟着块面的光走。
 * 不是为了「凸」，是为了让笔画与块面之间有一点点接触阴影——没有它，图标像贴在
 * 图片上的浮层；有了它，才是印在这块纸上。数值刻意小到看不出是阴影。 */
.press-content {
    display: grid;
    place-items: center;
    filter: drop-shadow(0.5px 0.6px 0.4px color-mix(in srgb, var(--ink) 34%, transparent));
}

/* 暗色下必须换成黑色落影。`--ink` 在暗色里是**浅色**，照着用等于给内容描一圈光——
 * 它会从块面上浮起来发光，与「印上去」正好相反。 */
:root.dark .press-content {
    filter: drop-shadow(0.5px 0.6px 0.5px var(--bevel-lo));
}

/* 悬停：块面变实、落地影拉长一档，**不位移**。
 * 桌面图标被指到时给的是「底色变浅、影子变长」，不是「弹起来」——弹跳会破坏一格格
 * 排好的秩序。纸色已经是最亮的，再往上只能发灰，所以「提亮」只能落在两件事上：
 * 块面从 92% 半透明变成实色（不再透出底下的纸），以及影子从 3/8px 抬到 4/10px。
 * 只改颜色而不动影子，两档纸色的差在一张米黄底上根本读不出来。
 * 文字随 `color` 一起转朱红，图标继承这个值，不用另配一条规则。 */
.press-tile:not(.still):hover {
    background-color: var(--tile-face-hover, var(--paper));
    box-shadow:
        inset 0 1px 0 var(--bevel-hi),
        inset 1px 0 0 color-mix(in srgb, var(--bevel-hi) 62%, transparent),
        inset -1px 0 0 color-mix(in srgb, var(--rule-2) 62%, transparent),
        inset 0 -2px 0 color-mix(in srgb, var(--rule-2) 92%, transparent),
        0 calc(4px * var(--tile-drop, 1)) 0 var(--shadow),
        0 calc(10px * var(--tile-drop, 1)) calc(16px * var(--tile-drop, 1))
            calc(-5px * var(--tile-drop, 1)) var(--shadow-lg);
    color: var(--cinnabar);
}

/* 按下：明暗对调 + 底色转向凹槽 —— 与 `SlotButton` 的按下态同一个意思：
 * 不是变暗，是被压回纸里。凹进去之后受光的是**右下**的内缘（光还是从左上来，
 * 只是这一次照到的是对面的那条棱），所以亮线从左上换到右下。
 * 内影带 3px 模糊（常态的凸起是 1px 硬线）：凹的东西边缘是渐进去的，硬线会读成描边。
 * 位移 2px 把「抬起来的厚度」还回去，四条棱也必须一起收，否则只剩垫子还在原地。 */
.press-tile:not(.still):active {
    background-color: var(--tile-face-active, color-mix(in srgb, var(--well) 82%, transparent));
    background-image: linear-gradient(
        325deg,
        color-mix(in srgb, var(--bevel-hi) 42%, transparent),
        transparent 58%
    );
    box-shadow:
        inset 1px 1px 4px var(--bevel-lo),
        inset -1px 0 0 color-mix(in srgb, var(--bevel-hi) 72%, transparent),
        inset 0 -1px 0 color-mix(in srgb, var(--bevel-hi) 82%, transparent);
    transform: translateY(2px);
}

/* 深色下四处必须换值，否则整块糊进背景：
 * 1. 块面直接给 `--paper` 实色。同一个 `--paper` 在暗底上只落出两三阶差，
 *    再用半透明混一下就彻底没了；
 * 2. 右下两条棱改回 `--bevel-lo`。`--rule-2` 在暗色下是 #544a33，比块面**亮**，
 *    画在底边会成一条发光的线，光向反了；
 * 3. 高光渐变提到全强度：18% 白在暗底上要拉满才够一个角；
 * 4. 落地影用 `--shadow-lg` 两档叠加：暗底上的第一层硬边几乎看不见。
 * 上沿与左沿不用改：`--bevel-hi` 一路都是「加白」，两个主题同向。 */
:root.dark .press-tile {
    background-color: var(--tile-face, var(--paper));
    background-image:
        radial-gradient(
            120% 96% at 20% 6%,
            color-mix(in srgb, var(--bevel-hi) 100%, transparent),
            transparent 52%
        ),
        linear-gradient(
            145deg,
            color-mix(in srgb, var(--bevel-hi) 100%, transparent),
            transparent 58%
        ),
        linear-gradient(
            315deg,
            color-mix(in srgb, var(--bevel-lo) 100%, transparent),
            transparent 62%
        );
    box-shadow:
        inset 0 1px 0 var(--bevel-hi),
        inset 1px 0 0 color-mix(in srgb, var(--bevel-hi) 70%, transparent),
        inset -1px 0 0 var(--bevel-lo),
        inset 0 -2px 0 var(--bevel-lo),
        0 calc(3px * var(--tile-drop, 1)) 0 var(--shadow-lg),
        0 calc(8px * var(--tile-drop, 1)) calc(13px * var(--tile-drop, 1))
            calc(-5px * var(--tile-drop, 1)) var(--shadow-lg);
}

/* ---------- 暗色下的悬停与按下 ----------
 * 这两条**不是**重复劳动。上面那条 `:root.dark .press-tile` 比 `.press-tile:hover`
 * 多一个复合选择器（再各加一个 scope 属性，是 0,4,0 与 0,3,0），所以不带主题前缀的
 * 状态规则一律被它压住——不补的话，暗色里块面永远不动，亮色却一切正常（亮色没有
 * 更高特异性的规则压着它）。
 * 原先这套材质长在工具页里、由 `.tool-item:active:not(:disabled) .tool-tile`
 * 四层选择器驱动，所以压得住；收进组件之后层级变浅，这个坑才露出来。
 *
 * 悬停只提亮面、不换棱色，但**影子要重写**：上面那条暗色基础规则里带着 box-shadow，
 * 不重写的话影子仍是常态那一道，块面亮了而高度没变，读作「换了块色板」。
 * 按压要重写渐变——否则会被那条暗色基础规则三段渐变顶回去，按下去仍然「亮着」。
 */
:root.dark .press-tile:not(.still):hover {
    background-color: var(--tile-face-hover, color-mix(in srgb, var(--paper) 88%, var(--ink)));
    box-shadow:
        inset 0 1px 0 var(--bevel-hi),
        inset 1px 0 0 color-mix(in srgb, var(--bevel-hi) 70%, transparent),
        inset -1px 0 0 var(--bevel-lo),
        inset 0 -2px 0 var(--bevel-lo),
        0 calc(4px * var(--tile-drop, 1)) 0 var(--shadow-lg),
        0 calc(10px * var(--tile-drop, 1)) calc(16px * var(--tile-drop, 1))
            calc(-5px * var(--tile-drop, 1)) var(--shadow-lg);
}
:root.dark .press-tile:not(.still):active {
    background-color: var(--tile-face-active, color-mix(in srgb, var(--well) 86%, transparent));
    background-image: linear-gradient(
        325deg,
        color-mix(in srgb, var(--bevel-hi) 26%, transparent),
        transparent 58%
    );
    box-shadow:
        inset 1px 1px 3px var(--bevel-lo),
        inset -1px 0 0 color-mix(in srgb, var(--bevel-hi) 55%, transparent),
        inset 0 -1px 0 color-mix(in srgb, var(--bevel-hi) 62%, transparent);
}
/* ======================================================================
 * 朱面（`tone="seal"`）
 * ==================================================================== */
/* 三个块面一起给。只给 `--tile-face` 的话，指上去闪白纸、按下去闪灰块——
 * 那两个默认值是按纸调的。 */
.press-tile.tone-seal {
    /* 背光不能直接取 `--seal-edge`：它在亮色比块面深（#8a2620）、在暗色却比块面**浅**
     * （#c88471），照用会让暗色的底棱变成一条发光的线。压 30% 纯黑两个主题都成立——
     * 用的是不翻面的 `--ink-base`，`--ink` 在暗色是纸白，混出来反而会把底棱提亮。 */
    --seal-lt: color-mix(in srgb, var(--seal) 62%, var(--paper-base));
    --seal-dp: color-mix(in srgb, var(--seal) 70%, var(--ink-base));
    --tile-face: var(--seal);
    --tile-face-hover: color-mix(in srgb, var(--seal) 88%, var(--ink));
    --tile-face-active: color-mix(in srgb, var(--seal) 74%, var(--ink));

    color: var(--on-seal);
    box-shadow:
        inset 0 1px 0 color-mix(in srgb, var(--seal-lt) 62%, transparent),
        inset 1px 0 0 color-mix(in srgb, var(--seal-lt) 30%, transparent),
        inset -1px 0 0 color-mix(in srgb, var(--seal-dp) 38%, transparent),
        inset 0 -2px 0 color-mix(in srgb, var(--seal-dp) 72%, transparent),
        0 calc(3px * var(--tile-drop, 1)) 0 var(--shadow),
        0 calc(8px * var(--tile-drop, 1)) calc(12px * var(--tile-drop, 1))
            calc(-5px * var(--tile-drop, 1)) var(--shadow-lg);
}

/* 暗色那条基础规则（`:root.dark .press-tile`）比这一条多一个 `:root.dark`，
 * 不补这一条就会被它顶回纸的棱。块面不用重设——`--tile-face` 仍是朱；
 * 背景渐变也不重设：亮色下那三条本来就是无效的整条丢弃，暗色下它们会把朱面提亮一档，
 * 与 `PressButton` 改版前完全一样（那套偏光对两个面都是「加白」，方向没错）。 */
:root.dark .press-tile.tone-seal {
    box-shadow:
        inset 0 1px 0 color-mix(in srgb, var(--seal-lt) 62%, transparent),
        inset 1px 0 0 color-mix(in srgb, var(--seal-lt) 30%, transparent),
        inset -1px 0 0 color-mix(in srgb, var(--seal-dp) 38%, transparent),
        inset 0 -2px 0 color-mix(in srgb, var(--seal-dp) 72%, transparent),
        0 calc(3px * var(--tile-drop, 1)) 0 var(--shadow-lg),
        0 calc(8px * var(--tile-drop, 1)) calc(13px * var(--tile-drop, 1))
            calc(-5px * var(--tile-drop, 1)) var(--shadow-lg);
}

/* 朱面上的内容落影要用**不翻面**的深色。`.press-content` 默认那条取 `--ink`，
 * 暗色下它是纸白——纸白的字自带一圈白光，在朱面上就是「字浮着发光」。 */
.press-tile.tone-seal .press-content {
    filter: drop-shadow(0.5px 0.6px 0.4px color-mix(in srgb, var(--ink-base) 42%, transparent));
}

/* 悬停与按下：两条主题同值，所以一条规则挂两个选择器写一次（暗色那条基础规则把
 * 不带 `:root.dark` 的状态压住了，必须各写一个够高的）。 */
.press-tile.tone-seal:not(.still):hover,
:root.dark .press-tile.tone-seal:not(.still):hover {
    box-shadow:
        inset 0 1px 0 color-mix(in srgb, var(--seal-lt) 76%, transparent),
        inset 1px 0 0 color-mix(in srgb, var(--seal-lt) 42%, transparent),
        inset -1px 0 0 color-mix(in srgb, var(--seal-dp) 46%, transparent),
        inset 0 -2px 0 color-mix(in srgb, var(--seal-dp) 78%, transparent),
        0 calc(4px * var(--tile-drop, 1)) 0 var(--shadow),
        0 calc(10px * var(--tile-drop, 1)) calc(16px * var(--tile-drop, 1))
            calc(-5px * var(--tile-drop, 1)) var(--shadow-lg);
}

/* 按下：渐变换成朱色高光（纸色那条会让块面闪白），内凹的亮线从右下起——
 * 光还是从左上来，只是这一次照到对面那条棱。 */
.press-tile.tone-seal:not(.still):active,
:root.dark .press-tile.tone-seal:not(.still):active {
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

/* ======================================================================
 * `wide`：大块收光
 * ====================================================================
 * 只换背景那三层渐变，棱、影、块面一个都不动——这是一块**同样材质、光斑更小**的纸，
 * 不是另一种块。写在这里（文件末尾）而不是前面：`hover` / `active` / `tone-seal`
 * 都不改 `background-image`（只有 `active` 改），所以顺序上不会互相顶掉。
 *
 * 暗色那一条必须带 `:root.dark`：基础规则 `:root.dark .press-tile` 是 (0,3,0)，
 * 光写 `.press-tile.wide`（0,2,0）会被它整个盖掉，而亮色却正常——这种「只有暗色不对」
 * 的样式最难查，原因就在这里。
 */
.press-tile.wide {
    background-image:
        radial-gradient(
            190px 122px at 26px 6px,
            color-mix(in srgb, var(--bevel-hi) 58%, transparent),
            transparent 72%
        ),
        linear-gradient(
            145deg,
            color-mix(in srgb, var(--bevel-hi) 52%, transparent),
            transparent 46%
        ),
        linear-gradient(
            315deg,
            color-mix(in srgb, var(--bevel-lo) 100%, transparent),
            transparent 70%
        );
}
:root.dark .press-tile.wide {
    background-image:
        radial-gradient(
            150px 100px at 22px 4px,
            color-mix(in srgb, var(--bevel-hi) 50%, transparent),
            transparent 70%
        ),
        linear-gradient(
            160deg,
            color-mix(in srgb, var(--bevel-hi) 34%, transparent),
            transparent 44%
        ),
        linear-gradient(
            315deg,
            color-mix(in srgb, var(--bevel-lo) 100%, transparent),
            transparent 70%
        );
}
</style>
