<script setup lang="ts">
import { computed, ref } from 'vue';
import AppIcon from '../../components/AppIcon.vue';
import type { IconName } from '../../components/icons';
import CostSwitch from '../../components/CostSwitch.vue';
import DateField from '../../components/DateField.vue';
import FontSizeSlider from '../../components/FontSizeSlider.vue';
import LedgerSection from '../../components/LedgerSection.vue';
import MeterBar from '../../components/MeterBar.vue';
import NumTag from '../../components/NumTag.vue';
import NumberField from '../../components/NumberField.vue';
import PressButton from '../../components/PressButton.vue';
import PriceField from '../../components/PriceField.vue';
import PressTile from '../../components/PressTile.vue';
import SegmentedPills from '../../components/SegmentedPills.vue';
import SelectField from '../../components/SelectField.vue';
import SlotButton from '../../components/SlotButton.vue';
import StatStrip, { type StatItem } from '../../components/StatStrip.vue';
import SteppedSlider from '../../components/SteppedSlider.vue';
import TogglePills from '../../components/TogglePills.vue';
import { useFontScale } from '../../composables/use-font-scale';
import { notify } from '../../composables/use-notify';
import { THEME_OPTIONS, useTheme } from '../../composables/use-theme';
import { todayText } from '../../services/format';

/**
 * 原子组件：抽出来复用的十五件（十五条 `kit-cell`，一条里可能并排两个同族件——
 * 比如 `Field` / `NumberField`、`PressTile` / `PressButton`）。
 *
 * 加一件要动两处，且**必须一起动**：`KIT_GROUPS` 那一组的 `items` 里加一项
 * （组名后面那个件数从它算），模板里加一个 `v-if` 块（示例）。`v-if` 写的是**组 id**
 * （`'read'`），不是件 id——同一组的几块共用同一个条件，别给单件另起一个：
 * 那样切到该组只剩那一件，其余几件全被条件挡掉。
 * 篇首的件数不用管——`hint` 从 `KIT_COUNT` 算，原先写死的「九件」「十三件」都成了假信息。
 * 组内的**行序**也要与 `KIT_GROUPS` 里名字的顺序一致：两边不同时，读者按目录上的顺序
 * 在右栏找不到对应的一块，查一件要先扫两遍。
 * 组合件不进这张卡（它由原子拼成、还带业务语义）——`SlipRowSection` 是一例。
 * 旧稿里还有一张《师门技能行》，随那一行重做而撤掉（2026-11-04），不要照着补回来。
 *
 * 这张卡不是演示页，是**验收面**——新控件先进这里，再进业务页面。
 * 它和「外观」共用同一份状态（单例 composable），所以在上面切主题、拖字号，
 * 这里会立刻跟着变；这也顺带验证了单例确实生效。
 *
 * **左目录 + 右整组**（2026-11-05）：十五件铺成网格时这张卡有两千多像素，
 * 从上往下找一件要滚三屏。改成「左边五组、右边只画当前这一组」之后，
 * 卡的篇幅与总件数脱钩——加第十六件只让一个数变大，不再多一格。
 *
 * **高度写死、两栏各滚**（2026-11-06，用户提的）：只在卡片上封顶时，不同的组把卡撑得
 * 高矮不一，下面的卡跟着上下跳；写死之后切组纹丝不动。于是「万一比卡还长」这条退路
 * 交给两栏各自滚，谁也不会把谁带走。
 * 左栏其实滚不起来（五行 190，字号 1.1 时 209），设上是为了以后组变多时不出横条。
 *
 * 按**组**切而不是按件切：一组通常两三行，同族的差一眼能比完（分段胶囊与多选胶囊
 * 差在语义、槽按钮与压印块差在一凹一凸）。一件一屏时右栏只剩一行控件，
 * 剩下四百多像素全是空纸——空纸读起来不是「留白」，是「没做完」。
 *
 * 只动这一张卡，不动整页：入口、开发者模式、色板、字号、图标都还是一叠 `.board`，
 * 这张卡内部的分栏是它自己的事。全页改左右布局会让「一叠卡」的读法断掉。
 */
const { mode } = useTheme();
const { scale } = useFontScale();

/**
 * 目录：五组，一组一条。组名按**手上那个动作**分，不按组件的技术分类：
 * 选一个值、填一个值、按一下、读一个数、说一句话。技术分类（控件 / 容器 / 反馈）
 * 对写界面的人没有帮助——他要找的是「能让我选一个的那个东西」。
 *
 * `items` 现在是**登记册**：件数从它算（组名后面那个数），成员名不再画进目录
 * （2026-11-06 去掉，那行小字让五行参差、又把「切哪一组」淹掉）。右侧的顺序由模板里
 * 那几块 `v-if` 决定，与本表无关。
 */
const KIT_GROUPS: {
    id: string;
    name: string;
    icon: IconName;
    items: [id: string, name: string][];
}[] = [
    {
        id: 'choose',
        name: '选择',
        icon: 'check',
        items: [
            ['segmented', '分段胶囊'],
            ['toggle', '多选胶囊'],
            ['switch', '两格开关'],
            ['fontsize', '三档滑块'],
            ['stepped', '多档滑块'],
            ['select', '下拉'],
        ],
    },
    {
        id: 'input',
        name: '输入',
        icon: 'edit',
        items: [
            ['field', '输入格'],
            ['price', '价格格'],
            ['date', '日期'],
        ],
    },
    {
        id: 'action',
        name: '操作',
        icon: 'play',
        items: [
            ['slot', '槽按钮'],
            ['press', '压印块与按钮'],
        ],
    },
    {
        id: 'read',
        name: '读数',
        icon: 'growth',
        items: [
            ['numtag', '数值签'],
            ['meter', '进度条'],
            ['stat', '统计条'],
        ],
    },
    {
        id: 'tip',
        name: '提示',
        icon: 'info',
        items: [['notify', '消息提示']],
    },
];

