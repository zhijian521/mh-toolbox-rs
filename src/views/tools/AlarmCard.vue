<script setup lang="ts">
import { computed } from 'vue';
import CostSwitch from '../../components/CostSwitch.vue';
import PaperCard from '../../components/PaperCard.vue';
import { minuteText } from '../../services/clock';
import { countdownText, nextReminder, repeatText, type AlarmLike } from './alarms';

/**
 * 一张闹钟卡。
 *
 * 照物价卡那四段：`时刻 + 开关` / 虚线 / `备注 + 状态` / `改 · 删`。虚线的意思与那边
 * 一样——「上半写的是哪个闹钟、下半写的是它现在怎么样」，不是装饰。
 *
 * ---- 时刻是这张卡的唯一主角 ----
 *
 * 一屏可能摆着六个闹钟，扫过去先要认出「哪个是 07:30」。所以字号提到 `--fs-xl`、
 * 用 `tabular-nums`（等宽数字）：`07:30` 与 `11:45` 在竖排里宽度一致，六张卡的时刻
 * 不会一行长一行短；而后面的备注与状态都降到次级墨，不与它抢。
 *
 * ---- 开关是站里那枚「两格位移开关」 ----
 *
 * 2026-11-09 换成 `CostSwitch`（开发页、捉鬼页、收益页用的同一枚）：一枚朱印在两格里
 * 滑过去，关的时候不是变灰而是**灭灯**。早先这里是 `SegmentedPills` 的两枚独立胶囊——
 * 材质虽然同源，读法却差一层：胶囊说「两个各自能按的键」，位移开关说「一个东西在两端」，
 * 而闹钟只有「开着 / 关掉」这一件事。全站能拨的地方都该是后者。
 *
 * 左关右开（`CostSwitch` 的固定顺序）。原先胶囊是左开右关，看着相反；统一到组件那一边，
 * 因为「往右拨是开」与捉鬼页、开发页同一个方向。
 *
 * ---- 卡片本身不可点 ----
 *
 * 与物价卡同一条：底行还有「改 / 删」，整卡可点就会出现「想点删除却开了编辑」。
 * 只有开关与底行两个动作是热区。
 */
const props = defineProps<{
    alarm: AlarmLike;
    /** 当前时刻。由页面每 30 秒刷新一次，倒计时才会走。 */
    now: Date;
}>();

const emit = defineEmits<{
    edit: [];
    remove: [];
    /* **不叫 `toggle`**：那是原生 DOM 事件名（`<details>` 开合、popover 都用它），
     * 父级写 `@toggle="..."` 时类型会推断成 `boolean | ToggleEvent`，模板那边当场报错。
     * 换个名字是最省的做法——不必为避开一个内置名去写断言。 */
    'toggle-enabled': [enabled: boolean];
}>();

const next = computed(() => nextReminder(props.alarm, props.now));

/**
 * 大字显示的「时刻」。`每小时` 只显示 `:30`——它的 `time` 里小时是占位的 `00`，
 * 原样印出来会读成「定在半夜十二点半」，与「每小时的第 30 分」完全相反。
 */
const timeText = computed(() =>
    props.alarm.repeat === 'hourly' ? `:${minuteText(props.alarm.time)}` : props.alarm.time,
);

/** 一分钟内要响的那一个：时刻转朱，扫一眼就能找到。 */
const soon = computed(() => {
    const at = next.value;
    return !!at && at.getTime() - props.now.getTime() <= 90_000;
});

const status = computed(() => {
    if (!props.alarm.enabled) return '已停用';
    const at = next.value;
    if (at) return countdownText(at, props.now) || '马上提醒';
    /* 走到这里只剩一种：`仅一次` 且那一天已经过去（`nextReminder` 返回 null）。
     * 另外三种重复永远有下一次——`每天` 明天还响、`每小时` 下一小时就响，
     * 所以不需要「今天已提醒」那样的第三句兜底。 */
    return '已过期';
});

