<script setup lang="ts">
import { useNotifyState } from '../composables/use-notify';

/**
 * 全站唯一的消息提示宿主。挂在 `App.vue` 里，与 `ConfirmHost` 并列，页面不自己渲染。
 *
 * 形态：屏幕上方居中一道**压进纸里的槽**，几秒后自己收走；鼠标停上去就停表，点一下立刻收。
 *
 * ---- 为什么是凹槽，不是「浮起来的纸条」 ----
 * 提示是临时的：它不该像卡片那样「放」在纸面上，那会让人以为页面上多了一块东西，
 * 过两秒又凭空消失。凹槽正好相反——纸被压出一格、话写在格子里，说完就抚平。
 * 而且这套界面里已经有这个语言（`.bevel-pill`、`SlotButton`、字号滑块都是同一个四件套），
 * 用户不必为一条提示再学一种厚度。
 *
 * 试过平纸条（细边 + 抬影）与凸起的纸片，都不如它：平纸条读作「一张便利贴」，
 * 凸起的读作「又一张卡片」——两者都在跟页面上的卡片抢同一件事。
 *
 * ---- 读成「凹」靠的是明度差，不是那四道笔画 ----
 * 四件套（槽底 + 上暗下亮渐变 + 顶部内影 + 下沿亮高光）缺一件就读不出凹；但**一件不缺、
 * 底色只比周围深一档**时同样读不出——第一版就是这么翻的车。所以这里的底色往
 * `--ink-base` 里压了 14%（暗色压 48%），比纸面上的其他凹槽深一档：它浮在页面底
 * （`--bg`）上，而不是压在卡片里，不深一点就没有参照。
 *
 * ---- 语气色只落在左端一道 3px 的竖条上，不配图标 ----
 * 凹槽里再放一枚描边图标，两个彩色记号挨在一起会互相抵消。而三类语气的文字本身
 * （「已删除」/「没删掉」/「已取消」）已经说清了是哪一类，竖条只服务余光。
 * 无障碍靠 `aria-live` 那一层：读屏念的是整句，不是颜色。
 *
 * ---- 位置 ----
 * 水平居中，落在页头下方 14px（`top` 由标题栏与 `--page-head-h` 算出来，见样式段）。
 * 多条向下堆叠，最新的在最下面——眼睛顺着刚发生的事往下读。
 */
const { notices, hold, resume, dismiss } = useNotifyState();
</script>

<template>
    <Teleport to="body">
        <!-- `aria-live` 挂在这一层而不是每条上：读屏只在「区域已经存在、内容变了」时才播报，
             一条随生随灭的 `role="status"` 有可能整条被略过。这一层常驻，纸条从里面进出。 -->
        <div class="notice-layer" aria-live="polite" aria-atomic="false">
            <TransitionGroup name="notice">
                <div
                    v-for="one in notices"
                    :key="one.id"
                    class="notice"
                    :class="`is-${one.tone}`"
                    @mouseenter="hold(one.id)"
                    @mouseleave="resume(one.id)"
                    @click="dismiss(one.id)"
                >
                    {{ one.text }}
                </div>
            </TransitionGroup>
        </div>
    </Teleport>
</template>

<style scoped>
/* 层本身不吃点击：它横跨页面顶部，若整层可点，会把下面的页头挡成一块死区。
 * 每道槽自己恢复 `pointer-events`——只为了悬停停表与点击收走。
 *
 * `top` 由两枚令牌算出来，不写死像素：标题栏（36 × 字号档）+ 页头 + 14px 留白。
 * 写死一个数（比如 78）在「较大」字号下会压到页头标题上——两处都会长高，
 * 而那个数不会。 */
.notice-layer {
    position: fixed;
    top: calc(36px * var(--fs-scale) + var(--page-head-h) + 14px);
    left: 50%;
    z-index: 90; /* 高于弹窗的 80：提示说的是「刚刚那下成了没有」，被弹窗盖住就没有意义 */
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 9px;
    pointer-events: none;
    transform: translateX(-50%);
}