/** 目录行：图标 + 组名 + 件数。成员名与组号都不再画（2026-11-06），
 * 前者让五行参差，后者只是「目录的目录」——五组一眼数得完，主侧栏也没有编号。 */
const KIT_NAV = KIT_GROUPS.map((group) => ({
    id: group.id,
    name: group.name,
    icon: group.icon,
    count: group.items.length,
}));

const KIT_COUNT = KIT_GROUPS.reduce((n, group) => n + group.items.length, 0);

const current = ref(KIT_NAV[0].id);
/**
 * 朱印的落点。与 `VerticalSlider` 同一套：位移写在 `style` 上而不是注入 `--i`，
 * 因为 `translateY` 是**唯一**需要序号的属性，多一个自定义属性只会多一层
 * 「类型上不认、运行时才对」的隐患。
 *
 * 印是独立一层、不是每一格自己的底色。这样一来「选中的是这一格」只有一处真源
 * （印在哪），格本身永远透明——也不会再撞上 scoped 特异性压掉全局 `.stamp` 的坑。
 */
const thumbStyle = computed(() => {
    const i = KIT_NAV.findIndex((group) => group.id === current.value);
    return {
        transform: `translateY(calc(${Math.max(i, 0)} * (var(--nav-cell) + var(--nav-gap))))`,
    };
});
/** 目录容器本身：键盘换组之后要把焦点挪到新的那一项上，否则焦点留在已隐藏的那组。 */
const navEl = ref<HTMLElement | null>(null);

function pick(id: string) {
    current.value = id;
}

/** 上一组 / 下一组，到头绕回。上下键是「顺着过一遍」，目录则是「直接跳」。 */
function step(delta: number) {
    const n = KIT_NAV.length;
    const i = KIT_NAV.findIndex((group) => group.id === current.value);
    current.value = KIT_NAV[(i + delta + n) % n].id;
}

/**
 * 目录整组只占一个 Tab 停靠点（当前项 `tabindex=0`，其余 `-1`），上下键在组间连贯。
 *
 * 不给焦点写样式：全局 `:focus-visible` 那一圈 `--ring` 就是这套界面里「焦点在这」
 * 的唯一说法，目录项自己再造一种（左边缘竖条、底色描边）会与它重复。
 */
function onNavKey(event: KeyboardEvent) {
    const { key } = event;
    if (key !== 'ArrowDown' && key !== 'ArrowUp' && key !== 'Home' && key !== 'End') return;

    event.preventDefault();
    if (key === 'Home') current.value = KIT_NAV[0].id;
    else if (key === 'End') current.value = KIT_NAV[KIT_NAV.length - 1].id;
    else step(key === 'ArrowDown' ? 1 : -1);

    /* 按钮一直都在 DOM 里（只是 `tabindex` 跟着当前项翻），所以换组之后可以直接聚焦。 */
    navEl.value?.querySelector<HTMLElement>(`[data-id="${current.value}"]`)?.focus();
}

/** 两格开关的演示状态。它是二选一，没有第三态，所以用两个 ref 而不是数组。 */
const recorded = ref(true);
const autoSave = ref(false);

/** 输入格的演示值：给个真数字，才看得出「等宽数字」与「0 显示为空」两件事。 */
const demoLevel = ref(130);
/** 价格格的演示值：存的是**游戏币原值**，显示时才折成 320 万 / 860 万。 */
const demoPrice = ref<number | null>(3200000);
const demoPriceMd = ref<number | null>(8600000);

/** 多档滑块的演示：三档够看出「等分 + 落格」，页签条那行验证加高后的点击区。 */
const DEMO_PANES: { value: 'attrs' | 'skills' | 'assist'; label: string }[] = [
    { value: 'attrs', label: '属性' },
    { value: 'skills', label: '师门' },
    { value: 'assist', label: '辅助' },
];
const demoPane = ref<'attrs' | 'skills' | 'assist'>('attrs');

/** 下拉的演示：选项要够多（能滚）也要有长短差（能看出省略号）。 */
const DEMO_SCHOOLS = ['未选', '大唐官府', '方寸山', '化生寺', '阴曹地府', '五庄观', '东海渊'].map(
    (name) => ({ value: name === '未选' ? '' : name, label: name }),
);
const demoSchool = ref('五庄观');

/** 日期格的演示值取今天：才看得出「今天那枚朱点」与「选中的朱面」是两件事。 */
const demoDate = ref(todayText());

/** 统计条的演示：四格各给一种真实会出现的形态——有数、没有（`—`）、负数转朱、笔数。 */
const DEMO_STATS: StatItem[] = [
    { cap: '收入', value: '462.5 万', sub: '31 笔 · 均 14.9 万', delta: '+12.4%' },
    { cap: '支出', value: '−12.3 万', tone: 'loss', sub: '6 笔 · 占收入 2.7%', delta: '+3.1%' },
    { cap: '净额', value: '450.2 万', sub: '结余率 97.3%', delta: '+13.2%' },
    { cap: '笔数', value: '37', sub: '4 个号 · 2 条未指定', delta: '+6 笔' },
];

/** 多选胶囊：初值给一项，才好看出「按下的那几枚是朱的」与「其余仍是空槽」。 */
const DEMO_TOGGLES = [
    { value: 'task', label: '任务' },
    { value: 'school', label: '师门' },
    { value: 'guild', label: '帮派' },
];
const demoToggles = ref<string[]>(['task']);
</script>

