<script setup lang="ts">
/**
 * 左栏：一条书脊 + 一道竖槽。
 *
 * 导航不再是八枚各自有厚度的胶囊——那是八个目标在抢同一份注意力。
 * 现在只有**一道竖槽**和**一枚会滑动的朱印**：槽是目录，印是当前页。
 * 厚度全部收给拇指，其余七格只是档位，不描边、不成形。
 *
 * 为什么不再有折叠：
 * 槽本身只有 34px 宽（整栏 50px），比原来「收起后」的 58px 还窄一半。
 * 再折一次得到 20px 的图标条没有意义，反而多出一整套状态、一段 localStorage
 * 记忆和一个按钮。**窄就是折**，所以折叠连同它的状态一起删掉了。
 *
 * 底部不再重复版本号：标题栏右侧已经是 `RUST · V0.1`（`TitleBar.vue`），
 * 50px 宽的栏里再竖排一次只是把同一句话写两遍。
 *
 * 栏顶是牌记（应用图标：行楷「梦」＋朱印），它的高度与内容区页头 `PageHeader` 严格等值，
 * 所以两条账线连成一条、整窗读作一页纸而不是「标题栏 + 左栏 + 右栏」三块拼的。
 *
 * 牌记是应用图标的**两个配色版**，随主题翻面：墨字版给亮色、纸白版给暗色。
 * 两版的构图参数逐项相同（见 `design/icon/ink/make-logo-pair.py`），所以换主题时
 * 那只字不会挪位——读者看到的是一张图翻了面，不是两张图。
 *
 * 它不知道路由的存在：收 `items` 和 `current`，点出去一个 key。
 * 导航项形状见 `navigation.ts` 的 `NavItem`——那是导航与路由共用的单一真源。
 */
import { computed } from 'vue';
import VerticalSlider from './VerticalSlider.vue';
import SlotButton from './SlotButton.vue';
import markInk from '../../assets/mark-ink.png';
import markPaper from '../../assets/mark-paper.png';
import type { NavItem } from '../navigation';
import { useTheme } from '../composables/use-theme';
import { openExternal } from '../services/desktop';

const props = defineProps<{ items: NavItem[]; current: string }>();
const emit = defineEmits<{ (event: 'update:current', key: string): void }>();

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
</script>

<template>
    <aside class="rail">
        <div class="rail-brand" aria-hidden="true">
            <img class="rail-mark" :src="isDark ? markPaper : markInk" alt="" />
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
 * 宽 50px 是「轨道 34 + 左右各 8 的内边距」量出来的，且整体乘 `--fs-scale`：
 * 轨道宽也乘了同一个系数，两边一起长，缝才不会在「较大」档上错开。
 */
.rail {
    display: flex;
    flex: none;
    flex-direction: column;
    align-items: center;
    width: calc(50px * var(--fs-scale));
    /* 顶边距交给牌记自己（它有页头那一套 padding），栏不再自带 top padding——
     * 两处各留一点的话，那道账线就永远差几个像素对不齐。 */
    padding: 0 calc(8px * var(--fs-scale)) calc(8px * var(--fs-scale));
    background-color: var(--paper);
    /* 顶部受光只铺到牌记底边。强度收在变量里，暗色下再压一档（见 `.dark` 那段）：
     * 原来满强度 `--bevel-hi` 铺 96px，亮色下没问题，暗色下却是 8% 白叠在深纸上，
     * 足以把牌记区从 #2a2622 提到 #3a3733——栏顶像糊了一块浅色纸
     * （用户截图指出「黑的时候上面偏白」）。
     */
    --rail-sheen: color-mix(in srgb, var(--bevel-hi) 45%, transparent);
    background-image: linear-gradient(
        180deg,
        var(--rail-sheen),
        transparent calc(56px * var(--fs-scale))
    );
    box-shadow:
        inset -1px 0 0 var(--bevel-hi),
        inset -3px 0 5px -4px var(--bevel-lo),
        3px 0 10px -3px var(--shadow);
    /* 不滚动：槽一定要整条可见，「第几档」靠的是整条槽的比例。
     * 允许滚动的代价是拇指会跑到视口外，位置感失效；而 8 档的高度是定死的，
     * 所以高度交给窗口兜底——`src-tauri/src/lib.rs` 的 `min_inner_size` 按
     * `36fs + 11 + 666fs` 取「较大」字号（fs = 1.1）时的需求值，见那里的注释。
     * 这里用 hidden 而不是 auto：既然保证放得下，就不要再留一条可能出现的滚动条。 */
    overflow: hidden;
}

