<script setup lang="ts">
/**
 * 左栏：一条书脊 + 一道竖槽。
 *
 * 导航不是八枚各自有厚度的胶囊——那是八个目标在抢同一份注意力。现在只有
 * **一道竖槽**和**一枚会滑动的朱印**：槽是目录，印是当前页。厚度全部收给拇指，
 * 其余七格只是档位，不描边、不成形。
 *
 * **没有折叠态。** 槽本身只有 48px 宽（整栏 72），再折一次得到 20px 的图标条
 * 没有意义，反而多出一整套状态、一段 localStorage 记忆和一个按钮。窄就是折。
 *
 * 栏顶是牌记（行楷「梦」＋朱印），48 见方、四边留白与栏内衬同值（12），于是它和
 * 下面那条同为 48 的槽落在同一列上。牌记是应用图标的**两个配色版**，随主题翻面：
 * 墨字版给亮色、纸白版给暗色；两版构图参数逐项相同
 * （`scripts/icon/make-logo-pair.py`），换主题时那只字不会挪位。
 *
 * 牌记的**块**是 `PressTile`（与工具页图标格同一块材质），里面才是那只字。
 * 换成压印之前，这里自己写过一套「细线框 + 2px 底边」的立体，三十几像素见方时读作
 * 「贴了张带框的图标」——线框把字圈住了，而工具页那边已经是「纸面被顶起一块」。
 * 一个应用里两套厚度语言，读起来就像两个时代的控件并排放着。
 *
 * 它不知道路由的存在：收 `items` 和 `current`，点出去一个 key。
 * 导航项形状见 `navigation.ts` 的 `NavItem`——导航与路由共用的单一真源。
 */
import { computed } from 'vue';
import VerticalSlider from './VerticalSlider.vue';
import SlotButton from './SlotButton.vue';
import PressTile from './PressTile.vue';
import markInk from '../../assets/mark-ink.png';
import markPaper from '../../assets/mark-paper.png';
import type { NavItem } from '../navigation';
import { useTheme } from '../composables/use-theme';
import { openExternal } from '../services/desktop';

const props = defineProps<{ items: NavItem[]; current: string }>();
/* 事件一律写成「名字 → 参数元组」。另一种写法 `{ (event: 'x', v: T): void }` 也能用，
 * 但两种并存时，`defineEmits` 那块就得先认一阵形状再看内容。选元组是因为它把参数
 * 写在名字右边，加第二个事件时不会读成「又一个函数签名」。 */
const emit = defineEmits<{
    'update:current': [key: string];
    /** 隐藏入口：三连击牌记。路由由外壳决定，栏本身不知道 `/dev` 这回事。 */
    'request-dev': [];
}>();

/** 项目地址。一个仓库、没有多环境之分，写死在这里比读配置省事。 */
const REPO_URL = 'https://github.com/zhijian521/mh-toolbox-rs';

const { isDark, toggle: toggleTheme } = useTheme();

/* `view: null` 的入口还没实现（见 `navigation.ts`）：字降一档色，仍可点（挂占位页）。
 * 判断留在这里而不是塞进 `VerticalSlider`——组件不该知道「有没有实现页面」这回事。 */
const options = computed(() =>
    props.items.map((item) => ({
        value: item.key,
        label: item.label,
        icon: item.icon,
        muted: !item.view,
        title: item.view ? item.label : `${item.label}（未实现）`,
    })),
);

/* 隐藏入口：三连击牌记进开发页。用原生 `event.detail`（同一元素上的连击计数），
 * 不自己攒时间戳——`detail` 的判定用的是系统双击间隔，跟用户的设置一致。
 *
 * 牌记本身仍是 `aria-hidden` 且不可聚焦：它不是按钮，不该出现在 Tab 序列和读屏目录里，
 * 也不该给用户一个「这里能点」的暗示。触屏没有三连击，所以开发页也支持 `#/dev` 直达。 */
function onBrandClick(event: MouseEvent) {
    if (event.detail === 3) emit('request-dev');
}
</script>