<template>
    <LedgerSection
        title="原子组件"
        :hint="`抽出来复用的 ${KIT_COUNT} 件，业务页直接拿去用`"
        height="60vh"
    >
        <div class="atoms-split">
            <!-- 目录只列「图标 + 组名 + 件数」，成员名不再铺在下面（2026-11-06 去掉）：
                 那行小字让五行的高度各不相同（「选择」六个名字会折成两行、「提示」只有
                 一个），目录因此参差；而它们要回答的问题——「这组里有什么」——切过去就
                 看见了，写两遍反而把「切哪一组」这件正事淹掉。
                 英文名（`SegmentedPills`）也在这里装不下，截断后每条读成两截；
                 全名留在右栏标题里，认得的凭它找，认不得的凭样子找。

                 排法照主侧栏（`AppRail` 的 `VerticalSlider`），只把格内从「竖排两字」
                 改成横排：图标在左、组名在中、件数靠右。槽与印都走全局那两套
                 （`.well upright` / `.stamp`），深度只能由 `base.css` 那一处说了算。 -->
            <nav
                ref="navEl"
                class="atoms-nav well upright"
                aria-label="原子组件分组"
                @keydown="onNavKey"
            >
                <!-- 朱印是一层独立的拇指（照主侧栏 `AppRail` / `VerticalSlider` 的做法），
                     不是每格自己的底色：格永远透明，悬停也只是一层淡纸。
                     这样「当前是哪一组」只有一处真源——印在哪。 -->
                <span class="nav-thumb stamp" aria-hidden="true" :style="thumbStyle" />
                <button
                    v-for="group in KIT_NAV"
                    :key="group.id"
                    type="button"
                    class="nav-item"
                    :class="{ on: current === group.id }"
                    :data-id="group.id"
                    :aria-current="current === group.id ? 'true' : undefined"
                    :tabindex="current === group.id ? 0 : -1"
                    @click="pick(group.id)"
                >
                    <AppIcon :name="group.icon" />
                    <span class="nav-name">{{ group.name }}</span>
                    <!-- 件数靠右（`margin-left: auto`）：这一栏里没有账线撑开它了。 -->
                    <span class="nav-count">{{ group.count }}</span>
                </button>
            </nav>

            <div class="kit">
                <div v-if="current === 'choose'" class="kit-cell">
                    <span class="col-head">
                        <span class="kit-name">分段胶囊</span>
                        <span class="kit-en">SegmentedPills</span>
                    </span>
                    <div class="kit-row">
                        <SegmentedPills v-model="mode" :options="THEME_OPTIONS" label="主题" />
                    </div>
                    <p class="note">
                        整组一个 Tab 停靠点；单格质感走全局 <code>.bevel-pill</code>。
                    </p>
                </div>

                <div v-if="current === 'choose'" class="kit-cell">
                    <span class="col-head">
                        <span class="kit-name">多选胶囊</span>
                        <span class="kit-en">TogglePills</span>
                    </span>
                    <div class="kit-row">
                        <TogglePills
                            v-model="demoToggles"
                            :options="DEMO_TOGGLES"
                            label="演示：多选"
                        />
                    </div>
                    <p class="note">
                        与分段胶囊同一套材质，语义是一组<b>开关</b>：左右键只移焦点、空格切换，
                        按下第二枚不会弹起第一枚。
                    </p>
                </div>

                <div v-if="current === 'choose'" class="kit-cell">
                    <span class="col-head">
                        <span class="kit-name">两格开关</span>
                        <span class="kit-en">CostSwitch</span>
                    </span>
                    <div class="kit-row kit-row-sw">
                        <CostSwitch v-model="recorded" off-label="否" on-label="是" />
                        <CostSwitch v-model="autoSave" off-label="手动" on-label="自动" />
                    </div>
                    <p class="note">
                        文案走 <code>off-label</code> /
                        <code>on-label</code>；关闭是灭灯，不是变灰。
                    </p>
                </div>
                <div v-if="current === 'choose'" class="kit-cell">
                    <span class="col-head">
                        <span class="kit-name">三档滑块</span>
                        <span class="kit-en">FontSizeSlider</span>
                    </span>
                    <div class="kit-row">
                        <FontSizeSlider v-model="scale" />
                    </div>
                    <p class="note">三档，不是连续值；240ms 回弹落格。</p>
                </div>

                <div v-if="current === 'choose'" class="kit-cell">
                    <span class="col-head">
                        <span class="kit-name">多档滑块 / 页签条</span>
                        <span class="kit-en">SteppedSlider</span>
                    </span>
                    <!-- 两条并排（2026-11-06 从上下两行改成一行）：差在 `--step-pad-y`——默认 3 →
                     格子 23、整条 29；6 → 格子 29、整条 35。行内嵌的开关用前者，卡内六格页签用
                     后者（点得准）。并排比上下更能看出那 6px：两条的格顶在同一条线上，
                     一眼就是「同一件东西的两个高度」，上下两行则要先在脑子里叠一次。 -->
                    <div class="kit-row">
                        <SteppedSlider
                            v-model="demoPane"
                            :options="DEMO_PANES"
                            label="演示：默认尺寸"
                            class="kit-steps kit-steps-half"
                        />
                        <SteppedSlider
                            v-model="demoPane"
                            :options="DEMO_PANES"
                            as="tab"
                            label="演示：页签条（加高一档）"
                            class="kit-steps kit-steps-half kit-steps-tall"
                        />
                    </div>
                    <p class="note">
                        <code>as="tab"</code> 只换 ARIA 不换几何；高度走
                        <code>--step-pad-y</code>，不认 prop。
                    </p>
                </div>
                <div v-if="current === 'choose'" class="kit-cell">
                    <span class="col-head">
                        <span class="kit-name">下拉</span>
                        <span class="kit-en">SelectField</span>
                    </span>
                    <div class="kit-row">
                        <SelectField
                            v-model="demoSchool"
                            class="demo-select"
                            :options="DEMO_SCHOOLS"
                            label="演示：门派"
                            placeholder="未选"
                        />
                    </div>
                    <p class="note">
                        <b>焦点不离开触发条</b>（<code>aria-activedescendant</code>）；
                        <code>Esc</code> 只收列表并吞掉事件——它常长在弹窗里，弹窗也听 Esc。
                    </p>
                </div>

                <div v-if="current === 'action'" class="kit-cell">
                    <span class="col-head">
                        <span class="kit-name">槽按钮</span>
                        <span class="kit-en">SlotButton</span>
                    </span>
                    <!-- 一行看四种形态；下一行是 `seal` 与两档尺寸。
                     **不再另起一行演示 `md` / `lg` 的纯文字按钮**（2026-11-06 删）：
                     尺寸只由高度决定，与里面装的是字还是图标无关，下面那行已经把它说完了。 -->
                    <div class="kit-row">
                        <SlotButton label="纯图标" icon="archive" />
                        <SlotButton label="图标加文字" icon="download" text="导出" />
                        <SlotButton label="纯文字" text="刷新" />
                        <SlotButton label="禁用" icon="trash" text="清除" disabled />
                    </div>
                    <div class="kit-row">
                        <SlotButton label="主操作 26px" icon="play" text="开始" seal />
                        <SlotButton label="主操作 31px" icon="play" text="开始" size="lg" seal />
                    </div>
                    <p class="note">
                        形态由 props 定（只 <code>icon</code> / <code>icon</code> +
                        <code>text</code> / 只 <code>text</code>）。<code>seal</code>
                        是变体，印面常驻， 一屏一枚；尺寸 <code>md</code> 26 / <code>lg</code> 31。
                    </p>
                </div>

                <div v-if="current === 'tip'" class="kit-cell">
                    <span class="col-head">
                        <span class="kit-name">消息提示</span>
                        <span class="kit-en">Notify</span>
                    </span>
                    <div class="kit-row">
                        <PressButton
                            icon="check"
                            text="成功"
                            label="演示：成功提示"
                            @click="notify.success('已保存')"
                        />
                        <PressButton
                            icon="close"
                            text="失败"
                            label="演示：失败提示"
                            @click="notify.error('保存失败：这条记录已经不在了')"
                        />
                        <PressButton
                            icon="info"
                            text="中性"
                            label="演示：中性提示"
                            @click="notify.info('已取消')"
                        />
                    </div>
                    <p class="note">
                        三秒自收、悬停停表、点一下收走。业务页只在操作后才出现——这里是唯一能看到它的地方。
                    </p>
                </div>

                <div v-if="current === 'input'" class="kit-cell">
                    <span class="col-head">
                        <span class="kit-name">输入格 / 数字格</span>
                        <span class="kit-en">Field / NumberField</span>
                    </span>
                    <div class="kit-row">
                        <input
                            class="field kit-field"
                            placeholder="角色名"
                            aria-label="演示：角色名"
                        />
                        <NumberField
                            :model-value="demoLevel"
                            label="演示：等级"
                            class="kit-field-num"
                            @update:model-value="demoLevel = $event"
                        />
                        <input
                            class="field kit-field-num"
                            placeholder="上限"
                            aria-label="演示：留空的上限"
                        />
                    </div>
                    <div class="kit-row">
                        <textarea
                            class="field area kit-area"
                            rows="2"
                            placeholder="多行：每行一条"
                            aria-label="演示：多行输入"
                        />
                    </div>
                    <p class="note">
                        高与 <code>PressButton</code> 的 <code>md</code> 同值；焦点换边色、不画外框
                        ——方框压在圆角上会露四个角。
                    </p>
                </div>

                <div v-if="current === 'input'" class="kit-cell">
                    <span class="col-head">
                        <span class="kit-name">价格格</span>
                        <span class="kit-en">PriceField</span>
                    </span>
                    <!-- 两档并排（2026-11-06 从上下两行改成一行）：lg 带加减、md 不带，
                     差的是字与内衬，槽还是同一道槽。并排才看得出「同一道槽」。 -->
                    <div class="kit-row">
                        <PriceField
                            v-model="demoPrice"
                            label="这一笔多少钱"
                            class="kit-price kit-price-half"
                            stepper
                        />
                        <PriceField
                            v-model="demoPriceMd"
                            label="md 档 · 无加减"
                            class="kit-price kit-price-half"
                            size="md"
                        />
                    </div>
                    <p class="note">
                        只收「万」，<b>值进出仍是游戏币原值</b>（这里 320 万 = 3200000）；
                        两侧步长按量级换（一千万以上 ±100 万）。
                    </p>
                </div>

                <div v-if="current === 'read'" class="kit-cell">
                    <span class="col-head">
                        <span class="kit-name">数值签</span>
                        <span class="kit-en">NumTag</span>
                    </span>
                    <div class="kit-row">
                        <NumTag class="kit-tag">
                            <span class="kit-tag-note">满</span>
                            <span>180</span>
                        </NumTag>
                        <!-- 不给 `--tag-*` 时宽高由内容定：这枚只装一个短数，摆在行内当读数。 -->
                        <NumTag>26</NumTag>
                    </div>
                    <p class="note">
                        只装一个数，<b>不是输入框</b>，悬停不加深。材质走全局
                        <code>.num-slot</code>；宽高由 <code>--tag-w</code> /
                        <code>--tag-h</code>
                        给（卡上 56 × 24），数居中。
                    </p>
                </div>

                <div v-if="current === 'read'" class="kit-cell">
                    <span class="col-head">
                        <span class="kit-name">进度条</span>
                        <span class="kit-en">MeterBar</span>
                    </span>
                    <!-- 两行差在 `--meter-h`：默认 10 是行内嵌用，14 是「独占一行当读数」用。
                     摆在同一张卡上，才看得出那 4px 在真实版式里意味着什么。
                     这台卡原先复制成了两张一模一样的（2026-11-02 合并）。 -->
                    <div class="kit-row">
                        <MeterBar
                            :percent="72"
                            label="演示：进度 72%（默认 10px）"
                            text="3,777.2万 / 4,200万"
                        />
                    </div>
                    <div class="kit-row kit-meter-lg">
                        <!-- 分母未知：轨道空着、不写 aria-valuenow。与「0%」是两件事。 -->
                        <MeterBar
                            :percent="null"
                            label="演示：进度未知（加大 14px）"
                            text="3,777.2万"
                        />
                    </div>
                    <p class="note">
                        它<b>不是滑块</b>：没有落点、不能拖。分母未知时轨道留空，不画成 0%。 高度走
                        <code>--meter-h</code>（经验条给 14）。
                    </p>
                </div>

                <div v-if="current === 'read'" class="kit-cell">
                    <span class="col-head">
                        <span class="kit-name">统计条</span>
                        <span class="kit-en">StatStrip</span>
                    </span>
                    <!-- 四格是收益页与总览页的实际用法，这里也让它撑满整行（见 `.demo-stats`）：
                     四格等分要靠整行宽度才看得出来，缩在一半里会读成一张卡。 -->
                    <div class="kit-row">
                        <StatStrip :items="DEMO_STATS" class="demo-stats" />
                    </div>
                    <p class="note">
                        四枚<b>压印签</b>，材质与物价卡同一块（<code>PressTile</code> 的
                        <code>wide</code> 档：大块要把左上那颗偏光收小）。每格三层——名目、读数、
                        副文；副文<b>左端说构成、右端说较上一档</b>，且不上色（四格的「好」方向不同，
                        方向交给 +/−）。列数由 <code>items.length</code> 决定。
                    </p>
                </div>

                <div v-if="current === 'input'" class="kit-cell">
                    <span class="col-head">
                        <span class="kit-name">日期选择</span>
                        <span class="kit-en">DateField</span>
                    </span>
                    <div class="kit-row">
                        <DateField v-model="demoDate" class="demo-date" label="演示：选日期" />
                    </div>
                    <p class="note">
                        槽 + 一张月历纸片，<b>不用原生 <code>&lt;input type="date"&gt;</code></b>
                        （系统月历与这套材质不兼容）。整张月历一个 Tab 停靠点，方向键换日、
                        <code>PgUp/PgDn</code> 换月。
                    </p>
                </div>

                <div v-if="current === 'action'" class="kit-cell">
                    <span class="col-head">
                        <span class="kit-name">压印块 / 按钮</span>
                        <span class="kit-en">PressTile / PressButton</span>
                    </span>
                    <div class="kit-row">
                        <div class="kit-tiles">
                            <PressTile class="kit-tile"><AppIcon name="tools" /></PressTile>
                            <PressTile class="kit-tile kit-tile-sm"
                                ><AppIcon name="pin"
                            /></PressTile>
                        </div>
                    </div>
                    <!-- 第一行压印块，第二行四种内容（纯文字 / 图标带字 / 纯图标 / 灌朱），
                     第三行尺寸：内容和「槽多大」不是一种分类，混在一行读起来像四个尺寸。 -->
                    <div class="kit-row">
                        <PressButton text="归档" label="归档：纯文字按钮" />
                        <PressButton icon="download" text="导出" label="导出：图标 + 文字" />
                        <PressButton icon="pin" label="纯图标按钮" />
                        <PressButton
                            icon="play"
                            text="开始"
                            label="开始：主操作（块面灌朱）"
                            seal
                        />
                    </div>
                    <!-- 三档按小到大排：并排才看得出 `sm` 是**注脚级**、不是「小一号的 md」
                     ——差 6px，且字号与内距一起降。
                     第四行原先还放了「sm 档的导出 / 导入」（收益页那个真身），2026-11-06 删：
                     它与这一行的 `sm` 是同一个东西，只是在演示同一个档位的用途。 -->
                    <div class="kit-row">
                        <PressButton text="sm" size="sm" label="注脚级 20px" />
                        <PressButton text="md" label="默认 26px" />
                        <PressButton text="lg" label="大一号 31px" size="lg" />
                    </div>
                    <p class="note">
                        上排是<b>块</b>（工具页图标格、左栏牌记），下面两排是<b>按钮</b>：同一块纸，
                        <code>seal</code> 把块面灌朱，一屏一枚。尺寸 <code>sm</code> 20 /
                        <code>md</code> 26 / <code>lg</code> 31——
                        <code>md</code> 与槽按钮逐像素同值，<code>sm</code>
                        是注脚级（塞在说明行右端、读数格边上，字号与内距一并收窄）。
                        <b>但一凹一凸是两种材质，别混在同一行</b>。
                    </p>
                </div>
            </div>
        </div>
    </LedgerSection>
