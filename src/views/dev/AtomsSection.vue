<script setup lang="ts">
import { computed, ref } from 'vue';
import AppIcon from '../../components/AppIcon.vue';
import type { IconName } from '../../components/icons';
import CostSwitch from '../../components/CostSwitch.vue';
import DateField from '../../components/DateField.vue';
import FontSizeSlider from '../../components/FontSizeSlider.vue';
import KeycapButton from '../../components/KeycapButton.vue';
import LedgerSection from '../../components/LedgerSection.vue';
import MeterBar from '../../components/MeterBar.vue';
import NumTag from '../../components/NumTag.vue';
import PaperTag from '../../components/PaperTag.vue';
import NumberField from '../../components/NumberField.vue';
import PressButton from '../../components/PressButton.vue';
import PriceField from '../../components/PriceField.vue';
import PressTile from '../../components/PressTile.vue';
import RecordPager from '../../components/RecordPager.vue';
import SegmentedPills from '../../components/SegmentedPills.vue';
import SelectField from '../../components/SelectField.vue';
import SlotButton from '../../components/SlotButton.vue';
import TextButton from '../../components/TextButton.vue';
import StatStrip, { type StatItem } from '../../components/StatStrip.vue';
import FoldedCard from '../../components/FoldedCard.vue';
import SteppedSlider from '../../components/SteppedSlider.vue';
import TogglePills from '../../components/TogglePills.vue';
import TicketCard from '../../components/TicketCard.vue';
import TrendChart from '../../components/TrendChart.vue';
import { useFontScale } from '../../composables/use-font-scale';
import { notify } from '../../composables/use-notify';
import { STYLE_OPTIONS, THEME_OPTIONS, useTheme } from '../../composables/use-theme';
import { todayText } from '../../services/format';
import PriceCard from '../prices/PriceCard.vue';
import type { ReadonlyPriceItem } from '../prices/prices';

/**
 * 公共组件目录：一条 `kit-cell` 可并排同族件，件数统一由 KIT_GROUPS 派生——
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
 * 只动这一张卡，不动整页：入口、模拟数据、色板、字号、图标都还是一叠 `.board`，
 * 这张卡内部的分栏是它自己的事。全页改左右布局会让「一叠卡」的读法断掉。
 */
const { mode, style } = useTheme();
const { scale } = useFontScale();
const demoKeycapActive = ref(false);

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
            ['keycap', '弧面瓷键'],
            ['text', '文字按钮'],
            ['pager', '分页'],
            ['paper-tag', '双孔纸签'],
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
            ['folded', '侧折纸卡'],
            ['material', '材质卡'],
            ['trend', '趋势图'],
        ],
    },
    {
        id: 'tip',
        name: '提示',
        icon: 'info',
        items: [['notify', '消息提示']],
    },
];

const MATERIAL_SAMPLES = [
    { material: 'glass', name: 'A · 厚边清玻璃' },
    { material: 'frosted', name: 'B · 酸蚀磨砂玻璃' },
    { material: 'turned-metal', name: 'F · 旋切金属' },
] as const;
const MATERIAL_SAMPLE_ITEM: ReadonlyPriceItem = {
    id: 'material-preview',
    name: '黑宝石',
    category: '宝石符石',
    sub: '宝石',
    unit: '个',
    note: '',
    createdAt: 0,
    updatedAt: 0,
    points: (
        [
            ['2026-11-12', 96000],
            ['2026-11-14', 89000],
            ['2026-11-16', 92000],
            ['2026-11-19', 85500],
            ['2026-11-21', 82000],
        ] as const
    ).map(([date, price], i) => ({ id: String(i), date, price, note: '', createdAt: i })),
};

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
/** 当前这一组的名字与件数：右栏顶部那一行组头用它，与左栏选中的那一格同一份数据。 */
const currentGroup = computed(() => KIT_NAV.find((group) => group.id === current.value));
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
const demoPage = ref(1);

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

