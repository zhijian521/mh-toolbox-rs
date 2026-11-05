<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import LedgerSection from '../../components/LedgerSection.vue';
import NumTag from '../../components/NumTag.vue';
import PressTile from '../../components/PressTile.vue';
import TogglePills from '../../components/TogglePills.vue';
import { notify } from '../../composables/use-notify';
import { quickItems, type QuickItemEntry } from '../../services/game-data';
import { quickItemIcon } from '../../services/game-icons';
import { compactAmount, recordSummary } from './income';
import { useIncome } from './income-store';
import { useRoster } from '../characters/roster';

/**
 * 物品速记：这一页的主入口。
 *
 * **点一下就记一条**——固定价按预设单价直接入账；没有单价或浮动价的物品先弹一次
 * 单价窗。这是旧系统最顺手的一块，也是这次重做的核心：表单式的「记一笔」把
 * 「选物品 → 填单价 → 填日期 → 保存」四步压缩成一步。
 *
 * ---- 三件必须显式做对的事 ----
 * 1. **记给谁要看得见**：一排常驻选项，不是弹窗里选。归到谁头上由它决定，
 *    藏起来就会出现「记了半天全记到上一个号头上」。
 * 2. **点完要有回执**：刚记的那一格亮一枚朱点（1.6 秒后褪）+ 一句提示。
 *    连点两个物品时，没有这个反馈就分不清哪下成了。
 * 3. **右键改价，不藏在菜单里**：单价是这套东西唯一的「配置」，改价必须和记一条
 *    同样近。没有它，用户遇到行情变了只能不断弹窗。
 *
 * 需要填单价的两种情形（没定价 / 浮动价）交回页面处理：弹窗是页面级的东西，
 * 一个卡片里不该长出一个浮层。
 */
const emit = defineEmits<{
    /** 需要填单价：`thenAdd` 为真表示填完就记一条。 */
    'need-price': [item: QuickItemEntry, mode: 'fixed' | 'variable', thenAdd: boolean];
}>();

const { prices, target, recordEntry, setTarget } = useIncome();
const { roster } = useRoster();

/* 清单在启动时已装好（`main.ts` 等 `loadGameData()` 完成才挂载），这里取一次就够。
 * 模板里每次渲染都调 `quickItems()` 也能跑，但那是 59 项的表，没必要每帧找一遍。 */
const groups = quickItems();

/**
 * 「记给谁」是一组**可以同时按下几枚**的开关，所以用 `TogglePills`（多选胶囊），
 * 不是 `SegmentedPills`（那九个里只能选一个）。
 *
 * 早先这里是九个 `<button aria-pressed>`、后来是单选胶囊：单选的问题在于「几个号
 * 一起摆摊」时，一笔收入只能落给一个人。现在可以按几个、金额按人平分
 * （`splitAmount`，尾差按币给排在前面的，总额一分不差）。
 *
 * 材质与键盘行为都不在这里写：`.bevel-pill` 的四件套与「整组一个 Tab 停靠点」是
 * 全站胶囊共用的那一份。
 */
const targetOptions = computed(() => [
    { value: '', label: '不指定' },
    ...roster.value.map((one) => ({ value: one.id, label: one.name })),
]);

/**
 * 「不指定」在数据里是**空数组**（一条都不选），而在胶囊组里它需要是一枚能按的格子。
 * 所以两边做一次转译：选中「不指定」= 清空选择，反过来空数组就让「不指定」亮着。
 * 不这么做的话，「一个都没选」与「选了不指定」就成了两种状态，而它们意思完全一样。
 */
const NOTHING = '';
const pillsValue = computed(() => (target.value.length ? target.value : [NOTHING]));

/**
 * 「不指定」在数据里是**空数组**（一个都不选），而在胶囊组里它需要是一枚能按的格子。
 * 所以两边做一次转译，否则「一个都没选」与「选了不指定」就成了两种状态，而它们
 * 意思完全一样。
 *
 * 难点在于：按「不指定」与「按着一个角色再按下不指定」，产出的数组都含空串，意图却相反
 * ——前者是「全部取消」，后者是「从『不指定』切到某个号」。区分靠**按之前它亮不亮**：
 *   - 按之前「不指定」亮着、现在仍含空串 → 新按下的是一枚角色 → 去掉空串、保留角色；
 *   - 按之前「不指定」没亮、现在含空串 → 刚刚按下它 → 清空全部。
 * 判错任一方向都会让「点了不指定却还记给刚才那个号」——账面上看不出来，得等到按人合计。
 */