</template>

<style scoped>
/* ---------- 目录 + 整组 ----------
 * 左 132 一条目录（五行装在一道凹槽里），右余下整块画当前这一组。卡高由
 * `LedgerSection` 的 `height` 写死，两栏各滚各的——切换组时页面纹丝不动。
 *
 * 132 跟着字号走（与 `.demo-select` 的 168 同一种写法）：一行里装的是「图标 + 组名
 * （两个字）+ 件数」，列宽不跟着长的话，字号一放「较大」组名就被挤成竖排。
 */
.atoms-split {
    display: grid;
    grid-template-columns: calc(132px * var(--fs-scale)) minmax(0, 1fr);
    gap: 18px;
    height: 100%;
    min-height: 0;
}

/* 目录 = 一道竖槽 + 一枚会滑下去的朱印。
 *
 * **照主侧栏 `AppRail` / `VerticalSlider` 的做法**（2026-11-06 用户：「你直接复制，
 * 我们现在项目整体的左侧菜单栏吧，只不过要把菜单项从竖的改成横的」）：
 * 那边格内是「图标在上、两字竖排」（窄条只有 34 宽），这里改成横排——
 * 这一栏是 132 宽的目录，不是 34 宽的窄条，横排才放得下图标 + 组名 + 件数。
 *
 * 三样东西与主侧栏一一对应：
 *   槽  = 全局 `.well upright`（金边 / `--well` 底 / 左壁暗 / 顶影 / 下沿亮边）；
 *   印  = 全局 `.stamp`（朱底 / 9px 受光带 / 上沿高光 / 落地线 / 朱色投影）；
 *   拇指 = 一枚独立定位的 `.stamp`，用 `translateY` 滑到当前那一格。
 *
 * **为什么印要单独一层、而不是让选中格自己灌朱**：上一版正是后者，于是得靠
 * `.nav-item:not(.on) { background: none }` 绕开 scoped 特异性压掉全局 `.stamp` 的坑；
 * 更要紧的是「选中的是哪一格」变成了「哪一格挂了 stamp 类」——切换瞬间没有位移、
 * 只有一次闪断。独立拇指把这件事收回成一处：印在哪，选中的就是哪。
 *
 * 深度一行都不写在这里：字号滑块、两格开关、槽按钮、主侧栏、这一栏是
 * **同一道槽切成五种形状**，厚度只能由 `base.css` 那一处说了算。
 * （132 批之前手写过一版，只有上亮线与一道软影，用户看完说「3D 效果不明显」。）
 *
 * **槽铺满整列**：`align-self: stretch`，左栏是一列凹进去的侧栏，五行排在顶部，
 * 底下那截空槽是「这一栏的底」。分区靠的是 `.well` 的金边与 `.upright` 的左壁暗——
 * 光有底色差不够，一大片平色只会读成「一块浅色板」。
 *
 * 格高 34（主侧栏 62，那是竖排两字的高度）、格间 3、槽内衬 4：
 * 五行合计 8 + 170 + 12 = 190，字号 1.1 时 209，仍在 404 里。
 */