/** 统计条的演示：四格各给一种真实会出现的形态——收入、支出、净额和笔数。 */
const DEMO_STATS: StatItem[] = [
    { cap: '收入', value: '462.5 万', tone: 'gain', sub: '31 笔 · 均 14.9 万', delta: '+12.4%' },
    { cap: '支出', value: '−12.3 万', tone: 'loss', sub: '6 笔 · 占收入 2.7%', delta: '+3.1%' },
    { cap: '净额', value: '450.2 万', tone: 'gain', sub: '结余率 97.3%', delta: '+13.2%' },
    { cap: '笔数', value: '37', sub: '4 个号 · 2 条未指定', delta: '+6 笔' },
];
const DEMO_EMBEDDED_STATS: StatItem[] = [
    { cap: '收入', value: '462.5 万', tone: 'gain' },
    { cap: '支出', value: '12.3 万', tone: 'loss' },
    { cap: '目标', value: '3', unit: '项' },
    { cap: '在线时长', value: '未读取', unavailable: true },
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
        plain
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

            <div class="kit-pane well upright">
                <div class="kit">
                    <!-- 组头：右栏第一行写「哪一组、几件」，左边目录选中哪一行这里就回执哪一行。
                     没有它时右栏直接从「分段胶囊」开始，读者只能靠左栏那枚朱印的位置猜上下文，
                     两块挨得再近也读成两件事（2026-11-06 用户：「左菜单和右组件分得很开」）。
                     图标与左栏那一格同一枚：字形是「同一个东西」的第二重证据，比文字快。 -->
                    <div v-if="currentGroup" class="kit-head">
                        <AppIcon :name="currentGroup.icon" />
                        <span class="kit-group">{{ currentGroup.name }}</span>
                        <span class="kit-group-count">{{ currentGroup.count }} 件</span>
                    </div>
                    <div v-if="current === 'choose'" class="kit-cell">
                        <span class="col-head">
                            <span class="kit-name">分段胶囊</span>
                            <span class="kit-en">SegmentedPills</span>
                        </span>
                        <div class="kit-row">
                            <SegmentedPills
                                v-model="style"
                                :options="STYLE_OPTIONS"
                                label="风格"
                                wrap
                            />
                            <SegmentedPills v-model="mode" :options="THEME_OPTIONS" label="明暗" />
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
                            <code>#option</code> 可补充金额等读数，沿用同一档位和键盘导航。
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
                        <!-- 六枚**一行**（2026-11-06 用户：「空间够可以一行展示」）：前四枚是形态
                     （纯图标 / 图标带字 / 纯文字 / 禁用），后两枚是 `seal` 与两档尺寸。
                     原先分成两行，第二行只剩两枚，右半边空着一大片——这一行量下来 838 宽，
                     六枚只占 338。`kit-row` 本身是 `flex-wrap: wrap`，窄了会自己折。
                     **不再另起一行演示 `md` / `lg` 的纯文字按钮**：尺寸只由高度决定，
                     与里面装的是字还是图标无关，最后两枚已经把它说完了。 -->
                        <div class="kit-row">
                            <SlotButton label="纯图标" icon="archive" />
                            <SlotButton label="图标加文字" icon="download" text="导出" />
                            <SlotButton label="纯文字" text="刷新" />
                            <SlotButton danger label="禁用" icon="trash" text="清除" disabled />
                            <SlotButton label="主操作 26px" icon="play" text="开始" seal />
                            <SlotButton
                                label="主操作 31px"
                                icon="play"
                                text="开始"
                                size="lg"
                                seal
                            />
                        </div>
                        <p class="note">
                            形态由 props 定（只 <code>icon</code> / <code>icon</code> +
                            <code>text</code> / 只 <code>text</code>）。<code>seal</code>
                            是变体，印面常驻， 一屏一枚；尺寸 <code>md</code> 26 /
                            <code>lg</code> 31。
                        </p>
                        <div class="kit-row">
                            <PressButton danger icon="trash" text="删除" label="危险纸按钮" />
                            <PressButton danger seal text="清除" label="危险填色按钮" />
                            <SlotButton danger icon="trash" text="删除" label="危险槽按钮" />
                            <SlotButton danger seal text="清除" label="危险填色槽按钮" />
                        </div>
                        <p class="note">
                            <code>danger</code> 使用独立危险色；<code>seal</code>
                            控制填色，尺寸沿用原档。
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
                            <input class="field kit-field-num" aria-label="演示：留空的上限" />
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
                            高与 <code>PressButton</code> 的
                            <code>md</code> 同值；焦点换边色、不画外框 ——方框压在圆角上会露四个角。
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
                        <!-- **两条并排**（2026-11-06 用户：「一起改下」）：默认 10 与加大 14 差在
                     `--meter-h`，并排时两条的格顶在同一条线上，那 4px 一眼可见；上下排反而
                     要读者在脑子里叠一次。两条各 `flex: 1`（419 一条），够放下「3,777.2万 /
                     4,200万」这种读数。这台卡原先复制成了两张一模一样的（2026-11-02 合并）。 -->
                        <div class="kit-row">
                            <MeterBar
                                class="kit-meter"
                                :percent="72"
                                label="演示：进度 72%（默认 10px）"
                                text="3,777.2万 / 4,200万"
                            />
                            <!-- 分母未知：轨道空着、不写 aria-valuenow。与「0%」是两件事。 -->
                            <MeterBar
                                class="kit-meter kit-meter-lg"
                                :percent="null"
                                label="演示：进度未知（加大 14px）"
                                text="3,777.2万"
                            />
                        </div>
                        <p class="note">
                            它<b>不是滑块</b>：没有落点、不能拖。分母未知时轨道留空，不画成 0%。
                            高度走
                            <code>--meter-h</code>（经验条给 14）。
                        </p>
                    </div>

                    <div v-if="current === 'read'" class="kit-cell">
                        <span class="col-head">
                            <span class="kit-name">统计条</span>
                            <span class="kit-en">StatStrip</span>
                        </span>
                        <div class="kit-row">
                            <StatStrip :items="DEMO_STATS" class="demo-stats" />
                        </div>
                        <div class="kit-row">
                            <StatStrip
                                :items="DEMO_EMBEDDED_STATS"
                                class="demo-stats-embedded"
                                surface="embedded"
                                heading="票据统计"
                                icon="accounts"
                                aria-label="薄票据统计示例"
                            />
                        </div>
                        <p class="note">
                            默认每格为独立纸面；卡内使用 <code>surface="embedded"</code>，票据直接
                            放在纸面上，保留虚线、镂空缺口、平直纸边和标题小图标。
                            <code>TicketCard</code> 提供带缺口的票据外壳，圆角取
                            <code>--r-ticket</code>。
                            立体感来自左亮右暗的细纸棱、两侧薄纸层与顶部高光，不叠加模糊影。
                            金额、单位和未读取状态由业务提供。
                        </p>
                        <div class="kit-row">
                            <TicketCard as="article" class="demo-ticket">
                                <template #header><h3 class="ticket-rule">自定义内容</h3></template>
                                <p>同一票据外壳，内部保留各自的内容排版。</p>
                            </TicketCard>
                        </div>
                        <p class="note">
                            <code>TicketCard</code> 只提供纸面、侧缺口和立体纸边；可换行签头放在
                            <code>header</code> 插槽并以分隔线收尾，票口跟随实际高度。固定签头也可用
                            <code>--ticket-notch-y</code> 定位，不参与统计或业务计算。
                        </p>
                    </div>

                    <div v-if="current === 'read'" class="kit-cell">
                        <span class="col-head">
                            <span class="kit-name">侧折纸卡</span>
                            <span class="kit-en">FoldedCard</span>
                        </span>
                        <div class="kit-row">
                            <FoldedCard spine="left" class="demo-folded">
                                <h3>左侧纸脊</h3>
                                <p>内容自然排列，折边独立换向。</p>
                            </FoldedCard>
                            <FoldedCard spine="right" class="demo-folded">
                                <h3>右侧纸脊</h3>
                                <p>内容自然排列，折边独立换向。</p>
                            </FoldedCard>
                        </div>
                        <div class="kit-row">
                            <StatStrip
                                :items="DEMO_EMBEDDED_STATS"
                                class="demo-stats-embedded"
                                surface="folded"
                                heading="近一周"
                                icon="calendar"
                                aria-label="右侧纸脊统计示例"
                            />
                            <StatStrip
                                :items="DEMO_EMBEDDED_STATS"
                                class="demo-stats-embedded"
                                surface="folded"
                                spine="left"
                                heading="今日在线"
                                icon="play"
                                aria-label="左侧纸脊统计示例"
                            />
                        </div>
                        <p class="note">
                            <code>FoldedCard</code> 只提供外壳，任意内容放入默认插槽。
                            <code>spine="left"</code>／<code>spine="right"</code>
                            控制纸脊，默认右侧； 正文不镜像，内边距自动为纸脊留空。统计条使用
                            <code>surface="folded"</code>，字号与票据模式一致。
                            <code>--folded-pad-block</code>／<code>--folded-pad-inline</code>
                            控制留白，
                            纸脊的避让统一由外壳处理。总览周月、队伍、收益和账号便签共用此组件，
                            内部排版由各自内容决定。
                        </p>
                    </div>

                    <div v-if="current === 'read'" class="kit-cell">
                        <span class="col-head">
                            <span class="kit-name">材质卡</span>
                            <span class="kit-en">MaterialCard</span>
                        </span>
                        <div class="demo-materials">
                            <figure v-for="sample in MATERIAL_SAMPLES" :key="sample.material">
                                <PriceCard
                                    :item="MATERIAL_SAMPLE_ITEM"
                                    :material="sample.material"
                                    @open="notify.info('示例价格历史')"
                                    @log="notify.info('示例记价')"
                                />
                                <figcaption>{{ sample.name }}</figcaption>
                            </figure>
                        </div>
                        <p class="note">
                            <code>material</code> 可选 <code>glass</code>、<code>frosted</code>、
                            <code>turned-metal</code>。内容放入默认插槽，可用
                            <code>--material-tint</code>、<code>--material-depth</code>、
                            <code>--material-hue</code> 调色，<code>--material-pad</code>
                            调整内边距。
                        </p>
                    </div>

                    <div v-if="current === 'read'" class="kit-cell">
                        <span class="col-head">
                            <span class="kit-name">趋势图</span>
                            <span class="kit-en">TrendChart</span>
                        </span>
                        <div class="kit-row">
                            <LedgerSection class="demo-trend" title="收益趋势" plain>
                                <TrendChart
                                    class="chart-in-card"
                                    :labels="['2026-11-13', '2026-11-14', '2026-11-15']"
                                    :series="[
                                        {
                                            id: 'net',
                                            name: '净额',
                                            values: [450000, -130000, 820000],
                                        },
                                    ]"
                                    kind="money"
                                    label="示例收益趋势"
                                />
                            </LedgerSection>
                        </div>
                        <p class="note">
                            图表单独使用时自带立体底板；放在卡片内使用 <code>.chart-in-card</code>，
                            由外层纸卡统一承载标题和阴影，图例透出同一底色，不额外绘制分隔线。
                            完整绘图区默认
                            220px（含坐标与标签，不含图例），多数据横向滚动且隐藏滚动条，
                            保留悬停明细和键盘查看；账号分类图沿用同一默认高度与滚动基座。
                            柱色、图例和悬停色标共用 35% 透明度的浅染色，文字保持正常清晰度。
                            外层使用 <code>plain</code> 关闭纹理和渐变，仍保留公共圆角与立体阴影。
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
                            槽 + 一张月历纸片，<b
                                >不用原生 <code>&lt;input type="date"&gt;</code></b
                            >
                            （系统月历与这套材质不兼容）。整张月历一个 Tab 停靠点，方向键换日、
                            <code>PgUp/PgDn</code> 换月。
                        </p>
                    </div>

                    <div v-if="current === 'action'" class="kit-cell">
                        <span class="col-head">
                            <span class="kit-name">压印块 / 按钮</span>
                            <span class="kit-en">PressTile / PressButton</span>
                        </span>
                        <!-- **一整排**（2026-11-06 用户：「空间够可以一行展示」）：块两枚（56 / 34）
                     ＋ 按钮的四种内容（纯文字 / 图标带字 / 纯图标 / 灌朱）＋ 三个尺寸
                     （`sm` / `md` / `lg`）。合计约 420，行宽 838，装得下——原先拆成三行，
                     每行都只占左边一小截，右边全是空白。
                     底对齐（`kit-row-tiles`）：块与按钮落在同一条地面上，「同一块纸的两种
                     厚度」才读得出；三枚尺寸也跟着站同一条线，20 / 26 / 31 的差一眼可见。
                     尺寸**排在后面**：它们是同一件的三档，跟在四枚内容之后读作「还有三个
                     尺寸」；放到前面就会先被当成三种新按钮。 -->
                        <div class="kit-row kit-row-tiles">
                            <div class="kit-tiles">
                                <PressTile class="kit-tile"><AppIcon name="tools" /></PressTile>
                                <PressTile class="kit-tile kit-tile-sm"
                                    ><AppIcon name="pin"
                                /></PressTile>
                            </div>
                            <PressButton text="归档" label="归档：纯文字按钮" />
                            <PressButton icon="download" text="导出" label="导出：图标 + 文字" />
                            <PressButton icon="pin" label="纯图标按钮" />
                            <PressButton
                                icon="play"
                                text="开始"
                                label="开始：主操作（块面灌朱）"
                                seal
                            />
                            <PressButton text="sm" size="sm" label="注脚级 20px" />
                            <PressButton text="md" label="默认 26px" />
                            <PressButton text="lg" label="大一号 31px" size="lg" />
                        </div>
                        <p class="note">
                            左边两枚是<b>块</b>（工具页图标格、左栏牌记），右边依次是<b>按钮</b>的四种
                            内容与三档尺寸：同一块纸，<code>seal</code> 把块面灌朱，一屏一枚。尺寸
                            <code>sm</code> 20 / <code>md</code> 26 / <code>lg</code> 31——
                            <code>md</code> 与槽按钮逐像素同值，<code>sm</code>
                            是注脚级（塞在说明行右端、读数格边上，字号与内距一并收窄）。
                            <b>但一凹一凸是两种材质，别混在同一行</b>。
                        </p>
                    </div>
                    <div v-if="current === 'action'" class="kit-cell">
                        <span class="col-head">
                            <span class="kit-name">弧面瓷键</span>
                            <span class="kit-en">KeycapButton</span>
                        </span>
                        <div class="kit-row">
                            <KeycapButton
                                class="demo-keycap"
                                text="清风明月"
                                indicator
                                :active="demoKeycapActive"
                                :label="demoKeycapActive ? '演示：结束计时' : '演示：开始计时'"
                                @click="demoKeycapActive = !demoKeycapActive"
                            />
                            <KeycapButton
                                class="demo-keycap"
                                text="正在保存"
                                label="演示在线保存中"
                                active
                                indicator
                                disabled
                            />
                            <KeycapButton text="暂不可用" label="演示禁用状态" disabled />
                        </div>
                        <p class="note">
                            弧面瓷键使用浅凹键面、圆润肩部和薄前沿；悬停不位移，按下仅键面下沉。
                            点击首枚可切换演示状态，业务页同一角色键开始／结束计时，保存中禁用。
                            <code>--keycap-min-h</code>／<code>--keycap-pad</code> 控制尺寸，
                            <code>active</code> 标记业务状态，<code>indicator</code> 显示状态灯；
                            状态与保存仍由调用方管理，禁用的在线键保留清晰读数。
                            角色键按内容定宽，常规最小高度 34px 随字号缩放，不按排数拉高，
                            长名称在窄区自然换行。
                        </p>
                    </div>
                    <div v-if="current === 'action'" class="kit-cell">
                        <span class="col-head">
                            <span class="kit-name">文字按钮</span>
                            <span class="kit-en">TextButton</span>
                        </span>
                        <div class="kit-row">
                            <TextButton text="补记" label="补记在线时长" />
                            <TextButton text="记录" label="查看上线记录" />
                            <TextButton icon="download" text="导出" label="导出单价文件" />
                            <TextButton text="导入" label="导入暂不可用" disabled />
                        </div>
                        <p class="note">
                            低频辅助操作使用文字按钮，默认无底板、无投影。悬停显示下划线，
                            保留键盘焦点、禁用和完整说明；高度由
                            <code>--text-button-h</code> 控制，默认 26px 并跟随字号。
                        </p>
                    </div>
                    <div v-if="current === 'action'" class="kit-cell">
                        <span class="col-head">
                            <span class="kit-name">分页</span>
                            <span class="kit-en">RecordPager</span>
                        </span>
                        <div class="kit-row">
                            <RecordPager v-model="demoPage" :pages="20" label="演示分页" />
                        </div>
                        <p class="note">
                            左右箭头逐页翻动，点击页码直达；省略号每次跳五页，首尾始终可见。
                            当前页使用印面与 <code>aria-current</code>，单页自动隐藏。
                        </p>
                    </div>
                    <div v-if="current === 'action'" class="kit-cell">
                        <span class="col-head">
                            <span class="kit-name">双孔纸签</span>
                            <span class="kit-en">PaperTag</span>
                        </span>
                        <div class="kit-row">
                            <button
                                type="button"
                                class="demo-paper-tag-button"
                                aria-label="演示双孔纸签"
                                @click="notify.info('双孔纸签')"
                            >
                                <PaperTag>
                                    <span class="demo-paper-tag-content">
                                        <AppIcon name="accounts" />
                                        <span>记一笔</span>
                                    </span>
                                </PaperTag>
                            </button>
                        </div>
                        <p class="note">
                            首页常用功能与账号快捷记账共用纸面、孔壁和断续压痕；内容经默认插槽传入，颜色与尺寸通过
                            CSS 变量调整，按钮、焦点与业务由外层负责。
                        </p>
                    </div>
                </div>
            </div>
        </div>
    </LedgerSection>
</template>

<style scoped src="./atoms-section.css"></style>