/* ---------- 槽 ----------
 * 四件套，与 `SlotButton` / `.bevel-pill` 同一个规格，只有两处更重：
 *   底色比 `--well` 再压一档（它浮在页面底上，不在卡片里，没有参照）
 *   顶部内影从 1px 加到 3px（一行字的槽太浅，压不住）
 * 其余（上暗下亮、下沿亮高光）与别处一致。 */
.notice {
    --notice-tone: var(--ink-2);
    /* 竖条底端那一截：语气色往墨里压，让竖条自己有明暗，不是一块平色。 */
    --notice-deep: color-mix(in srgb, var(--notice-tone) 62%, var(--ink-base));

    position: relative;
    display: flex;
    align-items: center;
    max-width: 380px;
    padding: 9px 16px 9px 21px;
    color: var(--ink);
    font-size: var(--fs-base);
    line-height: 1.6;
    /* 长路径 / 长错误信息不许把槽撑出屏幕，折行就折行。 */
    overflow-wrap: anywhere;
    border-radius: var(--r-2);
    border: var(--w-hair) solid color-mix(in srgb, var(--rule-2) 86%, var(--ink-base));
    background: linear-gradient(
        180deg,
        light-dark(
                color-mix(in srgb, var(--well) 86%, var(--ink-base)),
                color-mix(in srgb, var(--well) 52%, var(--ink-base))
            )
            0%,
        var(--well) 34%,
        light-dark(
                color-mix(in srgb, var(--well) 96%, var(--paper)),
                color-mix(in srgb, var(--well) 88%, var(--paper))
            )
            100%
    );
    box-shadow:
        inset 0 3px 5px -1px
            light-dark(
                color-mix(in srgb, var(--ink-base) 26%, transparent),
                color-mix(in srgb, var(--ink-base) 94%, transparent)
            ),
        inset 0 -1px 0 var(--bevel-hi),
        0 1px 0 var(--bevel-hi);
    cursor: default;
    user-select: none;
    pointer-events: auto;
}

/* 左端那道竖条。上下各内缩 5px 而不是顶到边：槽的四角是圆的，
 * 一条 3px 直条压上去会在左上角露出一个方角。 */
.notice::before {
    content: '';
    position: absolute;
    inset: 5px auto 5px 6px;
    width: 3px;
    border-radius: 1px;
    background: linear-gradient(
        180deg,
        color-mix(in srgb, var(--notice-tone) 68%, var(--paper-base)) 0%,
        var(--notice-tone) 48%,
        var(--notice-deep) 100%
    );
    box-shadow: inset 0 1px 0 var(--bevel-hi);
}

/* 三档只换颜色，不换结构、不换尺寸。多一套形态就等于多一个「这是哪一类消息」的
 * 判断成本，而这三类本来只是同一件事的三种语气。 */
.is-success {
    --notice-tone: var(--moss);
}
.is-error {
    --notice-tone: var(--cinnabar-ink);
}
.is-info {
    --notice-tone: var(--muted);
}

/* 进场从上方 8px 落下、淡入；收走反向。只动 opacity 与 transform，不动高度——
 * 动高度会让下面那几条跟着重排，读起来是一次抖动。
 * `prefers-reduced-motion` 由 `base.css` 的全局通配降级兜住。 */
.notice-enter-active,
.notice-leave-active {
    transition:
        opacity var(--t-mid) var(--ease-soft),
        transform var(--t-mid) var(--ease-soft);
}
.notice-enter-from,
.notice-leave-to {
    opacity: 0;
    transform: translateY(-8px);
}
/* 中间那条被收走时，下面的槽滑上来补位（快一档：这是在收拾残局，不该慢慢演）。 */
.notice-move {
    transition: transform var(--t-shape) var(--ease-soft);
}
</style>