.atoms-nav {
    /* 这一栏的规格。只有三处引用：格高、格间、拇指位移的那个算式。 */
    --nav-cell: calc(34px * var(--fs-scale));
    --nav-gap: calc(3px * var(--fs-scale));

    position: relative;
    display: grid;
    grid-auto-rows: var(--nav-cell);
    align-content: start;
    row-gap: var(--nav-gap);
    align-self: stretch;
    max-height: 100%;
    padding: 4px;
    border-radius: var(--r-2);
    /* 组变多时的退路：现在 190 远不到 404，真加到十组它自己会滚，不会顶出卡片。 */
    overflow: auto;
}

/* 拇指：一枚落在槽里的朱印。几何与 `VerticalSlider` 的 `.vs-thumb` 同构——
 * **比格四周各缩 2px**（槽内衬 4 + 让出的 2 = 6）：这里格高只有 34，缩 3 会把印压到 28，
 * 与图标 15 只剩 6 的上下留白，反而更挤。 */
.nav-thumb {
    /* 同 `VerticalSlider` 的拇指：2px 实底边，印比格面高一点。 */
    --stamp-depth: 2px;

    position: absolute;
    top: 6px;
    right: 6px;
    left: 6px;
    height: calc(var(--nav-cell) - 4px);
    border-radius: var(--r-2);
    transition: transform var(--t-slide) var(--ease-snap);
    /* 印面不吃指针：否则点在印上时事件目标是它，`data-id` 拿不到，点击会落空。 */
    pointer-events: none;
}

