<script setup lang="ts">
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import AppIcon from '../components/AppIcon.vue';
import LedgerSection from '../components/LedgerSection.vue';
import PageShell from '../components/PageShell.vue';
import PressTile from '../components/PressTile.vue';
import { notify } from '../composables/use-notify';
import { openExternal } from '../services/desktop';
import { TOOL_GROUP_LABEL, TOOL_GROUPS, TOOLS, type ToolEntry } from '../tools';

/**
 * 工具列表 —— 按类别分块的启动器。
 *
 * 一件工具一枚格子：图标块在上、名称在下，**没有别的字**。格子按固定 78px 排，
 * 从左往右铺、铺满换行，所以一块里只有一件工具时就是左边一枚，不像「一条空表」。
 *
 * 早先这里是一行一件的账目式列表，后来是通栏纸板卡片。两者都不成立的理由是同一个：
 * **它们都靠「行」来表达，而行的形状要求条目够多**。图标格不依赖条目数量成立——
 * 一件是一枚，十件是十枚，多出来的部分自然往右长，不需要改版式。
 *
 * ---- 为什么又按类别分了块（2026-11-09） ----
 *
 * 先试的是「一墙图标、只靠底色分类」：四件工具摊在一片台面上，块面染了三种色。
 * 用户看完决定**直接分块**——颜色只说得清「这几件是一类」，说不出「这一类叫什么、
 * 到哪儿为止」，工具多起来之后尤其如此。所以改成一块 `LedgerSection` 管一类：
 * 块头写类别名与件数，下面的图标仍是同一套格子。
 *
 * 底色**保留**：块头已经说了类别，但底色是「扫一眼就分得开」的那一层，两者不冲突。
 * 分块与染色的真源都在 `tools.ts`（`TOOL_GROUPS` / `ToolEntry.group`）。
 *
 * 说明文字不显示在页面上（`tool.desc` 仍进 `aria-label`）：桌面图标没有副标题，
 * 一枚图标加一个名字就是全部。
 *
 * **图标块是 `PressTile`**（`components/PressTile.vue`）：一块光从左上方来的压印纸。
 * 材质、悬停提亮、按下凹回去全在那个组件里，这里只剩「块怎么分」「格子怎么排」
 * 「染什么色」和「点了去哪」。
 */
const router = useRouter();

/**
 * 点一枚格子。
 *
 * 两种落地方式，分支只有这一处：站内页进路由，外链交给系统浏览器。
 *
 * 外链**不做应用内预览页**（维护公告曾经有过一版：Rust 抓列表 + 本机算维护窗口的独立页）。
 * 那版的最后一步仍然是「点某一条 → 浏览器打开正文」，等于在官网前面加了一层会过期的副本。
 * 用户看完直接否掉：「点击直接跳转维护公告页面更简单」。
 *
 * 打开失败要说一句：`openExternal` 在桌面里失败是静默 false（浏览器预览会退回 `window.open`），
 * 不提示的话表现就是「点了没反应」——那比「打不开」更难查。
 */
async function open(tool: ToolEntry) {
    if (!tool.ready) return;
    if (tool.kind === 'link') {
        if (!(await openExternal(tool.href))) notify.error('没能打开浏览器，手动去官网看吧');
        return;
    }
    void router.push(tool.path);
}

/** 读屏要能听出「这一枚会离开应用」——视觉上没有箭头，只有这句在后面补上。 */
function labelOf(tool: ToolEntry): string {
    const out = tool.kind === 'link' ? '，在浏览器中打开' : '';
    return `${tool.name}（${TOOL_GROUP_LABEL[tool.group]}）：${tool.desc}${out}`;
}

/**
 * 按 `TOOL_GROUPS` 的顺序分组，块内保持 `TOOLS` 的原顺序（写表的人怎么排就怎么显示）。
 *
 * **空类不渲染**：以后临时撤掉某类最后一件工具时，不该在页面上留一张只有卡头的空卡
 * ——那比「这一页少了一块」更像坏了。
 */