/* 暗色下这层受光几乎要消失：`--bevel-hi` 在暗色是 18% 白，乘 45% 之后仍有 8%，
 * 在深色纸上的视觉当量远高于亮色那 37%——所以按主题分档，压到 14%（≈2.5% 白）。
 * 牌记区与标题栏回到同色，栏顶不再是一块亮面。 */
:global(html.dark .rail) {
    --rail-sheen: color-mix(in srgb, var(--bevel-hi) 14%, transparent);
}

/* ---------- 牌记 ----------
 * 栏顶这枚标是这本书的书名，下面那道槽是它的目录。
 *
 * 高度直接取 `--page-head-h`（`tokens.css`）：那一枚就是「padding 10 + 标题行框
 * （`--fs-xl` × 1.15）+ 9 + 1px 账线」的算式，两处引同一个变量，改页头只改那一处。
 * 不是「看起来差不多」——牌记区与内容区页头等值，下面那道槽的起点才和页头的底边
 * 落在同一个 y 上；中间只隔 50px 栏宽，差 1px 就看得见一个台阶。
 *（早先这里抄了一份同样的算式，正是「需要记得两边都改」的典型。）
 *
 * **但不画下边框。** 这里原本有一条 `--rule` 账线，接上右侧页头的横线；问题是这条线
 * 会横穿字的下沿，把牌记切成一个「头部区块」——可上面放的不是区块名，是一枚直接
 * 落在纸上的标。去掉线之后，字与槽之间只剩 8px 留白，读作「书名在上，目录在下」。
 * 高度里的那 1px 仍然留着：它不是给线的，是给两栏的对齐余量。
 *
 * 图案取自应用图标（行楷「梦」+ 右下朱印），但**去掉了图标的圆角方块底**：
 * 那块底在这个尺寸下只剩一圈比纸略深的边，加图标的墨不匀纹理，读作「贴了张图标」。
 * 去底之后，这片空白改由下面那条 1px 的细线框来收——线是自己画的，粗细可控，
 * 不像图标自带底那样带噪点。生成脚本：`design/icon/ink/make-logo-pair.py`。
 */
.rail-brand {
    display: flex;
    flex: none;
    align-items: center;
    justify-content: center;
    box-sizing: border-box;
    width: 100%;
    height: var(--page-head-h);
}

/* 图是正方形（192×192，四周自带一圈透明留白，见脚本里的 EDGE），所以宽高同值。
 *
 * **宽度取目录槽的宽**（`--vs-w`，34px）：标与槽上下同宽，整条栏读作一列，
 * 而不是「上面一枚图 + 下面一条槽」。牌记区高 45.3px，34 的方框上下各余 5.6px。
 *
 * **立体靠「侧面」而不是靠渐变。** 34px 见方时，一块面上的渐变只有十几像素
 * 的过渡带，读出来是「这块颜色不匀」，不是「这块有厚度」；上一版就是 82% 白
 * 铺 45% 再转 14% 黑，两个主题下都只是一片发灰的柔光。
 * 现在把厚度做成**一条真的边**：底边 2px、单独一个色，与面拉开一档，
 * 其余三边仍是 1px 细线。2px 是「侧面」，不是「加粗的描边」——加粗描边四面等宽，
 * 眼睛立刻读成框；只有一边厚，才读成块。
 *
 * **圆角取 `--r-2`**，与目录槽的 `--vs-radius`、格里的朱印同一个值：栏里三样东西
 * （标、槽、印）的转角必须在同一条曲线上，否则 34px 见方时 3px 与 4px 的差别
 * 一眼就能看出「这个角是另一种东西」。这个值不乘 `--fs-scale`——圆角是绝对曲率，
 * 槽那边也没乘，两处一起缩放反而对不上。侧厚同理，不跟字号缩放。
 */
