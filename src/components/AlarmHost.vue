<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue';
import AppIcon from './AppIcon.vue';
import PaperCard from './PaperCard.vue';
import { notify } from '../composables/use-notify';
import { notifySystem } from '../services/desktop';
import { dueAlarms, LEAD_MS } from '../views/tools/alarms';
import { useAlarms } from '../views/tools/alarm-store';

/**
 * 闹钟的计时与提醒。全站只有一个，挂在 `App.vue` 里，与 `NotifyHost` 并列。
 *
 * ---- 为什么计时必须在页面之外 ----
 *
 * 闹钟的全部意义是「不在这一页也会响」。挂在 `AlarmView` 上，用户切去收益页的那一分钟
 * 就正好没有计时器在跑——而那正是最常发生的情形。
 *
 * ---- 判定用「区间跨越」，不是「此刻等于」 ----
 *
 * 每 15 秒看一眼 `(上次, 现在]` 之间跨过了哪些提醒点。两种写法都不用：
 *   · `现在 == 08:29` 这种精确匹配，15 秒的间隔必然漏掉大部分；
 *   · 每秒醒一次能对上，但窗口最小化后 WebView 会把定时器节流到一分钟一次——
 *     恰恰是最需要它准的时候对不上。
 * 区间跨越对节流免疫：醒来一次就把整段补上，`fired` 挡住重复。
 *
 * ---- 迟到太久不再弹 ----
 *
 * 合盖一夜再打开，区间里躺着昨天那一个「每天 07:30」。补弹出来是一句谎话（已经过时了），
 * 所以只对**五分钟内**的补提醒；更早的照样记 `fired`，不弹。
 *
 * ---- 提醒有三层，最外面那层走系统 ----
 *
 * ① `notify` 的浮层：3 秒走完，全站可见；
 * ② 右下角这张小卡：留到响铃后一分钟；
 * ③ Windows 的 Toast：经 `services/desktop.ts` 的 `notifySystem()` 发出去。
 *
 * 前两层**只在应用窗口里**：窗口被别的前台程序盖住、或者最小化到任务栏时，它们照样在画，
 * 但人看不见——而那正是「设了闹钟却在做别的事」的常态。第三层是给这种情形准备的：
 * Toast 由系统画在屏幕右下角，与应用窗口谁在前面无关。
 *
 * 三层说的是同一件事，谁也挡不着谁；哪一层不可用（浏览器预览、系统不让发）就少一层，
 * 不报错——`notifySystem()` 失败只返回 false。
 */
const { alarms, markFired } = useAlarms();

/** 多久看一眼。不做精确到秒：判定靠区间，频率只影响「最晚多久发现」。 */
const TICK_MS = 15_000;

/** 迟到这个程度就不弹了（仍记 `fired`）。五分钟够覆盖一次短暂的挂起。 */
const GRACE_MS = 5 * 60_000;

interface Ring {
    id: number;
    /** 这一次实际响的时刻 `HH:mm`。`每小时` 的闹钟不能显示它的 `time`（那是占位的 `00:mm`）。 */
    time: string;
    label: string;
    /** 收起时刻：响铃后一分钟（提醒本身只提前一分钟，留到那时刚好）。 */
    until: number;
}

const rings = ref<Ring[]>([]);

/* 上一次检查的时刻。初值往前退 90 秒：应用刚打开时若正落在某个提醒点之后几十秒
 * （先关窗、再打开，很可能就是 8:29:20），这一次也该提醒。再早的不管——
 * 启动时不该先补一串昨天的闹钟。 */
let last = new Date(Date.now() - 90_000);
let timer: ReturnType<typeof setInterval> | undefined;

/**
 * 弹一条提醒。`time` 是**这一次**的响铃时刻，不是 `alarm.time`：
 * `每小时` 的闹钟 `alarm.time` 存的是 `00:30`（小时是占位），念出来会让人以为定在半夜。
 */
function ring(hit: { alarm: { id: number; label: string }; key: string; remindAt: Date }) {
    const name = hit.alarm.label || '闹钟';
    /* 键是 `<日期> <时刻>`，后 5 位就是这次的 `HH:mm`。 */
    const time = hit.key.slice(-5);
    notify.info(`${name} ${time} 还有一分钟`);
    /* 系统那一条不等它：`notifySystem` 写盘/跨进程要几毫秒，而 `tick()` 是同步循环，
     * 等它就等于把同一批的其它闹钟一起压后。失败了也只是少一层。 */
    void notifySystem(`${name} ${time}`, '还有一分钟');
    rings.value = [
        ...rings.value.filter((one) => one.id !== hit.alarm.id),
        {
            id: hit.alarm.id,
            time,
            label: hit.alarm.label,
            until: hit.remindAt.getTime() + LEAD_MS + LEAD_MS,
        },
    ];
}

