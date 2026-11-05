<script setup lang="ts">
import { ref } from 'vue';
import AppIcon from '../../components/AppIcon.vue';
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
 * 加一件请连上面那个数一起改：篇首原先写死「九件」，加了两件之后就成了假信息。
 * 组合件不进这张卡（它由原子拼成、还带业务语义）——`SlipRowSection` 是一例。
 * 旧稿里还有一张《师门技能行》，随那一行重做而撤掉（2026-11-04），不要照着补回来。
 *
 * 这张卡不是演示页，是**验收面**——新控件先进这里，再进业务页面。
 * 它和「外观」共用同一份状态（单例 composable），所以在上面切主题、拖字号，
 * 这里会立刻跟着变；这也顺带验证了单例确实生效。
 */
const { mode } = useTheme();
const { scale } = useFontScale();

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
    { cap: '收入', value: '462.5 万' },
    { cap: '支出', value: '—', tone: 'num' },
    { cap: '净额', value: '−12 万', tone: 'loss' },
    { cap: '笔数', value: '18' },
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
    <LedgerSection title="原子组件" hint="抽出来复用的十三件，业务页直接拿去用">
        <div class="kit atoms-kit">
            <div class="kit-cell">
                <span class="col-head">SegmentedPills · 分段胶囊</span>
                <div class="kit-row">
                    <SegmentedPills v-model="mode" :options="THEME_OPTIONS" label="主题" />
                </div>
                <p class="note">整组一个 Tab 停靠点；单格质感走全局 <code>.bevel-pill</code>。</p>
            </div>

            <div class="kit-cell">
                <span class="col-head">TogglePills · 多选胶囊</span>
                <div class="kit-row">
                    <TogglePills v-model="demoToggles" :options="DEMO_TOGGLES" label="演示：多选" />
                </div>
                <p class="note">
                    与分段胶囊同一套材质，语义是一组<b>开关</b>：左右键只移焦点、空格切换，
                    按下第二枚不会弹起第一枚。
                </p>
            </div>

            <div class="kit-cell">
                <span class="col-head">FontSizeSlider · 三档滑块</span>
                <div class="kit-row">
                    <FontSizeSlider v-model="scale" />
                </div>
                <p class="note">三档，不是连续值；240ms 回弹落格。</p>
            </div>

            <div class="kit-cell">
                <span class="col-head">SteppedSlider · 多档滑块 / 页签条</span>
                <!-- 两行差在 `--step-pad-y`：默认 3 → 格子 23、整条 29；6 → 格子 29、整条 35。
                     行内嵌的开关用前者，卡内六格页签用后者（点得准）。 -->
                <div class="kit-row">
                    <SteppedSlider
                        v-model="demoPane"
                        :options="DEMO_PANES"
                        label="演示：默认尺寸"
                        class="kit-steps"
                    />
                </div>
                <div class="kit-row">
                    <SteppedSlider
                        v-model="demoPane"
                        :options="DEMO_PANES"
                        as="tab"
                        label="演示：页签条（加高一档）"
                        class="kit-steps kit-steps-tall"
                    />
                </div>
                <p class="note">
                    <code>as="tab"</code> 只换 ARIA 不换几何；高度走 <code>--step-pad-y</code>，不认
                    prop。
                </p>
            </div>

            <div class="kit-cell">
                <span class="col-head">SlotButton · 槽按钮</span>
                <!-- 一行看四种形态，下面两行看尺寸：`seal`（印在不在）与 `size`（槽多大）
                     不是同一种分类，混排会让人以为它们是四个档位。 -->
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
                <div class="kit-row">
                    <SlotButton label="md 26px" text="md" />
                    <SlotButton label="lg 31px" text="lg" size="lg" />
                </div>
                <p class="note">
                    形态由 props 定（只 <code>icon</code> / <code>icon</code> + <code>text</code> /
                    只 <code>text</code>）。<code>seal</code> 是变体，印面常驻， 一屏一枚；尺寸
                    <code>md</code> 26 / <code>lg</code> 31。
                </p>
            </div>

            <div class="kit-cell">
                <span class="col-head">CostSwitch · 两格开关</span>
                <div class="kit-row">
                    <CostSwitch v-model="recorded" off-label="否" on-label="是" />
                    <CostSwitch v-model="autoSave" off-label="手动" on-label="自动" />
                </div>
                <p class="note">
                    文案走 <code>off-label</code> / <code>on-label</code>；关闭是灭灯，不是变灰。
                </p>
            </div>

            <div class="kit-cell">
                <span class="col-head">Notify · 消息提示</span>
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

            <div class="kit-cell">
                <span class="col-head">Field · 输入格 / NumberField · 数字格</span>
                <div class="kit-row">
                    <input class="field kit-field" placeholder="角色名" aria-label="演示：角色名" />
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

            <div class="kit-cell">
                <span class="col-head">PriceField · 价格格</span>
                <div class="kit-row">
                    <PriceField
                        v-model="demoPrice"
                        label="这一笔多少钱"
                        class="kit-price"
                        stepper
                    />
                </div>
                <div class="kit-row">
                    <PriceField
                        v-model="demoPriceMd"
                        label="md 档 · 无加减"
                        class="kit-price"
                        size="md"
                    />
                </div>
                <p class="note">
                    只收「万」，<b>值进出仍是游戏币原值</b>（这里 320 万 = 3200000）；
                    两侧步长按量级换（一千万以上 ±100 万）。
                </p>
            </div>

            <div class="kit-cell">
                <span class="col-head">NumTag · 数值签</span>
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
                    <code>.num-slot</code>；宽高由 <code>--tag-w</code> / <code>--tag-h</code>
                    给（卡上 56 × 24），数居中。
                </p>
            </div>

            <div class="kit-cell">
                <span class="col-head">StatStrip · 统计条</span>
                <!-- 四格是收益页与总览页的实际用法，这里也让它撑满整行（见 `.demo-stats`）：
                     四格等分要靠整行宽度才看得出来，缩在一半里会读成一张卡。 -->
                <div class="kit-row">
                    <StatStrip :items="DEMO_STATS" class="demo-stats" />
                </div>
                <p class="note">
                    读作<b>一行账</b>，不是四张卡：没有底色、没有圆角，只有每格之间一条 1px
                    账线。列数由 <code>items.length</code> 决定。
                </p>
            </div>

            <div class="kit-cell">
                <span class="col-head">MeterBar · 进度条</span>
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

            <div class="kit-cell">
                <span class="col-head">SelectField · 下拉</span>
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

            <div class="kit-cell">
                <span class="col-head">DateField · 日期选择</span>
                <div class="kit-row">
                    <DateField v-model="demoDate" class="demo-date" label="演示：选日期" />
                </div>
                <p class="note">
                    槽 + 一张月历纸片，<b>不用原生 <code>&lt;input type="date"&gt;</code></b>
                    （系统月历与这套材质不兼容）。整张月历一个 Tab 停靠点，方向键换日、
                    <code>PgUp/PgDn</code> 换月。
                </p>
            </div>

            <div class="kit-cell">
                <span class="col-head">PressTile · 压印块 / PressButton · 压印按钮</span>
                <div class="kit-row">
                    <div class="kit-tiles">
                        <PressTile class="kit-tile"><AppIcon name="tools" /></PressTile>
                        <PressTile class="kit-tile kit-tile-sm"><AppIcon name="pin" /></PressTile>
                    </div>
                </div>
                <!-- 第一行压印块，第二行四种内容（纯文字 / 图标带字 / 纯图标 / 灌朱），
                     第三行尺寸：内容和「槽多大」不是一种分类，混在一行读起来像四个尺寸。 -->
                <div class="kit-row">
                    <PressButton text="归档" label="归档：纯文字按钮" />
                    <PressButton icon="download" text="导出" label="导出：图标 + 文字" />
                    <PressButton icon="pin" label="纯图标按钮" />
                    <PressButton icon="play" text="开始" label="开始：主操作（块面灌朱）" seal />
                </div>
                <div class="kit-row">
                    <PressButton text="md" label="默认 26px" />
                    <PressButton text="lg" label="大一号 31px" size="lg" />
                </div>
                <p class="note">
                    上排是<b>块</b>（工具页图标格、左栏牌记），下面两排是<b>按钮</b>：同一块纸，
                    <code>seal</code> 把块面灌朱，一屏一枚。尺寸与槽按钮逐像素同值——
                    <b>但一凹一凸是两种材质，别混在同一行</b>。
                </p>
            </div>
        </div>
    </LedgerSection>
