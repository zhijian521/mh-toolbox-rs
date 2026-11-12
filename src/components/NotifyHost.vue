<script setup lang="ts">
import { ref } from 'vue';
import { useNotifyState } from '../composables/use-notify';

/**
 * 全站唯一的消息提示宿主。挂在 `App.vue` 里，与 `ConfirmHost` 并列，页面不自己渲染。
 *
 * 形态：屏幕上方居中一道**压进纸里的槽**，几秒后自己收走；鼠标停上去就停表，点一下立刻收。
 *
 * ---- 键盘用户也要能停表 ----
 * 三秒自动收走是一个**限时**的信息（WCAG 2.2.1）：只有鼠标能停表，等于键盘用户读不完
 * 一句长错误。所以每道槽是 `tabindex="0"`：Tab 过去就 `hold`（焦点离开再 `resume`，
 * 重新计满三秒），Enter / Space 与点击同义，直接收走。
 * 这一层不做成 `role="button"`——它首先是一句话，其次才是「点掉」；给它按钮语义，
 * 读屏会先念「按钮」再念正文，而正文才是这条提示的全部内容。
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
 * ---- 亮色的面为什么改浅了（2026-11-04）----
 * 第一版把底色往 `--ink-base` 里压了 14%（暗色 48%），为的是「它浮在页面底上，
 * 不深一点没有参照」。暗色那版是对的，亮色那版翻车：掺纯黑不只压暗，还**抽掉色相**
 * ——算出来是 `#c6bda5`，一块偏灰的色，落在暖纸上读作「一块脏的暗片」，而它本来是
 * 「纸被压下去一格」。用户原话：「3D 效果 亮色的看起来有点黑」。
 *
 * 现在亮色的面只压一档、且是**暖压**（`--well` 掺 `--rule-2`，约 `#e0d4b7`），深度改由
 * **沿口**承担：上沿一道 1px 硬边说明「这里被压住」，紧接着 5px 内的短影只压内壁，
 * 下沿一道亮线把它抬回来。面浅了，边反而更用力——这是「不黑但仍有厚度」的唯一做法。
 * 暗色材质见 `tokens.css` 的 `html.dark .notice`，那里压到近黑才有层次。
 *
 * ---- 语气：一枚空心圆印 + 一道计时线 ----
 * 语气色不落在整条边上（3px 竖条与文字挨得近、重心偏左），而落在一枚 15px 的空心圆印上：
 * 它是「记号」，不是「一块背景」。槽底那条 2px 是**剩余时间**——三秒走完就没，
 * 它回答「为什么它突然消失」，而这件事原先只能靠等。
 *
 * 计时线与 `hold` / `resume` 必须同拍：`hold` 清定时器（CSS 这一侧靠 `:hover` /
 * `:focus-visible` 暂停动画），`resume` 给满新的三秒——所以那根条也要从满格重放。
 * 重放靠换 `key`（`runs` 每次 resume 加一）：CSS 只能暂停，不能「重头开始」。
 *
 * ---- 位置 ----
 * 水平居中，**压在页头这一条带子上**（标题栏下 5px，见样式段）：页头右侧是空区，
 * 压在上面不挡内容；排在页头下方反而会盖住第一张卡的上半截。
 * 多条向下堆叠，最新的在最下面——眼睛顺着刚发生的事往下读。
 */
const { notices, hold, resume, dismiss } = useNotifyState();

/**
 * 每条被 `resume` 过几次。只服务计时线的「重头开始」：换 key 让 `<i>` 重建，
 * 动画随之从 0 起跑——与 `resume` 重新给满三秒是同一件事。
 */
const runs = ref<Record<number, number>>({});

function onResume(id: number) {
    resume(id);
    runs.value = { ...runs.value, [id]: (runs.value[id] ?? 0) + 1 };
}
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
                    tabindex="0"
                    @mouseenter="hold(one.id)"
                    @mouseleave="onResume(one.id)"
                    @focusin="hold(one.id)"
                    @focusout="onResume(one.id)"
                    @click="dismiss(one.id)"
                    @keydown.enter.prevent="dismiss(one.id)"
                    @keydown.space.prevent="dismiss(one.id)"
                >
                    <!-- 空心的，不是一个色点：语气是「记号」，实心块会跟朱印抢同一种重量。 -->
                    <span class="dot" aria-hidden="true"></span>
                    <span class="text">{{ one.text }}</span>
                    <i :key="runs[one.id] ?? 0" class="drain" aria-hidden="true"></i>
                </div>
            </TransitionGroup>
        </div>
    </Teleport>
</template>