const groups = computed(() =>
    TOOL_GROUPS.map((group) => ({
        ...group,
        tools: TOOLS.filter((tool) => tool.group === group.key),
    })).filter((group) => group.tools.length > 0),
);
</script>

<template>
    <PageShell title="工具">
        <div class="tool-blocks">
            <LedgerSection
                v-for="group in groups"
                :key="group.key"
                :title="group.label"
                :hint="`${group.tools.length} 件`"
            >
                <ul class="tool-grid">
                    <li v-for="tool in group.tools" :key="tool.key">
                        <button
                            class="tool-item"
                            type="button"
                            :data-group="tool.group"
                            :data-kind="tool.kind"
                            :disabled="!tool.ready"
                            :aria-label="labelOf(tool)"
                            @click="open(tool)"
                        >
                            <PressTile class="tool-tile">
                                <AppIcon :name="tool.icon" />
                            </PressTile>
                            <span class="tool-name">{{ tool.name }}</span>
                        </button>
                    </li>
                </ul>
            </LedgerSection>
        </div>
    </PageShell>
</template>

<style scoped>
/* ---------- 分类块 ----------
 * 一块一类，一行摆得下就并排（`auto-fit`），摆不下就往下落。
 *
 * 320 是「三枚图标 + 两道列距 + 卡内衬 18×2」量出来的下限：3×78 + 2×16 + 36 = 302，
 * 留 18 的余量给字号最大的那一档（格子与间距都乘 `--fs-scale`）。
 * 不写死列数：工具变多时块自己往右长，不必回来改这里。
 *
 * `align-items: start`：三块的高度由各自内容定，拉齐会让只有一件工具的那块
 * 凭空长出一条空纸。
 */
.tool-blocks {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
    align-items: start;
    gap: 16px;
    max-width: 1240px;
}

/* ---------- 网格 ----------
 * 固定列宽，不是 `1fr`：图标格是「一枚一枚摆上去的」，宽度不该随块的宽度拉伸。
 *
 * **78 是名字量出来的**：最长的是「活动日历」，四个字在 1.1 档约 55，78 里左右各余 11。
 * 多出来的 14 全落在图标之间——92 那版两枚图标相隔 70px，一页四件看着像散落的几个点
 * （2026-11-09 用户：「图标之间的间隔太远了」）。
 *
 * 列 16、行 18：图标块 56 落在 78 格里，两枚之间的空当 = 11 + 16 + 11 = 38，
 * 约等于半枚图标宽，读作「一排连续的图标」；行距 18 比列距略松一点——
 * 名称是一行字，纵向本来就需要多一点气。
 */
.tool-grid {
    /* 两个尺寸只在下面两处用到（对齐补偿、格子宽度），定成变量免得改一处漏一处。
     * `--tile-w` 这个**名字归 `PressTile`**：它会一直被继承到块上，块就按 56 见方。
     * 不要再给它起一个本地的别名——两处同名反而说明它本来就只有一个值。 */
    --cell-w: 78px;
    --tile-w: 56px;
    /* 分类底色的掺入比例：常态 58、悬停 74（更实）、按下 48（被压回槽底，第二色换成
     * `--well`）。**只改这三个数就能整体调浓淡**，色号不必动。 */
    --tool-wash: 58%;
    --tool-wash-hover: 74%;
    --tool-wash-active: 48%;

    display: grid;
    grid-template-columns: repeat(auto-fill, var(--cell-w));
    justify-content: start;
    column-gap: 16px;
    row-gap: 18px;
    /* 格子里的图标块是居中的，第一列块的左缘会比这份网格的左缘缩进 (78-56)/2 = 11px。
     * 网格的左边正好落在卡的 `--block-pad` 上，所以往左补 11，图标块与卡头那道
     * `.section-mark` 竖条落在同一条竖线上——否则图标像浮在类别名右边，
     * 读不出「这一块从这里开始」。补出去的距离在卡的内衬里，不会顶到卡缘。 */
    margin: 0 0 0 calc((var(--tile-w) - var(--cell-w)) / 2);
    padding: 0;
    list-style: none;
}
.tool-grid li {
    display: flex;
}