<template>
    <aside class="rail">
        <div class="rail-brand" aria-hidden="true" @click="onBrandClick">
            <PressTile class="rail-mark">
                <img class="rail-glyph" :src="isDark ? markPaper : markInk" alt="" />
            </PressTile>
        </div>

        <VerticalSlider
            class="rail-nav"
            label="主导航"
            :model-value="props.current"
            :options="options"
            @update:model-value="emit('update:current', $event)"
        />

        <div class="rail-foot">
            <SlotButton
                :label="isDark ? '切到日间' : '切到夜间'"
                :icon="isDark ? 'sun' : 'moon'"
                @click="toggleTheme"
            />

            <SlotButton
                label="在浏览器里打开项目仓库"
                icon="github"
                @click="openExternal(REPO_URL)"
            />
        </div>
    </aside>
</template>

<style scoped>
/* ---------- 书脊 ----------
 * 一条比内容区亮的板，右侧是一条受光的棱：内边缘一条高光，板身向外投一道淡影。
 * 光从上方来，所以顶部再压一道极淡的竖向渐变，板才不会像贴纸。
 *
 * 栏宽 72 = 轨道 48 + 左右各 12 的内边距，且整体乘 `--fs-scale`：轨道宽也乘了
 * 同一个系数，两边一起长，缝才不会在「较大」档上错开。
 *
 * ## 槽与牌记：同宽、同列、四边留白同值（2026-11-06）
 *
 * 用户：「整体组件宽度大一点，这样里面的滑块就不会因为加边距显得很小」。滑块宽 = 槽宽
 * 减两侧内缩，所以要让滑块宽，只能让**槽**变宽，一路加到 48。
 *
 * 牌记与槽**同宽**（用户：「logo 图标的大小和侧边菜单组的外层一样宽，不是里面的选中按钮」），
 * 于是它到左右栏边的距离天然等于栏内衬 12。用户再要求「外面距上下左右保持一致」之后，
 * 牌记区的上下也只能各留 12 —— 区高因此是 48 + 24 = **72**，由 `--rail-brand-h` 算出来。
 *
 * 这条等式是死的：方块是方的、左右留白 = (栏宽 − 方块) / 2，要让上下也等于它，
 * 区高就必然等于栏宽。想矮一点只能缩方块或缩栏宽，缩留白是缩不出来的。
 */
.rail {
    /* 2026-11-06 加宽三档：槽 34 → 38 → 40 → 48、栏 50 → 58 → 64 → 72。
     * 用户三轮：「稍微加宽一点」→「还可以再宽一点，滑块边距也大一点」→
     * 「整体组件宽度大一点，这样滑块就不会因为加边距显得很小」。四边内衬 8 → 10 → 12 后不再动。 */
    --rail-slot-w: calc(48px * var(--fs-scale));
    /* 栏内衬：左右两侧、牌记区的上下留白、栏底都用它，一处改全部跟。 */
    --rail-pad: calc(12px * var(--fs-scale));
    /* 牌记区 = 槽宽 + 上下各一道内衬（详见 `.rail-brand`）。写在这里是因为栏顶那层
     * 受光渐变要照它收口，两处共一个数才不会差几个像素。 */
    --rail-brand-h: calc(var(--rail-slot-w) + var(--rail-pad) * 2);

    display: flex;
    flex: none;
    flex-direction: column;
    align-items: center;
    width: calc(72px * var(--fs-scale));
    /* 顶边距交给牌记自己（它的区高里已经含了上内衬），栏不再自带 top padding——
     * 两处各留一点的话，那道账线就永远差几个像素对不齐。 */
    padding: 0 var(--rail-pad) var(--rail-pad);
    background-color: var(--paper);
    /* 顶部受光只铺到牌记底边。强度收在变量里、暗色再压一档（见下面 `html.dark`）：
     * 满强度 `--bevel-hi` 在暗色是 8% 白叠在深纸上，足以把栏顶糊成一块浅色纸。 */
    --rail-sheen: color-mix(in srgb, var(--bevel-hi) 45%, transparent);
    background-image: linear-gradient(180deg, var(--rail-sheen), transparent var(--rail-brand-h));
    /* 右棱：一条受光的断面。**栏的右侧不压任何阴影**（2026-11-06 用户：「右边是不是有
     * 阴影设置，取消掉这个」）。原来有两条：栏内 5px 的暗带（`inset -4px 0 6px -5px`）
     * 与栏外 3px 纸断面 + 20px 散开。后者其实一直没画出来——`.app` 的背景把兄弟节点的
     * 外影整个盖住了（像素实测 x=72 之后是纯 `--bg`）；真正被看见的是栏内那道：纸色 248
     * 贴边压到 232，在通高的长边上读作「一道灰边」。栏与内容区本来就靠 `--paper` / `--bg`
     * 的色差分开，再加一道软暗只会显脏。注释写在这里而不是 `box-shadow` 里：prettier 会把
     * 行内注释与值挤成一行。 */
    box-shadow: inset -1px 0 0 var(--bevel-hi);
    /* 不滚动：槽一定要整条可见，「第几档」靠的是整条槽的比例。
     * 允许滚动的代价是拇指会跑到视口外，位置感失效；而 8 档的高度是定死的，
     * 所以高度交给窗口兜底——`src-tauri/src/lib.rs` 的 `min_inner_size` 取「较大」字号
     * （fs = 1.1）时的实测需求（侧栏 765 + 栏外那 40 的标题条 = 805，给到 812），
     * 见那里的注释与实测表。
     * 这里用 hidden 而不是 auto：既然保证放得下，就不要再留一条可能出现的滚动条。 */
    overflow: hidden;
}