const nameText = computed(() => props.alarm.label || '未命名闹钟');

/** 读屏念的一句：时刻、备注、重复、当前状态，最后是「按开关键停用」。 */
const cardLabel = computed(() => {
    const state = props.alarm.enabled ? status.value : '已停用';
    return `${props.alarm.time} ${nameText.value}，${repeatText(props.alarm)}，${state}`;
});
</script>

<template>
    <PaperCard
        as="article"
        class="alarm-card"
        :data-repeat="alarm.repeat"
        :class="{ off: !alarm.enabled, soon }"
    >
        <header class="alarm-head">
            <time class="alarm-time" :datetime="alarm.time">{{ timeText }}</time>
            <CostSwitch
                class="alarm-switch"
                :model-value="alarm.enabled"
                off-label="关"
                on-label="开"
                :label="`${cardLabel}；开或关`"
                @update:model-value="emit('toggle-enabled', $event)"
            />
        </header>

        <span class="alarm-rule" aria-hidden="true"></span>

        <p class="alarm-label" :title="nameText">{{ nameText }}</p>
        <p class="alarm-note">
            <span class="alarm-repeat">{{ repeatText(alarm) }}</span>
            <span class="alarm-status" :class="{ warn: soon }">{{ status }}</span>
        </p>

        <footer class="alarm-foot">
            <span class="alarm-acts">
                <button type="button" class="alarm-act" @click="emit('edit')">改</button>
                <button type="button" class="alarm-act" @click="emit('remove')">删</button>
            </span>
        </footer>
    </PaperCard>
</template>

<style scoped>
/* 卡高不写死：备注可能折两行、字号有 1.0 / 1.1 两档。给 `min-height` 让同一行由网格
 * 拉齐，内容多了自己长——写死 `height` 会在 1.1 档把底行挤出卡外，而纸的棱还停在原处。 */
.alarm-card {
    display: flex;
    flex-direction: column;
    gap: 6px;
    min-width: 0;
    min-height: 132px;
    padding: 10px 12px;
}

.alarm-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 6px;
}

/* 时刻：主角。`tabular-nums` 让六张卡的时刻竖排对齐，扫视时不会一行长一行短。 */
.alarm-time {
    color: var(--ink);
    font-size: var(--fs-xl);
    font-variant-numeric: tabular-nums;
    font-weight: 400;
    letter-spacing: 0.02em;
    line-height: 1.1;
    /* 停用的卡整个退到次级墨，见下面 `.off`。 */
    transition: color var(--t-quick) var(--ease-soft);
}
.alarm-card.soon .alarm-time {
    color: var(--accent);
}

/* 开关收窄：两枚单字格在 200 宽的卡上与时刻并排，留出的空隙只够 6px。
 * **只收格子的内距与字号**：槽、印、位移、灭灯全来自 `base.css` 的 `.cost-switch`，
 * 与捉鬼页「高概率区域」、开发页「开发者模式」是同一枚控件，不在卡里另写一套厚度。
 * 20px 的行盒（18 + 上下各 1）与原先那两枚胶囊等高，卡头不会因此长一截。 */
.alarm-switch {
    flex: none;
}
.alarm-switch :deep(.cost-opt) {
    padding: 1px 7px;
    font-size: var(--fs-xs);
    line-height: 18px;
}

/* 虚线：照物价卡那条，上半写名目、下半写读数。 */
.alarm-rule {
    display: block;
    height: 0;
    border-top: var(--w-hair) dashed color-mix(in srgb, var(--rule-2) 62%, transparent);
}

.alarm-label {
    margin: 0;
    color: var(--ink);
    font-size: var(--fs-base);
    line-height: 1.4;
    /* 备注最多 20 字，一行放不下就折；卡的高度由内容定，不在这里裁。 */
    overflow-wrap: anywhere;
}