function onPills(next: string[]) {
    const hadNothing = pillsValue.value.includes(NOTHING);
    const hasNothing = next.includes(NOTHING);
    if (hasNothing && !hadNothing) {
        setTarget([]);
        return;
    }
    setTarget(next.filter((one) => one !== NOTHING));
}

/**
 * 选中的那几个角色，可能有的已经被删掉了。
 *
 * `target` 是模块级的（切页回来不用重选），而角色是另一页能删的：删完回到收益页，
 * `target` 仍指着那些 id，之后每一条都会**静默记给不存在的人**——账面上看是
 * 「这笔没归属」，实际库里躺着一个野 id，按人合计时永远对不上。
 *
 * 挂载时校正一次，之后跟着名册变。**不在这里写「删角色时级联清理」**：账不能因为
 * 改了个名字就少一笔（见 `income.ts` 的 `IncomeEntry` 注释），这里只保证**新记的**
 * 不再往野 id 上落。
 */
function validateTarget() {
    const alive = target.value.filter((id) => roster.value.some((one) => one.id === id));
    if (alive.length !== target.value.length) setTarget(alive);
}
validateTarget();
watch(roster, validateTarget);

/** 刚记过的那一格（物品 id）。0 表示没有，避免用 null 判两次。 */
const hit = ref(0);
let hitTimer = 0;

function flash(itemId: number) {
    hit.value = itemId;
    window.clearTimeout(hitTimer);
    hitTimer = window.setTimeout(() => {
        hit.value = 0;
    }, 1600);
}

/* 组件走掉时把回执的定时器一起收掉：它回调里只写自己那个 ref，不会报错，
 * 但留着就是一个「已卸载的组件还在排队改状态」的尾巴。 */
onBeforeUnmount(() => window.clearTimeout(hitTimer));

function pick(item: QuickItemEntry, mode: 'fixed' | 'variable') {
    if (mode === 'variable') {
        emit('need-price', item, 'variable', true);
        return;
    }
    const price = prices.value[item.id] ?? 0;
    if (!price) {
        /* 第一次遇到这件物品：先让它定个价，定完直接记（`thenAdd`）。 */
        emit('need-price', item, 'fixed', true);
        return;
    }

    const result = recordEntry({ item: item.name, amount: price });
    if (!result.ok) {
        notify.error(result.error);
        return;
    }
    flash(item.id);
    notify.success(recordSummary(item.name, result.entries));
}

/** 右键：只改价，不记账。 */
function editPrice(item: QuickItemEntry) {
    emit('need-price', item, 'fixed', false);
}

function priceLabelOf(item: QuickItemEntry): string {
    const price = prices.value[item.id] ?? 0;
    /* 「4.6 万」→「4.6万」：窄签里那个空格白占半个字，见 `compactAmount` 的注释。 */
    return price > 0 ? compactAmount(price) : '未设价';
}
</script>

