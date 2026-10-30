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
    padding: 0 calc(8px * var(--fs-scale)) calc(10px * var(--fs-scale));
    background-color: var(--paper);
    background-image: linear-gradient(180deg, var(--bevel-hi), transparent 96px);
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

/* ---------- 牌记 ----------
 * 栏顶这枚标是这本书的书名，下面那道槽是它的目录。
 *
 * 高度逐项复刻 `PageHeader`：padding 10 + 标题行框（`--fs-xl` × 1.15）+ 9 + 1px 账线。
 * 不是「看起来差不多」——牌记区与内容区页头等值，下面那道槽的起点才和页头的底边
 * 落在同一个 y 上；中间只隔 50px 栏宽，差 1px 就看得见一个台阶。所以抄算式，不写死高度。
 *
 * **但不画下边框。** 这里原本有一条 `--rule` 账线，接上右侧页头的横线；问题是这条线
 * 会横穿字的下沿，把牌记切成一个「头部区块」——可上面放的不是区块名，是一枚直接
 * 落在纸上的标。去掉线之后，字与槽之间只剩 8px 留白，读作「书名在上，目录在下」。
 * 高度算式里的那 1px 仍然留着：它不是给线的，是给两栏的对齐余量。
 *
 * 图案取自应用图标（行楷「梦」+ 右下朱印），但**去掉了图标的圆角方块底**：
 * 34px 见方时那块底只剩一圈比纸略深的边，加图标的墨不匀纹理，读作「贴了张图标」；
 * 去了底，字才能吃满栏宽，也才谈得上「黑版 / 白版」——有底色时两版只差一层方框。
 * 生成脚本：`design/icon/ink/make-logo-pair.py`。
 */
.rail-brand {
    display: flex;
    flex: none;
    align-items: center;
    justify-content: center;
    box-sizing: border-box;
    width: 100%;
    height: calc(19px + var(--fs-xl) * 1.15 + var(--w-hair));
}

/* 图是裁到墨迹的 171×192（宽高比 ≈ 0.89），所以定高、宽自适应。
 * 高 34px 在 45.3px 的牌记区里上下各余 5.6px——再高就贴到账线上了。
 * 宽度 30.3px，栏内剩 1.8px 边距：横向比纵向更满，因为字是竖长的，横向再收就压不住栏宽。 */
.rail-mark {
    display: block;
    flex: none;
    height: calc(34px * var(--fs-scale));
    width: auto;
    max-width: 100%;
}

/* 槽不参与 flex 分配：让它在栏顶按自身高度摆着，底部的工具条才不会被推下去。
 * 与牌记之间留 8px：紧贴着起排，第一格的图标会贴上字的下沿。 */
.rail-nav {
    flex: none;
    margin-top: calc(8px * var(--fs-scale));
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
    padding-top: 10px;
    border-top: var(--w-hair) solid var(--rule);
    --slot-h: calc(30px * var(--fs-scale));
    --slot-w: calc(30px * var(--fs-scale));
}
</style>