.rail-mark {
    /* 三个面在这里定义一次，暗色整组换掉（见文件末尾）。
     * 亮色面就取纸色：标与纸同色，靠侧面和投影立起来，不靠「比纸更白」——
     * 纸已经是最亮的了，再亮只能发灰。 */
    --mark-face: var(--paper);
    /* 侧面：纸往分割线的颜色里压一档。压太少就成了「描边」，压太多读成脏斑。 */
    --mark-lip: color-mix(in srgb, var(--paper) 45%, var(--rule-2));
    /* 其余三边的细线与落地那道线，都与槽的描边同源（`--rule-2` 掺纸），
     * 这样标和槽在接缝处是同一层级的两条线，不会一边虚一边实。 */
    --mark-edge: color-mix(in srgb, var(--rule-2) 75%, var(--paper));

    display: block;
    flex: none;
    box-sizing: border-box;
    width: calc(34px * var(--fs-scale));
    height: calc(34px * var(--fs-scale));
    border: var(--w-hair) solid var(--mark-edge);
    border-bottom: 2px solid var(--mark-lip);
    border-radius: var(--r-2);
    background-color: var(--mark-face);
    /* 顶边一道硬高光：面的受光边。没有它，底边那条 2px 侧面就只是个深色下边框。
     * 投影用 `--bevel-lo`：`--shadow` 在亮色只有 8% 黑，涂在纸上等于没有；
     * 也不能用 `--ink`——暗色下它是纸白，会把标涂出一圈白光。 */
    box-shadow:
        inset 0 1px 0 var(--bevel-hi),
        0 1px 0 var(--mark-edge),
        0 3px 4px -1px var(--bevel-lo),
        0 5px 9px -4px color-mix(in srgb, var(--bevel-lo) 75%, transparent);
}

/* ---------- 暗色下的牌记 ----------
 * 亮色面取纸色就够——纸已经是最亮的，再往上只能发灰；暗色反过来了：
 * 纸 #1c1912 是最暗的，标必须**比纸亮一档**才浮得起来，所以要往 `--ink`
 * （暗色下就是纸白 #ece3cd）里掺 12%，得到 #353128 的面。
 * 侧面在暗色直接落到纸色：比面暗一档，同时又与周围的栏底同色，
 * 底边于是没有「一道深色的边」，只有「面结束了」——这正好是纸上的厚度感。
 * 因此暗色去掉亮色那道 `0 1px 0` 落地线：它会在侧面与投影之间插一条浅线，
 * 把一块完整的厚度切成两半。
 */
:global(html.dark .rail-mark) {
    --mark-face: color-mix(in srgb, var(--paper) 88%, var(--ink));
    --mark-lip: var(--paper);
    --mark-edge: color-mix(in srgb, var(--rule-2) 85%, var(--paper));

    box-shadow:
        inset 0 1px 0 var(--bevel-hi),
        inset 0 -1px 0 var(--bevel-lo),
        0 2px 4px -1px color-mix(in srgb, var(--bevel-lo) 80%, transparent),
        0 5px 10px -4px var(--bevel-lo);
}

/* 槽不参与 flex 分配：让它在栏顶按自身高度摆着，底部的工具条才不会被推下去。
 *
 * **槽顶与页头的下边框同高**，中间不留间距：牌记区的高度与 `PageHeader` 等值，
 * 页头底线就是牌记的底边，槽从这里起排，那条账线才在视觉上「拐个弯继续走」；
 * 早先留 6px，槽顶比右侧横线低半格，两栏在接缝处永远差一个台阶（用户截图指出）。
 * 以为「不留间距第一格会贴住字」是多余的担心：图形只有 34/45 高，牌记区里
 * 本来就余下 5.6px，槽顶离字还有一段。 */
.rail-nav {
    flex: none;
}

/* ---------- 底部 ----------
 * 一枚主题、一枚仓库，竖排居中，与轨道同一条中轴。
 *
 * `margin-top: auto` 把它压到栏底：目录贴顶、工具沉底，中间那段空白是「留白」
 * 而不是「没排完」。不用 `justify-content: space-between`——那会让槽自己也被推到
 * 中部，八档的位置就随窗口高度漂了。
 *
 * 尺寸 30px 是量出来的：轨道 34px 宽，两侧各余 2px，两枚按钮几乎与槽同宽，
 * 读起来是「槽的延续」而不是「槽下面贴了两个小方块」。仍然保持正方形——
 * `SlotButton` 的印面语义要求宽高同值，拉长一枚就成了色块。
 */
.rail-foot {
    display: flex;
    flex: none;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    margin-top: auto;
    padding-top: 8px;
    border-top: var(--w-hair) solid var(--rule);
    --slot-h: calc(30px * var(--fs-scale));
    --slot-w: calc(30px * var(--fs-scale));
}
</style>