.alarm-note {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 6px;
    margin: 0;
    color: var(--muted);
    font-size: var(--fs-xs);
    line-height: 1.4;
}
.alarm-repeat {
    flex: none;
}
.alarm-status {
    min-width: 0;
    overflow: hidden;
    text-align: right;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-variant-numeric: tabular-nums;
}
.alarm-status.warn {
    color: var(--danger);
}

/* 底行：两个文字入口，与物价卡那三个小门同一档（9px 字、悬停才上朱）。 */
.alarm-foot {
    display: flex;
    justify-content: flex-end;
    margin-top: auto;
}
.alarm-acts {
    display: flex;
    gap: 10px;
}
.alarm-act {
    padding: 0;
    border: 0;
    background: none;
    color: var(--muted);
    font-family: inherit;
    font-size: var(--fs-mini);
    line-height: 1.6;
    cursor: pointer;
    transition: color var(--t-quick) var(--ease-soft);
}
.alarm-act:hover {
    color: var(--accent);
}
.alarm-act:focus-visible {
    outline: var(--ring);
    outline-offset: var(--ring-offset);
}

/* ---------- 按重复方式上色 ----------
 *
 * 一屏摆着六张卡，扫一眼先要分清「哪张是每天的、哪张只响一次」。时刻已经说了「几点」，
 * 但「多久响一次」只能读底下那行小字——给它换个底色，是让它在余光里也能被认出来。
 *
 * ---- 换的是 `--board-paper`，不是 `background` ----
 *
 * `.board` 的底色、135° 斜向渐变、左上偏光、卡缘的亮棱与断面**全都**由 `--board-paper`
 * 派生（`base.css` 里那几条 `color-mix()`）。所以在这里覆盖它，纸的质感一处不动，
 * 只是换了一张同材质、染了色的纸；写 `background` 简写会把渐变与偏光一并清掉，
 * 那件事只有角色卡该做（它自己重画了一遍 135° 渐变，见 `character-card.css`）。
 *
 * ---- 四档只差色相，不差浓度 ----
 *
 * 浓度一致（亮色 12%、暗色 16%），色相分别取库里已有的三枚墨：`--moss`（每小时的节奏）、
 * `--indigo-ink`（每周）、`--ochre`（仅一次）。**不新造色号**——这三个本来就是这套纸上的墨。
 *
 * `每天` 不给色：它是「常规」这一档，染上去反而会让剩下三张看起来才是特例。没有染色的
 * 那张纸就是它的标记。
 *
 * 暗色那一档要单独写，理由与角色卡的浅染一样：暗色的纸本身极深，同样的比例混出来
 * 几乎看不出（量过，12% 在 #231f16 上只剩「还是黑的」）。 */
.alarm-card[data-repeat='hourly'] {
    --board-paper: color-mix(in srgb, var(--moss) 12%, var(--paper-2));
}
.alarm-card[data-repeat='weekly'] {
    --board-paper: color-mix(in srgb, var(--indigo-ink) 12%, var(--paper-2));
}
.alarm-card[data-repeat='once'] {
    --board-paper: color-mix(in srgb, var(--ochre) 12%, var(--paper-2));
}
:global(html.dark) .alarm-card[data-repeat='hourly'] {
    --board-paper: color-mix(in srgb, var(--moss) 16%, var(--paper-2));
}
:global(html.dark) .alarm-card[data-repeat='weekly'] {
    --board-paper: color-mix(in srgb, var(--indigo-ink) 16%, var(--paper-2));
}
:global(html.dark) .alarm-card[data-repeat='once'] {
    --board-paper: color-mix(in srgb, var(--ochre) 16%, var(--paper-2));
}

/* 停用：整张卡退一档墨，但**不压暗纸面**——纸的棱与影仍与其他卡一致，
 * 否则它读成「一张不同的卡」，而事实是同一张卡现在不响。 */
.alarm-card.off .alarm-time,
.alarm-card.off .alarm-label {
    color: var(--ink-2);
}
</style>