<style scoped>
/* 层本身不吃点击：它横跨页面顶部，若整层可点，会把下面的页头挡成一块死区。
 * 每道槽自己恢复 `pointer-events`——只为了悬停停表与点击收走。
 *
 * ---- 落在页头这一条上，不是页头下方（2026-11-04 用户：「显示在 header 上」）----
 * 页头右边本来就是一整条空区（标题在左、动作在右，中间没有东西），提示压在这儿不挡任何
 * 内容；落在页头下方则会盖住第一张卡的上半截，而那张卡往往正是「刚刚被改的那张」。
 *
 * 起点从标题栏算，不再加 `--page-head-h`：加它是「排到页头之后」，减到 5px 之内才是
 * 「压在页头上」。标题栏高（36 × 字号档）与页头高（≈ 45–48）都会随字号长，但 5px
 * 是一个不随字号变的余量——一行高 35 的槽落在这里，正好在页头这条 45 的带子里，
 * 下沿留 5px 不压那条账线。长长的错误折成两行时会往下长出去，那是对的：宁可它长出去，
 * 也不要为了「总在带子里」把字压小。 */
.notice-layer {
    position: fixed;
    top: calc(36px * var(--fs-scale) + 5px);
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
 * 亮色：面只压一档、且是暖压；深度全交给沿口（1px 硬边 → 5px 短影 → 下沿亮线 →
 * 外沿一线纸白）。亮暗材质统一在 `tokens.css` 的 `.notice`。
 *
 * `overflow: hidden` 是给槽底那条计时线的：它贴着底边跑，不裁就被圆角切出两个方头。
 * 焦点环画在 outline 上，不受影响。 */
.notice {
    --notice-tone: var(--ink-2);

    position: relative;
    display: flex;
    align-items: center;
    gap: 10px;
    max-width: 380px;
    /* 单条 35（原 42，2026-11-04 用户：「消息的高度稍微小一点」）。三处一起收：
     * 上 8 → 6、下 9 → 7（槽底 2px 计时线仍留得出余量）、行高 1.6 → 1.5。
     * 只收内边距不够——一行字的槽里，那 1.6 的半个行距本身就占掉 8px。 */
    padding: 6px 14px 7px 12px;
    color: var(--ink);
    font-size: var(--fs-base);
    line-height: 1.5;
    /* 长路径 / 长错误信息不许把槽撑出屏幕，折行就折行。 */
    overflow: hidden;
    overflow-wrap: anywhere;
    border-radius: var(--r-2);
    border: var(--w-hair) solid var(--notice-edge);
    background: var(--notice-background);
    box-shadow: var(--notice-shadow);
    cursor: default;
    user-select: none;
    pointer-events: auto;
}

/* 键盘停在这道槽上时的环。它可聚焦就必须看得见焦点——否则 Tab 一下屏幕毫无变化，
 * 用户不知道表已经停在哪一条上。环画在槽的外沿（`--ring-offset`），不压住圆印。 */
.notice:focus-visible {
    outline: var(--ring);
    outline-offset: var(--ring-offset);
}

/* 正文吃掉剩下的宽度：不 `min-width: 0` 的话，一句长错误会把槽撑到 `max-width` 之外
 * （flex 项默认 `min-width: auto` 按内容宽度算），`overflow-wrap` 也就没有发挥的余地。 */
.text {
    min-width: 0;
}

/* 语气圆印：15px 的环，内壁再描一圈同色 26%——一枚印该有的两道边，不是一块色块。 */
.dot {
    flex: none;
    width: 15px;
    height: 15px;
    border-radius: 50%;
    border: 2px solid var(--notice-tone);
    box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--notice-tone) 26%, transparent);
}

/* 三档只换颜色，不换结构、不换尺寸。多一套形态就等于多一个「这是哪一类消息」的
 * 判断成本，而这三类本来只是同一件事的三种语气。 */
.is-success {
    --notice-tone: var(--success);
}
.is-error {
    --notice-tone: var(--danger-ink);
}
.is-info {
    --notice-tone: var(--muted);
}

/* ---------- 计时线 ----------
 * 贴着槽底、3 秒从满到零——与 `use-notify.ts` 的 `DURATION` 是同一个数，改一处要改两处。
 * `forwards` 让它停在 0：定时器与动画若差半帧，宁可先走完，也不要「时间到了又跳回满格」。
 *
 * 悬停 / 聚焦暂停走 `:hover` / `:focus-visible`，与 `hold` 由同一批事件触发；移开时
 * `resume` 给满三秒、`runs` 换 key 让这一条重建，动画从 0 重放——两边因此始终同拍。 */
.drain {
    position: absolute;
    left: 0;
    bottom: 0;
    width: 100%;
    height: 2px;
    background: linear-gradient(
        90deg,
        var(--notice-tone),
        color-mix(in srgb, var(--notice-tone) 40%, transparent)
    );
    transform-origin: left center;
    animation: notice-drain 3s linear forwards;
}
.notice:hover .drain,
.notice:focus-visible .drain {
    animation-play-state: paused;
}
@keyframes notice-drain {
    from {
        transform: scaleX(1);
    }
    to {
        transform: scaleX(0);
    }
}
/* 降动效时不画这条线：全局那条把动画压到 1ms，它会瞬间走到头，只剩一根空槽——
 * 比没有更让人以为「是不是卡住了」。 */
@media (prefers-reduced-motion: reduce) {
    .drain {
        display: none;
    }
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