<template>
    <LedgerSection title="物品速记">
        <template #actions>
            <div class="targets">
                <span class="lbl">记给</span>
                <!-- 大圆角（默认 `pill`）：这一排要读成「几枚可以按下去的印」，
                     小圆角会让它读成「一排方头小按钮」——与旁边的统计格子、卡片边
                     同属方角家族，反而看不出它是按的。 -->
                <TogglePills
                    :model-value="pillsValue"
                    :options="targetOptions"
                    label="这笔账记给谁，可以多选"
                    @update:model-value="onPills"
                />
            </div>
        </template>

        <div class="group-label"><b>固定价格</b>· 按单价入账 · 右键改价</div>
        <div class="grid">
            <button
                v-for="item in groups.fixed"
                :key="item.id"
                type="button"
                class="item"
                :class="{ hit: hit === item.id }"
                :title="`${item.name} · ${priceLabelOf(item)}`"
                :aria-label="`${item.name}，${prices[item.id] ? `单价 ${priceLabelOf(item)}` : '未设价'}，点一下记一条`"
                @click="pick(item, 'fixed')"
                @contextmenu.prevent="editPrice(item)"
            >
                <PressTile class="item-tile">
                    <img :src="quickItemIcon(item.file)" alt="" loading="lazy" />
                </PressTile>
                <!-- 没定价就**整行不出现**（2026-11-04 用户）：价格在块外的下面，
                     块本身只包图标——空着一行会把它和旁边「有价」的格子拉出高低差。
                     块贴顶排列，所以缺一行只表现为「这块下面短一点」，图标仍在同一条线上。
                     读屏与悬停的「未设价」在 `aria-label` 与 `title` 里，眼睛看图标就够。

                     签用 `NumTag`（`.num-slot` 淡槽，材质在 `base.css`）：块是凸起来的一块纸，
                     价格是纸上挖出去的一格——一凸一凹，物件与读数各自的语言。 -->
                <NumTag v-if="prices[item.id]" class="p">
                    <span class="v">{{ priceLabelOf(item) }}</span>
                </NumTag>
            </button>
        </div>

        <div class="group-label"><b>不固定价格</b>· 每条现填 · 不入单价表</div>
        <div class="grid">
            <button
                v-for="item in groups.variable"
                :key="item.id"
                type="button"
                class="item"
                :title="`${item.name} · 每次填单价`"
                :aria-label="`${item.name}，点一下填${item.name === '金币' ? '金额' : '单价'}`"
                @click="pick(item, 'variable')"
            >
                <PressTile class="item-tile">
                    <img :src="quickItemIcon(item.file)" alt="" loading="lazy" />
                </PressTile>
            </button>
        </div>
    </LedgerSection>
</template>

<style scoped>
/* ---------- 记给：一排互斥选项 ----------
 * 材质、选中态、键盘行为全在 `SegmentedPills` 里（`.pill-group` + `.bevel-pill`，
 * 与属性页、侧栏同一套）。这里只剩「摆在标题行右侧」这一件事。
 *
 * `min-width: 0` 是为窄窗口留的：`.pill-group` 内部不换行，主栏窄到装不下时
 * 会让它顶出去。角色是两三个号时放得下，多了才会挤——那时该考虑的是
 * 把这一排收进「记给」的下拉，而不是让它换行成两排（换行会把标题行撑高）。 */
.targets {
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
}
.lbl {
    flex: none;
    color: var(--muted);
    font-size: var(--fs-mini);
    letter-spacing: 0.1em;
}

/* ---------- 标题行的两样谁该让位 ----------
 * 这一行有两样：标题、「记给」。窗口窄到放不下时，`flex` 默认对两者一视同仁地缩，
 * 实测 900px 宽下最先崩的是**标题**——「物品速记」被压成两行，读起来像两块东西。
 *
 * 所以标题 `flex: none`（它是这一块的招牌，换行就读不出是一块），「记给」也不缩
 * （截掉半枚胶囊就认不出记给了哪个号，而这一页最怕记错人）。真挤不下时该做的是
 * 把这一排收进下拉，不是让它们互相抢宽度。
 *
 * 这一行原先还有第三样 `hint`（「点一下记一条 · 右键改价」），2026-11-04 用户让删掉，
 * 于是那条「hint 截断」的让位规则一并删了——没有 hint，就没有可让的那一份。
 *
 * 这是**使用方**该管的事：宽度压力来自这页那排胶囊，不该让 `LedgerSection`
 * 去猜每个调用方的取舍——物价页那一行、角色卡那一行，谁让位是不一样的。 */
:deep(.section-head h2) {
    flex: none;
}

/* ---------- 两组格子 ---------- */
/* 分组标题：**上下同距**（2026-11-04 用户：「上下边距保持一致」）。
 *
 * 原来是 `10px 0 7px`——标题离上一排远、离自己那一排近，整块读起来像「标题被拉向下面的
 * 格子」，两组之间的呼吸也不齐。改成 9/9：上面离上一排的落影 9，下面到格子 9，
 * 一条竖线上三处间距相等。
 *
 * 首组仍是 `margin-top: 0`：它上面是 `LedgerSection` 的标题行，那道已经有
 * `margin-bottom: 12px`，再叠 9 就是 21，卡片会从顶上裂开一条缝。 */