</template>

<style scoped>
/* ---------- 展示网格与格标题 ----------
 * 原先在 `blocks.css` / `base.css`（全局）。按 §2.4-14 的判据「会不会被第二个组件用」，
 * 它们只有这一页用——收进 scoped 之后，全局表里不再有「看起来别处也在用」的类。
 * `.note` 仍是全局的：四张开发卡都用它。
 */
.kit {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(330px, 1fr));
    gap: 14px;
}
.kit-cell {
    display: flex;
    flex-direction: column;
    gap: 7px;
    padding: 10px 11px 11px;
    border: var(--w-hair) solid var(--rule);
    background: var(--bg);
}
.kit-row {
    display: flex;
    align-items: center;
    gap: 7px;
    flex-wrap: wrap;
}
/* 统计条在真实页面里是通栏的一条（收益页、总览页都是），这里也让它撑满：
 * 四格等分要靠整行宽度才看得出，缩在一半里会像一张卡。 */
.demo-stats {
    flex: 1;
    min-width: 0;
}
/* 价格格在示例里撑满一行：它自己的看点是「数字 + 万 + 两侧加减」在这一整行里居中，
 * 靠着左边界摆的话看不出居中，只能说「这里有个格子」。 */
.kit-price {
    width: 100%;
}
.kit-cell .note {
    margin-top: 0;
}
/* 每格顶上那行小标题：次级墨、更宽的字距——读作「这一格的条目名」，不是内容。 */
.col-head {
    font-family: var(--font-ui);
    font-size: var(--fs-mini);
    letter-spacing: 0.18em;
    color: var(--muted);
}

/* 十二件按内容宽度自己排：够宽两列，不够一列。断点不写 `@media`
 * （CONVENTIONS §2.4-20），420 与 `.stack-pair` 同值——1024（正文 927）就能排两列。
 *
 * 每一格内部的演示行都按「两列时也放得下」摆：420 的格内容区约 432，
 * 最挤的是输入格那排（130 + 72 + 72 + 两处 gap = 288）与槽按钮（两枚一行约 190）。
 * 原先槽按钮是四枚一行，432 会折——折了就看不出「图标带字 / 纯文字」的形态差，
 * 所以拆成两行两枚，而不是给这一格吃满整行（`1 / -1` 会在奇数格处留下半行空洞）。 */
.atoms-kit {
    grid-template-columns: repeat(auto-fit, minmax(420px, 1fr));
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
