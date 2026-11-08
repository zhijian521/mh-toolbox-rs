<script setup lang="ts">
import { computed } from 'vue';
import PressTile from '../../components/PressTile.vue';
import { repeatText, timesText, weekdayName, type Activity } from './activities';

/**
 * 活动卡：一张纸片，说清「这件事什么时候来」。
 *
 * 四段，与原型一致：名称 / 时刻 / 规则 / 右上角那枚签。签回答的是「最近一次是哪天」，
 * 所以它随分组变——今天那组写「今天」，之后那组写「11/15 周日」。
 *
 * 整张卡是 `<button>`：点它加提醒。用按钮而不是给 div 挂 click，是因为键盘要能
 * Tab 到、回车能开——这张页上除了卡片没有第二个可点的东西，一个都不能少。
 * 按钮里只放 `<span>`（`display: block` 撑开）：`<button>` 的内容模型是 phrasing
 * content，塞 `<div>` 是无效结构，读屏也会把内部当成独立的段。
 *
 * ---- 材质是 `PressTile`，与物价卡同一套 ----
 *
 * 原先这张卡自己拼了四层影 + 微斜，做「贴在墙上的便签」。用户否了：那套斜着的纸片
 * 读起来不像这套设计里的东西。现在换成全站那一块**压印的纸**——物价卡的
 * `PressTile`：左上角一点偏光、上左 1px 亮线、下 2px 右 1px 暗线、3px 硬影 + 8px 软影。
 * 棱与影一份都不在这里重写，只给块面染色（`--tile-face`）。
 */
const props = withDefaults(
    defineProps<{
        activity: Activity;
        /** 最近一次发生的日期；`null` = 本月等不到了。 */
        next: Date | null;
        /** 今天，用来判「今天」这枚签。 */
        now: Date;
        /** 已经加过提醒（不分时段）。 */
        reminded?: boolean;
    }>(),
    { reminded: false },
);

const emit = defineEmits<{ open: [] }>();

const isToday = computed(() => {
    const next = props.next;
    if (!next) return false;
    return (
        next.getFullYear() === props.now.getFullYear() &&
        next.getMonth() === props.now.getMonth() &&
        next.getDate() === props.now.getDate()
    );
});

/** 每天那一批。它们的「最近一次」永远是今天，所以签不能写日期。 */
const isDaily = computed(() => {
    const type = props.activity.rule.type;
    return type === 'daily' || type === 'hourly';
});

const tagText = computed(() => {
    if (props.reminded) return '已提醒';
    /* 每天的活动不写「今天」：它每天都是今天，写出来等于没说，还容易被读成
     * 「只有今天有」。写「每天」，与所在的那一组同一个词。 */
    if (isDaily.value) return '每天';
    if (isToday.value) return '今天';

    const next = props.next;
    if (!next) return '本月已过';
    return `${next.getMonth() + 1}/${next.getDate()} ${weekdayName(next.getDay())}`;
});

/* 规则那一行：频率 + 补充 + 来源。中间用「·」连，和卡片其它地方同一个说话方式。
 * 「据玩家整理」必须留在卡上——那几条官网没写，写着它，用户自己会去核。 */
const metaText = computed(() =>
    [
        repeatText(props.activity),
        props.activity.note,
        props.activity.playerSourced ? '据玩家整理' : '',
    ]
        .filter(Boolean)
        .join(' · '),
);

/**
 * 读给辅助技术的名字。
 *
 * `<button>` 一旦给了 `aria-label`，ARIA 的 name-from-content 就被顶掉——卡里的名称、
 * 时刻、规则不再单独暴露，所以三者必须拼进这一句。
 *
 * **「已加提醒」也得拼进来**：右下那枚朱印是 `aria-hidden`（它是装饰），
 * 不写这句，读屏用户就完全听不到「这张已经加过了」。
 */
const cardLabel = computed(() =>
    [
        props.activity.name,
        timesText(props.activity),
        metaText.value,
        props.reminded ? '已加提醒' : '',
        '点开加提醒',
    ]
        .filter(Boolean)
        .join('，'),
);
</script>