/* 暗色下这层受光几乎要消失：`--bevel-hi` 在暗色是 18% 白，乘 45% 之后仍有 8%，
 * 在深色纸上的视觉当量远高于亮色那 37%——所以按主题分档，压到 14%（≈2.5% 白）。 */
:global(html.dark .rail) {
    --rail-sheen: color-mix(in srgb, var(--bevel-hi) 14%, transparent);
}

/* ---------- 牌记 ----------
 * **牌记区是一个正方形：边长 = 栏宽**（2026-11-06 用户：「外面距上下左右保持一致」）。
 * 方块 48 见方、左右各留 12（栏宽 72 减去槽宽 48 的一半），要上下也留 12，区高就只能
 * 是 48 + 12 + 12 = 72。这不是可以挑的数——`--rail-brand-h` 直接由「槽宽 + 两侧内衬」
 * 算出来，改槽宽或栏内衬时它会自己跟，不用记第二个数。
 *
 * 代价说明白：牌记区从 56 涨到 72，栏高多 16（1.1 档是 17.6），**最小窗口高度跟着涨**
 * （`src-tauri/src/lib.rs` 的 `MIN_HEIGHT` 与那张实测表要一起改）。上一版是「上 0、下 8」，
 * 靠 `margin-bottom` 把留白全塞在下面——那时只求印与目录隔开一段，没求四边等宽。
 *
 * **不画下边框。** 加一条 `--rule` 账线会横穿字的下沿，把牌记切成一个「头部区块」；
 * 可上面放的不是区块名，是一枚直接落在纸上的标。
 *
 * 图案取自应用图标（行楷「梦」+ 右下朱印），但**去掉了图标的圆角方块底**：
 * 那块底在这个尺寸下只剩一圈比纸略深的边，读作「贴了张图标」；块由 `PressTile` 给，
 * 面、棱、影都有出处，图只负责字本身。
 */
.rail-brand {
    display: flex;
    flex: none;
    align-items: center;
    justify-content: center;
    box-sizing: border-box;
    width: 100%;
    height: var(--rail-brand-h);
}

/* 块 = `PressTile`，这里只给几何。
 *
 * **48×48 的方印**（2026-11-06 用户：「logo 图标的大小和侧边菜单组的外层一样宽，
 * 不是里面的选中按钮」→「logo 的高度也调整成和宽度一样」）：宽取槽宽、高取同一个数，
 * 于是栏顶是一枚正方形印，与下面那条同为 48 的槽同宽。
 *
 * **位置交给父级的 `center`**：牌记区已经是 72 的正方形，居中之后四边各留 12，
 * 不再用 `margin-bottom` 单独撑下方留白（那正是「上下 12、左右 12」做不到的原因）。
 *
 * **圆角取 `--r-2`**，与目录槽、格里的朱印同一个值：栏里三样东西（标、槽、印）的
 * 转角必须在同一条曲线上，否则 48px 见方时 3px 与 4px 的差别一眼就能看出
 * 「这个角是另一种东西」。圆角不乘 `--fs-scale`——绝对曲率，槽那边也没乘。
 *
 * **落地影走满档**（`--tile-drop: 1`，原先是 0.85）：栏底色就是 `--paper`，块面与栏底
 * **同色**，凸起几乎全靠四条棱与这道影撑着。0.85 时影只有 2.5px，块读作「一张平贴纸」；
 * 缩到 0.6 更只剩 1px 一条。满档之后块才像「栏上压着的一块」。
 */