/* ---------- 一枚格子 ----------
 * 整枚可点，但视觉只有图标块与名称。padding 归零、边框归零——任何一层框都会让
 * 「一枚图标」变成「一张小卡片」，而卡片正是要退回去的东西。
 */
.tool-item {
    /* 分类色的**兜底**：`tools.ts` 加了新分类却忘了在下面补一行映射时，块面回落纸色，
     * 而不是 `color-mix` 里那个 `var(--tint)` 解析失败、整条 `background-color` 作废、
     * 块变成透明（比「没分类」难看，也看不出是哪里错了）。 */
    --tint: var(--paper-2);

    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 10px;
    width: var(--cell-w);
    padding: 0;
    border: 0;
    background: none;
    color: var(--ink);
    font-family: var(--font-ui);
    cursor: pointer;
    /* 焦点环画在图标块上（见下），按钮本身不留 outline。 */
    outline: none;
}

/* ---------- 分类底色 ----------
 * 色号在 `tokens.css` 的 `--tint-工具日程 / 工具资料 / 工具游戏`，这里只做两件事：
 * 按 `data-group` 挑一组，再决定掺多少（`--tool-wash` 那三个数）。
 *
 * **掺得比卡底重**：门派卡底只有 30%，那是因为整张卡摊开、面积够大；这里只有一枚
 * 56px 的块，同样的 30% 读作「这张纸有点不白」。58% 是不必换字色的上限——
 * 再浓图标（`--ink-2`）就开始压不住，得连带调块面上的墨。
 *
 * **三条面一起给**（常态 / 悬停 / 按下）。只给常态的话，指针一上去块面跳回纯纸、
 * 一按跳成凹槽色，同一枚图标在两秒里换了三次类别——那比不分类更乱。
 */
.tool-item[data-group='daily'] {
    --tint: var(--tint-工具日程);
}
.tool-item[data-group='lookup'] {
    --tint: var(--tint-工具资料);
}
.tool-item[data-group='game'] {
    --tint: var(--tint-工具游戏);
}

/* 图标 26px：块 56 见方，图标撑到近一半才饱满；14px 的默认值在块上只有四分之一，
 * 读作「图太小、块太空」。 */
.tool-tile {
    --icon-size: calc(26px * var(--fs-scale));
    --tile-face: color-mix(in srgb, var(--tint) var(--tool-wash), var(--paper));
    --tile-face-hover: color-mix(in srgb, var(--tint) var(--tool-wash-hover), var(--paper));
    /* 按下是「被压回槽里」，所以第二色换成 `--well` 而不是纸——与 `PressTile`
     * 自己的按下态同一个落点，只是保留分类色相。 */
    --tile-face-active: color-mix(in srgb, var(--tint) var(--tool-wash-active), var(--well));
}

/* 键盘焦点：环画在图标块上，跟随块的圆角。
 * 只靠「颜色变朱红」不够——那也是悬停态，读不出「焦点停在这里」。 */
.tool-item:focus-visible .tool-tile {
    outline: var(--ring);
    outline-offset: var(--ring-offset);
}

.tool-item:disabled {
    cursor: default;
    opacity: 0.5;
}

/* 名称允许折两行并居中，与桌面图标一致。
 * 不锁「固定两行高」：网格里同一行的格子本来就会被拉到同一高度；锁了反而在只有
 * 一件工具时多空出一整行。 */
.tool-name {
    width: var(--cell-w);
    font-size: var(--fs-sm);
    line-height: 1.35;
    text-align: center;
    transition: color var(--t-quick) var(--ease-soft);
}
.tool-item:hover:not(:disabled) .tool-name,
.tool-item:focus-visible .tool-name {
    color: var(--cinnabar);
}
</style>