/* 一格 = 图标 + 组名 + 件数，横排、定高 34。
 *
 * 未选中是一枚**浅纸键**（与主侧栏同一轮改动，底色同取 `--well-key`）：材质照 `PressTile`
 * 抄——左上偏光 + 135° 斜差 + 四棱不对称 + 一层很薄的落地。这一列是 118×34 的宽扁块，
 * 偏光用百分比（120% 92%）就够，不必像 `wide` 那样换成固定像素。
 *
 * 选中那格要把这块浅纸**整块撤掉**（背景与四条棱一起），露出下面那枚朱印；
 * 只清 `background` 不够，上沿那条受光线会留在朱印边上成一道白边。
 *
 * 图标 15 与格高都乘 `--fs-scale`：主侧栏的 `.vs-ico` 也是 15，两处的图标必须同大。 */
.nav-item {
    --icon-size: calc(15px * var(--fs-scale));
    /* 两条背光棱。两档不能共用一个值：`--rule-2` 在暗色比块面亮，照用会在底边发光。 */
    --nav-rim-lo: light-dark(color-mix(in srgb, var(--rule-2) 46%, transparent), var(--bevel-lo));
    --nav-rim-base: light-dark(color-mix(in srgb, var(--rule-2) 78%, transparent), var(--bevel-lo));

    position: relative;
    z-index: 1;
    display: flex;
    align-items: center;
    gap: calc(9px * var(--fs-scale));
    padding: 0 11px 0 12px;
    border: 0;
    border-radius: var(--r-2);
    /* 与朱印**同宽**（2026-11-06，同主侧栏）：印左右各让 2（`left/right: 6`，槽内衬 4），
     * 格就跟着让 2，两者边界才落在同一条线上——未选中与选中是一颗按钮的两种状态，
     * 不是两种宽度。 */
    margin: 0 2px;
    background-color: var(--well-key);
    /* 两端半透明叠加，悬停换底色时底下的浅纸才透得上来（理由见 `VerticalSlider`）。 */
    background-image:
        radial-gradient(
            120% 92% at 16% -8%,
            color-mix(in srgb, var(--bevel-hi) 62%, transparent),
            transparent 54%
        ),
        linear-gradient(
            135deg,
            light-dark(
                    color-mix(in srgb, var(--paper-base) 9%, transparent),
                    color-mix(in srgb, var(--ink) 4%, transparent)
                )
                0,
            transparent 48%,
            color-mix(in srgb, var(--ink-base) 9%, transparent) 100%
        );
    box-shadow:
        inset 0 1px 0 var(--bevel-hi),
        inset 1px 0 0 color-mix(in srgb, var(--bevel-hi) 62%, transparent),
        inset -1px 0 0 var(--nav-rim-lo),
        inset 0 -2px 0 var(--nav-rim-base),
        0 1px 0 var(--shadow),
        0 3px 5px -3px var(--shadow-lg);
    color: var(--ink-2);
    font: inherit;
    text-align: left;
    cursor: pointer;
    transition:
        color var(--t-mid) var(--ease-soft),
        background-color var(--t-quick) var(--ease-soft),
        box-shadow var(--t-quick) var(--ease-soft);
}
/* 悬停把这块浅纸压实一档（与主侧栏同一条）：四条棱要整套重写，
 * 只写两条会把右、下那两条背光棱清掉，悬停时块反而没有厚度。 */