.rail-mark {
    --tile-w: var(--rail-slot-w);
    --tile-h: var(--rail-slot-w);
    --tile-r: var(--r-2);
    --tile-drop: 1;
    /* 块面：亮色就跟纸同色（纸已经是最亮的，再亮只能发灰），暗色必须比纸**亮一档**。
     * 栏底色就是 `--paper`，块面若也用 `--paper`，暗色下整块会消失得只剩那只字——
     * 工具页没有这个问题，因为那边的页面底是 `--bg`，本来就比纸暗。
     * `light-dark()` 一次写完两主题：`--ink` 在暗色就是纸白，掺 14% 得到 #353128 的面。 */
    --tile-face: light-dark(
        color-mix(in srgb, var(--paper) 92%, transparent),
        color-mix(in srgb, var(--paper) 86%, var(--ink))
    );
}

/* 图形占块的 72%：图本身自带 3% 透明边（`make-logo-pair.py` 的 EDGE），满铺会贴到
 * 下沿那 2px 厚度上；72% 让四周露出约 6.7px 的面，字才像压在这块纸的中间。 */
.rail-glyph {
    display: block;
    width: calc(var(--rail-slot-w) * 0.72);
    height: auto;
}

/* 槽不参与 flex 分配：让它在栏顶按自身高度摆着，底部的工具条才不会被推下去。
 * **槽顶与页头的下边框同高、不留间距**：牌记区高度与 `PageHeader` 等值，页头底线
 * 就是牌记的底边，槽从这里起排，那条账线才在视觉上「拐个弯继续走」。留 6px 的话，
 * 槽顶比右侧横线低半格，接缝处永远差一个台阶。 */
.rail-nav {
    /* 槽宽由栏给，组件自己那份 34 只在「无父级」时兜底。 */
    --vs-w: var(--rail-slot-w);
    flex: none;
}

/* ---------- 底部 ----------
 * 一枚主题、一枚仓库，竖排居中，与轨道同一条中轴。
 *
 * `margin-top: auto` 把它压到栏底：目录贴顶、工具沉底，中间那段空白是「留白」
 * 而不是「没排完」。不用 `justify-content: space-between`——那会让槽自己也被推到
 * 中部，八档的位置就随窗口高度漂了。
 *
 * 尺寸 30px 是量出来的：一开始轨道只有 34，30 与槽几乎同宽，读作「槽的延续」；
 * 槽一路加宽到 48 之后它显得细，但**没跟着放大**——两枚各加 4px 就是 8px 栏高，
 * 而这 8px 只能从最小窗口高度里出。保持正方形：`SlotButton` 的印面语义要求宽高同值，
 * 拉长一枚就成了色块。
 *
 * **间距 8 → 6、上衬 8 → 6**（2026-11-06）：槽加了上下内衬、牌记加了下方留白之后，
 * 「较大」字号档只剩 2.4px 的缝——再矮一点菜单就压到这两枚按钮上。这 4px 是从这里
 * 还回去的。后来牌记区又因为「四边留白同值」涨到 72，那 16px 这里还不动，只能抬
 * `MIN_HEIGHT`（796 → 812，见 `lib.rs` 的实测表）。
 */
.rail-foot {
    display: flex;
    flex: none;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    margin-top: auto;
    padding-top: 6px;
    border-top: var(--w-hair) solid var(--rule);
    --slot-h: calc(30px * var(--fs-scale));
    --slot-w: calc(30px * var(--fs-scale));
}
</style>