.group-label {
    display: flex;
    align-items: baseline;
    /* `gap: 0` 而不是 8：这一行现在是一整句（三小段用同一个 `·` 隔开）。留 8 的话，
     * `<b>` 与后面文本之间那道缝会比句内空格宽一倍，读起来像「固定价格」是个标题、
     * 后面另起一句。段与段统一靠 `b` 的 `margin-right` 与句内空格对齐。 */
    gap: 0;
    margin: 9px 0;
    color: var(--muted);
    font-size: var(--fs-xs);
    letter-spacing: 0.06em;
}
.group-label:first-of-type {
    margin-top: 0;
}
.group-label b {
    /* 4 与 11px 字下的一个汉字空格同宽：`固定价格 · 按单价入账 · 右键改价`
     * 三个 `·` 前后的呼吸因此一致。 */
    margin-right: 4px;
    font-weight: 400;
    color: var(--ink-2);
}
/* 附注（「右键改价」「不入单价表」）原先推在行尾，用 `.tail` 的 `margin-left: auto`
 * 隔开——读作「左边一句分组名，右边一条备注」。
 * 2026-11-04 用户让把它们并回分组名那一句、再精简，于是 `.tail` 整条删了：
 * 现在这一行就是一句话，用同一个 `·` 分隔三小段，不需要左右分栏。 */

/* 列宽 50、缝 4 —— 一格之间的**水平空隙收到 11 上下**。
 *
 * 2026-11-04 用户连着三句在收这一处：「图标偏上、左右空白」→「压印按钮小一点包住
 * 图标即可」→「左右间距还是有点大，再小一点」。
 *
 * 前两句解决的是**块**（88 宽 62 高 → 44 见方），这一句解决的是**块与块之间的空**：
 * 上一版列 56 + 缝 6，1600 宽下排 19 列、列宽 57.6，块 44 居中 ⇒ 左右各留 6.8，
 * 相邻两块之间是 6.8 + 6 + 6.8 = 19.6，接近块宽的一半。看着像「一件件摊开的货」。
 *
 * 现在列 50 + 缝 4：22 列、列宽 50.9，块两侧各 3.5，间距约 10.9。
 *
 * **50 是下限，不能再小**：块是 44 见方，块下面那枚价格签要装得下「128.5万」这种长价
 * （`--fs-mini` 下约 53），列宽再窄就要靠溢出压到邻格上。`auto-fill` 仍负责「窗口变宽
 * 多一列」而不是把格子拉长。 */
.grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(50px, 1fr));
    /* 行距仍 6、列距收到 4：用户说的是**左右**间距。行距不能跟着收——块下面还有一枚
     * 价格签，上一排的签与下一排的块之间只剩 6，再压就贴着上一排的落影了。 */
    gap: 6px 4px;
}

/* ---------- 一格物品 ----------
 * 外壳是一个「块 + 下面一行价」的竖条：**材质全在 `PressTile` 里**（一块光从左上方来的
 * 压印纸，悬停提亮、按下被压回纸里），价格落在纸的**外面**。
 *
 * 这一版是 2026-11-04 第二次收：用户要「压印按钮小一点包住图标即可，价格显示在外面的
 * 下面」。上一版把价格装在块里，块就得跟着「图 + 价」定高定宽，结果块总比图标大一圈。
 * 拆开之后职责清楚：**块只负责图标**（44 见方，图标 32 + 四周 6），价格是块下面的一行字。
 *
 * 上下两段贴顶排：`align-content: start` 是关键——`justify-items: center` 只负责水平。
 * 缺价格那一格少了第二段，块仍贴着这一行的上沿，所以整排图标在同一条水平线上。
 */
.item {
    position: relative;
    display: grid;
    justify-items: center;
    align-content: start;
    gap: 3px;
    padding: 0;
    border: 0;
    background: none;
    font-family: inherit;
    cursor: pointer;
    user-select: none;
}
.item-tile {
    /* **44 见方，只包图标**。宽高都写死而不是 `100%`：块是一块「印」，尺寸不该跟着
     * 列宽伸缩——列宽会随窗口变，块不会。 */
    --tile-w: 44px;
    --tile-h: 44px;
    --tile-r: var(--r-2);
    /* 落影 0.55：44 的块比原先 76 的小一半，0.7 的 2.1px 硬影压在这么小的块上会
     * 读成「掉了块垫子」。19 列密排时还要再轻一点，块与块之间才留得住纸面。 */
    --tile-drop: 0.55;
    /* 块面与卡面同色（`--paper-2`）：2026-11-05 卡面下沉到这一档之后，块面**不再靠深浅差**
     * 与卡面区分——比纸更亮没有余量（纸上没有比纸更亮的纸），比纸更暗又会读成凹槽。
     * 59 格并排时靠的是**上亮下暗的棱 + 落地影**，与角色卡的装备块、物价卡同一个做法。
     * 悬停才回到 `--paper`（比卡面亮一档），那是「这一块被压实了」的提亮语义，
     * 也是 `PressTile` 的默认值。 */
    --tile-face: var(--paper-2);
    --tile-face-hover: var(--paper);
    /* 朱点要相对**块**定位，不是相对整条（含价格那一段）。 */
    position: relative;
}
/* 32：块里只有图标，它就是这一格的全部身份（口令牌、兽决这类图本身很像，再小认不出）。
 * 44 的块配 32 的图，四周各留 6——「包住」，不是「框住」。 */