<template>
    <button
        type="button"
        class="card"
        :class="[`t-${activity.tone}`, { reminded }]"
        :aria-label="cardLabel"
        @click="emit('open')"
    >
        <!-- 压印块只当**背景层**，与物价卡同一个摆法：它是材质，不认识内容。
             内容塞进它的默认插槽会被 `place-items: center` 按住，从父级用 `:deep`
             覆盖已验证压不住（物价卡那段注释里记着）。 -->
        <PressTile wide class="card-surface" aria-hidden="true" />

        <span class="card-body">
            <span class="tag" :class="{ hot: (isToday && !isDaily) || reminded }">{{
                tagText
            }}</span>
            <span class="name">{{ activity.name }}</span>
            <span class="when">{{ timesText(activity) }}</span>
            <span class="rule">{{ metaText }}</span>
            <!-- 右下角这枚印：没加过是「＋」，加过是朱底白勾。它是「这张卡能点」的唯一提示，
                 所以常驻，不做悬停才出现——触屏上没有悬停。 -->
            <span class="mark" :class="{ on: reminded }" aria-hidden="true">
                {{ reminded ? '✓' : '＋' }}
            </span>
        </span>
    </button>
</template>

<style scoped>
/* 卡片本体只当定位容器：材质在 `PressTile` 那一层，内容在它上面。
 * 与物价卡同一个分工——那块凸起纸的棱、偏光、落地影全由它给。 */
.card {
    position: relative;
    display: flex;
    /* 同一行等宽等高：网格只保证宽度，高度得自己撑满单元格。 */
    height: 100%;
    /* 类别色掺进纸里的比例，三档：
     *   `--wash`    常态。7% 是「一眼看出这几张是一类，但还是纸」，再浓就成便利贴了。
     *   `--wash-hi` 指上去。**比常态更接近纸色就是更亮**——全站的悬停都是提亮
     *               （块面从半透明变实色），没有一处是「指上去变深」，那是按下。
     *   `--wash-lo` 按下。更浓、再转向凹槽色，读作被压回纸里。 */
    --wash: 7%;
    --wash-hi: 4%;
    --wash-lo: 12%;
    /* 圆角只在这里声明一次：它继承给 `card-surface`（`PressTile` 读 `--tile-r`），
     * 焦点环也读同一个值。两处各写一个数迟早会对不上。曲率不乘 `--fs-scale`——
     * 字放大时圆角跟着变大会读成另一种控件。 */
    --tile-r: 9px;
    padding: 0;
    border: 0;
    background: none;
    color: var(--ink-2);
    font-family: inherit;
    text-align: left;
    cursor: pointer;
}

/* 块面按类别淡染。**棱与影一条都不写**：那是 `PressTile` 的配方，
 * 它自己调过三层光与四条不对称棱，另抄一份必然走样（物价卡那段注释记着走样的后果）。
 *
 * 三个块面必须一起给。`PressTile` 的默认悬停色是「纸色变实」、按下色是「转向凹槽的灰」——
 * 对一个染过色的块，指上去会闪成一张白纸、按下去闪成一块灰，那是按纸调的默认值。 */
.card-surface {
    position: absolute;
    inset: 0;
    /* 尺寸走变量而**不直接写 width / height**：`PressTile` 内部写着
     * `width: var(--tile-w, auto)`，与本类落在同一元素上、两边特异性一样，
     * 直接写就是「谁先注入谁赢」。变量没有这种竞争。 */
    --tile-w: 100%;
    --tile-h: 100%;
    /* 落地影收一档：它的 8px 软影是按 56px 图标格调的，摊在 240 宽的卡上会散得太开。 */
    --tile-drop: 0.9;
    --tile-face: color-mix(in srgb, var(--tone) var(--wash), var(--paper));
    --tile-face-hover: color-mix(in srgb, var(--tone) var(--wash-hi), var(--paper));
    --tile-face-active: color-mix(in srgb, var(--tone) var(--wash-lo), var(--well));
}

/* 暗色下三个数都要重给。纸本身是 #1c1912，7% 掺进去几乎读不出色相，暗色要提一档——
 * 与角色卡的门派浅染、闹钟卡的分类底同一个理由。
 *
 * 方向在这里**反了**：暗色的类别色是亮色（moss 是 #86ab86），所以「掺得更多」等于
 * 「更亮」。悬停提亮就该加大比例，而亮色那边是减小。同一个语义，两个方向。 */
:root.dark .card {
    --wash: 12%;
    --wash-hi: 18%;
    --wash-lo: 9%;
}

/* 内容层：块面之上。按下时跟着块一起沉 2px——`PressTile` 按下会把块压下去，
 * 内容留在原地就成了「块缩了一下而字没动」，那是两件事。 */