.nav-item:hover {
    color: var(--ink);
    background-color: var(--well-key-hover);
    box-shadow:
        inset 0 1px 0 var(--bevel-hi),
        inset 1px 0 0 color-mix(in srgb, var(--bevel-hi) 78%, transparent),
        inset -1px 0 0 var(--nav-rim-lo),
        inset 0 -2px 0 var(--nav-rim-base),
        0 2px 0 var(--shadow),
        0 4px 7px -4px var(--shadow-lg);
}
/* 选中那格只换字色（`--on-seal`，与印面成对翻），**不加粗、不加描边、不加字距**。
 * 文楷只有 Regular，描边与合成加粗都会把撇捺糊成块；「当前在哪一组」由那枚朱印说完。
 * 悬停时要清底：否则划过选中项时那层浅纸会盖住朱印。 */
.nav-item.on,
.nav-item.on:hover {
    color: var(--on-seal);
    background: none;
    box-shadow: none;
}
/* 聚焦环不能用朱红：选中时底就是朱红，红环会消失（`--ring-inv`，与
 * `SegmentedPills` 的选中格、主侧栏的格同一条规矩）。负 offset 收进印面里，
 * 免得在槽上向外撑出一圈。 */
.nav-item:focus-visible {
    outline: var(--ring-inv);
    outline-offset: -2px;
}
.nav-name {
    flex: none;
    font-size: var(--fs-sm);
    letter-spacing: 0.02em;
}
/* 件数靠右：这一栏没有账线撑开它了，靠 `margin-left: auto`。
 * 朱底上退一档（72%）：与格名同重会让「几件」读成第二个名字。 */
.nav-count {
    flex: none;
    margin-left: auto;
    font-family: var(--font-ui);
    font-size: var(--fs-mini);
    font-variant-numeric: tabular-nums;
    color: var(--muted);
}
.nav-item.on .nav-count {
    color: color-mix(in srgb, var(--on-seal) 72%, transparent);
}

/* 一组一件一行，像账本上的一笔：左边名目，右边样子与说明。
 *
 * 原先是两列六宫格：六块等大的带框小卡嵌在这张 `.board` 里，读作「卡里还套着卡」；
 * 而且 grid 会把同一行的两格拉到同高——「分段胶囊」只有一行控件，下面空出一大块，
 * 六格并排看下来全是同样的框、同样的灰字，没有一个能当锚点。
 * 改成一列之后行高各随内容，界线只剩行与行之间那道账线。
 */
.kit {
    display: flex;
    flex-direction: column;
    /* 右栏自己滚（2026-11-06）：卡高写死之后，「这一组比卡还长」的退路就在这儿。
     * 让位用轨道真宽（`--scrollbar-w`）再用等量负外边距补回：滚动条压进卡的内边距里，
     * 内容宽度不因「有没有滚动条」而变化——`.kit-row` 里那些并排控件的宽度会跟着跳，
     * 组与组之间切换时看起来像整块抖一下。 */
    overflow: auto;
    margin-right: calc(-1 * var(--scrollbar-w));
    padding-right: var(--scrollbar-w);
}
.kit-cell {
    display: grid;
    grid-template-columns: calc(132px * var(--fs-scale)) minmax(0, 1fr);
    /* 行距 9：一行里有三排演示时（槽按钮的形态 / 尺寸），3px 会把它们糊成一片，
     * 分不出是「一组三种形态」还是「三组各一枚」。 */
    gap: 9px 20px;
    padding: 13px 0;
    border-top: var(--w-hair) solid var(--rule);
}
/* 第一件不画线：上面是这张卡的标题栏，再画一道就成了两条。 */
.kit-cell:first-child {
    padding-top: 2px;
    border-top: 0;
}
/* 名目列在左，演示行与说明一律进右列；列写死之后行数由内容自己长。 */
.kit-cell > * {
    grid-column: 2;
}
.kit-cell > .col-head {
    grid-column: 1;
    grid-row: 1;
    /* 中文名（17.5 高）与首行控件（26–31 高）的视觉中线对齐：差的一半就是这 6px。
     * 不补时名目浮在控件上方，读起来像「标题 + 下面的东西」，而不是一行两栏。 */
    padding-top: 6px;
}
.kit-row {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
}
/* 两枚开关并排时要更宽的间隔：10px 是给胶囊与小按钮的，两只两格开关挨这么近
 * 会读成一只四格的开关。 */