.item img {
    width: 32px;
    height: 32px;
    object-fit: contain;
    /* 图进纸面前先「纸化」一档：原图是游戏里的高饱和贴图，直接贴像一张贴纸。
     * 只降到「认得出是什么」，不是做成单色。 */
    filter: sepia(0.22) saturate(0.86) contrast(0.98);
    opacity: 0.94;
}
/* 暗色下原图比纸亮一大截，满屏小图会变成一片小白点；压一档亮度回到「纸上的图」。 */
:global(html.dark) .item img {
    filter: sepia(0.18) saturate(0.8) brightness(0.86);
}
/* 价格在块外：块下面**一枚淡槽签**（`NumTag` → `.num-slot`，材质在 `base.css`）。
 *
 * 2026-11-04 用户：「价格数字加万字，我们使用票面行数字那类似的背景修饰一下」。两件事：
 *   ① 数值与「万」连写（空格去掉，见 `priceLabelOf`）；
 *   ② 套票面行读数签那层材质——上面是凸起的一块纸、下面是纸上挖出的一格，
 *      一凸一凹，一眼分得开「物件」与「它的价」。
 *
 * `--tag-h` 算 15：签高与字号保持票面行 sm 那档的 1.5 倍（签 18 / 字 12），
 * 这里字是 `--fs-mini`（10），15 正好；上下各余 2.5，仍读得出是一格槽。
 * 再矮压不住字，再高就抢上面那块印的份量。
 * `min-width` 跟块同宽（44）：一排签的长短随价格变，但短的不该比它上面的块还窄。
 */
.item .p {
    --tag-h: calc(15px * var(--fs-scale));
    min-width: 44px;
    font-size: var(--fs-mini);
    line-height: 1;
}
/* 字色写在里面的 span 上，不写签的根：`NumTag` 作为通用器件把根色定成墨（那是它
 * 在角色卡上的用法），这里要的是「读数赭」。写在内层就压得过，也不必抬高特异性去抢。 */
.item .p .v {
    color: var(--num);
}
.item:focus-visible {
    outline: var(--ring);
    outline-offset: var(--ring-offset);
}
/* 没价格的那一格**什么都不印**，也不整格变灰：它本来就存在，只是还没定价；
 * 退格色会把「还没定价」读成「这件不存在」。悬停时 `title` 会说「未设价」。 */

/* 刚记过：朱点 + 一圈朱边，1.6 秒后褪。没有它，连点两个物品会分不清哪下成了。
 *
 * 两个伪元素都挂在 `.item-tile` 上，不是 `.item` 上：后者现在包含块下面那一行价格，
 * 朱边圈住整条的话，会连「4.6 万」一起框进去，读起来像「这行字被选中了」。
 *
 * 朱边用 `::before` 单独画：`PressTile` 的四条棱是靠 inset 阴影叠出来的，
 * 往它身上再压一条 outline 会把最下面那道厚边盖掉。 */
.item.hit .item-tile::before {
    content: '';
    position: absolute;
    inset: -1px;
    border: 1px solid color-mix(in srgb, var(--cinnabar) 55%, var(--rule-2));
    border-radius: calc(var(--r-2) + 1px);
    pointer-events: none;
}
.item.hit .item-tile::after {
    content: '';
    position: absolute;
    top: 3px;
    right: 3px;
    width: 5px;
    height: 5px;
    border-radius: 50%;
    background: var(--cinnabar);
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--cinnabar) 18%, transparent);
}
</style>