function tick() {
    const now = new Date();
    const hits = dueAlarms(alarms.value, last, now);
    last = now;

    for (const hit of hits) {
        /* 先记「这一次发过了」。写盘失败也已在内存里生效，这一次不会再弹。 */
        markFired(hit.alarm.id, hit.key);
        if (now.getTime() - hit.remindAt.getTime() > GRACE_MS) continue;
        ring(hit);
    }

    /* 收起到时的提醒。放到响铃后一分钟才收，是因为「提前一分钟」这句提醒在整一分钟里都
     * 还成立；到点就收会让它只出现几秒。 */
    if (rings.value.length) {
        const time = now.getTime();
        const alive = rings.value.filter((one) => one.until > time);
        if (alive.length !== rings.value.length) rings.value = alive;
    }
}

function dismiss(id: number) {
    rings.value = rings.value.filter((one) => one.id !== id);
}

/* 窗口回来时立刻对一次：后台页面被节流，回来那一刻可能已经欠了好几段。 */
function onVisible() {
    if (document.visibilityState === 'visible') tick();
}

onMounted(() => {
    tick();
    timer = setInterval(tick, TICK_MS);
    window.addEventListener('focus', tick);
    document.addEventListener('visibilitychange', onVisible);
});

onBeforeUnmount(() => {
    if (timer) clearInterval(timer);
    window.removeEventListener('focus', tick);
    document.removeEventListener('visibilitychange', onVisible);
});
</script>

<template>
    <!-- 只在有提醒时出现。`role="status"` 不设：`NotifyHost` 那一层已经是 `aria-live`，
         两层同时播报会念两遍。这里只是「留在屏幕上的那一条」，读屏由浮层负责。 -->
    <Teleport to="body">
        <Transition name="ring">
            <div v-if="rings.length" class="ring-layer">
                <PaperCard as="article" class="ring-card">
                    <header class="ring-head">
                        <AppIcon name="alarm" class="ring-icon" />
                        <span class="ring-title">即将提醒</span>
                    </header>
                    <ul class="ring-list">
                        <li v-for="one in rings" :key="one.id" class="ring-row">
                            <span class="ring-time">{{ one.time }}</span>
                            <span class="ring-label">{{ one.label || '闹钟' }}</span>
                            <button
                                type="button"
                                class="ring-close"
                                :aria-label="`收起 ${one.time} 的提醒`"
                                @click="dismiss(one.id)"
                            >
                                <AppIcon name="close" />
                            </button>
                        </li>
                    </ul>
                    <p class="ring-note">还有一分钟</p>
                </PaperCard>
            </div>
        </Transition>
    </Teleport>
</template>

<style scoped>
/* 右下角：左下是左栏、右下这块是内容区的空白角，卡片压在这里不挡任何表格与按钮。
 * `z-index: 88` 夹在中间——低于提示浮层（90，那句话说的是「刚刚那下成了没有」），
 * 高于弹窗遮罩（80），但弹窗打开时也不会盖住操作（它在角落，遮罩本来就压暗了它）。
 * 真要强调时浮层已经在上面说过一遍了。 */
.ring-layer {
    position: fixed;
    right: 18px;
    bottom: 18px;
    z-index: 88;
}

.ring-card {
    display: flex;
    flex-direction: column;
    gap: 6px;
    width: calc(248px * var(--fs-scale));
    padding: 10px 12px;
}

.ring-head {
    display: flex;
    align-items: center;
    gap: 6px;
    color: var(--accent);
    font-size: var(--fs-sm);
}
.ring-icon {
    --icon-size: calc(14px * var(--fs-scale));

    flex: none;
}

.ring-list {
    display: flex;
    flex-direction: column;
    gap: 4px;
    margin: 0;
    padding: 0;
    list-style: none;
}

.ring-row {
    display: flex;
    align-items: center;
    gap: 8px;
}
.ring-time {
    color: var(--ink);
    font-size: var(--fs-md);
    font-variant-numeric: tabular-nums;
}
.ring-label {
    flex: 1;
    min-width: 0;
    color: var(--ink-2);
    font-size: var(--fs-xs);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

/* 收起：一枚 20 见方的空心按钮，不做成印块——这是「知道了」，不是这一页的动作。 */
.ring-close {
    display: grid;
    place-items: center;
    flex: none;
    width: calc(20px * var(--fs-scale));
    height: calc(20px * var(--fs-scale));
    padding: 0;
    border: 0;
    border-radius: var(--r-1);
    background: none;
    color: var(--muted);
    cursor: pointer;
    --icon-size: calc(12px * var(--fs-scale));

    transition: color var(--t-quick) var(--ease-soft);
}
.ring-close:hover {
    color: var(--accent);
}
.ring-close:focus-visible {
    outline: var(--ring);
    outline-offset: var(--ring-offset);
}

.ring-note {
    margin: 0;
    color: var(--muted);
    font-size: var(--fs-mini);
}

/* 进场从下方 8px 浮上来。只动 opacity 与 transform，不动高度——动高度会让页面
 * 跟着重排一次。`prefers-reduced-motion` 由 `base.css` 的全局降级兜住。 */
.ring-enter-active,
.ring-leave-active {
    transition:
        opacity var(--t-mid) var(--ease-soft),
        transform var(--t-mid) var(--ease-soft);
}
.ring-enter-from,
.ring-leave-to {
    opacity: 0;
    transform: translateY(8px);
}
</style>