.kit-row-sw {
    gap: 18px;
}
/* 统计条在真实页面里是通栏的一条（收益页、总览页都是），这里也让它撑满：
 * 四格等分要靠整行宽度才看得出，缩在一半里会像一张卡。 */
.demo-stats {
    flex: 1;
    min-width: 0;
}
/* 价格格按真身的宽度摆，不铺满整行：右栏 564 全给它时，`−` 和 `+` 会跑到两头，
 * 数字孤零零悬在中间那 300 的空当里。430 是「撑得开、两头还够得着」的宽度。 */
.kit-price {
    width: 100%;
    max-width: calc(430px * var(--fs-scale));
}
/* 两档并排时把 430 的上限撤掉：半栏放不下 430，`max-width` 会让第二枚被挤到下一行。 */
.kit-price-half {
    flex: 1 1 0;
    max-width: none;
    min-width: 0;
}
.kit-cell .note {
    margin-top: 0;
}
/* 名目两行：中文名是这一条的条目，英文名给认得组件的人对号。
 * 原先一行写完（`SegmentedPills · 分段胶囊`）时两者同重、都只有 10px 灰字，
 * 六条看下来没有一个能当锚点。 */
.col-head {
    display: flex;
    flex-direction: column;
    gap: 4px;
    font-family: var(--font-ui);
}
.kit-name {
    font-size: var(--fs-base);
    line-height: 1.3;
    color: var(--ink);
}
.kit-en {
    font-size: var(--fs-mini);
    line-height: 1.35;
    letter-spacing: 0.05em;
    color: var(--muted);
}

/* 演示用的三条宽度：输入格里最长的一条是「角色名」，数字格按真实表单里的 72px 给，
 * 多行那条铺满整格——都按业务页里真身的尺寸摆，不另调一套。 */
.kit-field {
    width: 130px;
}
.kit-field-num {
    width: 72px;
}
.kit-area {
    width: 100%;
}

/* 数值签按卡上那枚摆：56 × 24（乘字号档）、字号也照抄 15.5。
 * 30 与 17.5 是这条票面统一之前的值，早已对不上（§2.4-37 记着 24 的来由）——
 * 演示页摆的必须是线上那个数，否则「演示里好看、业务页里不对劲」又要多查一轮。 */
.kit-tag {
    --tag-w: calc(56px * var(--fs-scale));
    --tag-h: calc(24px * var(--fs-scale));
    font-size: calc(var(--fs-md) + 1px);
}
.kit-tag-note {
    color: var(--muted);
    font-size: var(--fs-mini);
}

/* 滑块演示给 300 宽：`inline-grid` 会收缩到内容宽，收缩态下「N 格等分 + 印按格位移」
 * 看不出比例。加高那行只覆写纵向变量、宽度不动，差 8px 才对得出来。 */
.kit-steps {
    width: 300px;
}
/* 并排时各占一半，但**留着 300 的上限**：300 是这条控件本来该有的宽（三格 × 100），
 * 开发页的卡是通栏 1198、右栏 1022，纯 `flex: 1 1 0` 会把两条拉到各 400+，
 * 三格里的两个字被摊在 140 的格子里，读起来像两块横幅而不是控件。
 * `width: auto` 是必须的——不写它，`.kit-steps` 的 300 会顶住 flex-basis，
 * 两条就并不到一行。 */
.kit-steps-half {
    flex: 1 1 0;
    width: auto;
    max-width: calc(300px * var(--fs-scale));
    min-width: 0;
}
.kit-steps-tall {
    --step-pad-y: 6px;
}

/* 进度条的加大档：与角色卡经验条同值（14）。演示页摆的必须是线上那个数，
 * 否则「演示里好看、业务页里不对劲」又要多查一轮。 */
.kit-meter-lg {
    --meter-h: 14px;
}

/* 三块并排，间隔比 `.kit-row` 的 7px 宽：7px 是给胶囊和小按钮的，
 * 56px 的块挨这么紧，读作「一块被切成了三片」。底部对齐，34 那两枚自然坐在同一条线上。 */
.kit-tiles {
    display: flex;
    align-items: flex-end;
    gap: 14px;
}

/* 56px 是工具页图标格的尺寸、26px 是它的图标——演示按真身给，不另调一套，
 * 否则「演示里好看、业务页里不对劲」又要多查一轮。
 * 34px 那两枚与左栏牌记同尺寸：落地影缩到 0.6（块小了，8px 软影会读作「浮起来」），
 * 圆角回到 `--r-2` 与目录槽同心。图标跟着缩到 15px，与牌记里那只字的份量接近。 */
.kit-tile {
    --tile-w: 56px;
    --icon-size: calc(26px * var(--fs-scale));
}
.kit-tile-sm {
    --tile-w: 34px;
    --tile-r: var(--r-2);
    /* 与左栏牌记逐项同值（0.85，不是 0.6）：这一格是验收面，摆的必须是线上那块。
     * 0.6 时影子只剩 1px 宽的一条，在这张 `--bg` 底的格子里勉强看得出，搬到牌记的
     * `--paper` 栏底就成了「一张平的浅色方块」。 */
    --tile-drop: 0.85;
    --icon-size: calc(15px * var(--fs-scale));
}
/* 下拉按真实用法给宽（门派那一格约 168）：`.kit-row` 是整行宽，撑满时它读作
 * 一条通栏控件，而它实际是个窄的。 */
.demo-select {
    flex: none;
    width: calc(168px * var(--fs-scale));
}
/* 日期条与它同宽（176 是「2026年12月15日」加箭头与内衬的实测宽度），
 * 业务页（收益历史）也取这个值，两处并排时才是同一个尺度。 */
.demo-date {
    flex: none;
    width: calc(176px * var(--fs-scale));
}
</style>