.card-body {
    position: relative;
    z-index: 1;
    display: flex;
    flex: 1 1 auto;
    flex-direction: column;
    align-items: flex-start;
    /* 内距比 `.board` 那 20 收窄：这一页一屏要摆十几张。
     * 左边 13 而不是 12：凸起块的左棱占 1px，字贴着棱会像顶着一条线。 */
    min-height: calc(96px * var(--fs-scale));
    padding: 9px 12px 10px 13px;
    /* **不接指针**：命中测试落到下面那层块面上，`PressTile` 的悬停（块面变实）
     * 与按下（内凹 + 沉 2px）才真的会发生。内容层若接指针，块面永远在它下面、
     * 永远指不到——那两个状态写了等于没写。
     * 点击不受影响：块面是 `<button>` 的后代，事件照样冒泡上去。 */
    pointer-events: none;
    transition: transform var(--t-quick) var(--ease-soft);
}

/* 按下时内容跟着块一起沉这 2px。`PressTile` 把自己的块压下去，内容留在原地
 * 就成了「块缩了一下而字没动」——两件事在同一个瞬间，必须同一个位移。 */
.card:active .card-body {
    transform: translateY(2px);
}

/* 指针上去：名字转朱——「这里能点」。块面自己会亮（`PressTile` 的悬停态），
 * 不复述它，也不写字位移动画：桌面上一格格排好的东西弹跳会破坏秩序。 */
.card:hover .name {
    color: var(--cinnabar);
}

.card:focus-visible {
    outline: var(--ring);
    outline-offset: var(--ring-offset);
    border-radius: var(--tile-r);
}

/* 四类运动的颜色。取的都是库里现成的墨色，不新造。 */
.t-daily {
    --tone: var(--moss);
}
.t-week {
    --tone: var(--ochre);
}
.t-war {
    --tone: var(--indigo-ink);
}
.t-month {
    --tone: var(--cinnabar);
    /* 红是这套墨里最「重」的一色：同一个百分比，红在米黄纸上跑得比绿蓝远一档，
     * 7% 就会读成粉色，把整排冲淡。 */
    --wash: 5%;
    --wash-hi: 2.5%;
    --wash-lo: 9%;
}

:root.dark .card.t-month {
    --wash: 9%;
    --wash-hi: 14%;
    --wash-lo: 6%;
}

/* 签贴右上角。`right` 只留 11：底下那枚「＋」在**右下**，两者不在同一条横线上，
 * 不必为了避它把签推到 30（推过去之后签离卡边有一大截空）。 */
.tag {
    position: absolute;
    right: 11px;
    top: 9px;
    padding: 1px 6px;
    border: 1px solid var(--rule-2);
    border-radius: 2px;
    color: var(--muted);
    font-size: var(--fs-mini);
    letter-spacing: 0.04em;
    line-height: 1.5;
    white-space: nowrap;
}

/* 今天 / 已提醒：这枚签换朱。朱是全站的状态色，这里正是「就是今天」。 */
.tag.hot {
    border-color: color-mix(in srgb, var(--cinnabar) 45%, transparent);
    color: var(--cinnabar);
}

.name {
    display: block;
    /* 给右上那枚签让位：名字比 4 个字长时会顶到它下面。签最宽是「11/15 周日」，
     * 约 62px 加 11 的边距，留 76 才够。 */
    padding-right: 76px;
    color: var(--ink);
    font-size: var(--fs-md);
    letter-spacing: 0.03em;
    line-height: 1.35;
}

.when {
    display: block;
    margin-top: 3px;
    color: var(--tone);
    font-size: var(--fs-sm);
    font-variant-numeric: tabular-nums;
}

.rule {
    display: block;
    margin-top: 2px;
    padding-right: 22px;
    color: var(--muted);
    font-size: var(--fs-mini);
    line-height: 1.45;
}

.mark {
    position: absolute;
    right: 9px;
    bottom: 9px;
    width: 19px;
    height: 19px;
    display: grid;
    place-items: center;
    border: 1px solid var(--rule-2);
    border-radius: 50%;
    color: var(--muted);
    font-size: var(--fs-mini);
    line-height: 1;
}

/* 已加提醒：一块朱印。它是**状态**，不是可点的入口——所以灌满朱，与 `.seal` 同一条。 */
.mark.on {
    border-color: var(--seal-edge);
    background: var(--seal);
    color: var(--on-seal);
}
</style>
