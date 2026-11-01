<script setup lang="ts">
import { useRouter } from 'vue-router';
import AppIcon from '../components/AppIcon.vue';
import PageShell from '../components/PageShell.vue';
import PressTile from '../components/PressTile.vue';
import { TOOLS, type ToolEntry } from '../tools';

/**
 * 工具列表 —— 桌面图标式的启动器。
 *
 * 一件工具一枚格子：图标块在上、名称在下，**没有别的字**。格子按固定 92px 排，
 * 从左往右铺、铺满换行，所以只有一件工具时就是左上角一枚，不像「一条空表」。
 *
 * 早先这里是一行一件的账目式列表，后来是通栏纸板卡片。两者都不成立的理由是同一个：
 * **它们都靠「行」来表达，而行的形状要求条目够多**。一件工具时，一行就是一句话
 * 压在一整张纸上，读起来像表格没加载完。图标格不依赖条目数量成立——一件是一枚，
 * 十件是十枚，多出来的部分自然往右下长，不需要改版式。
 *
 * 说明文字不再显示在页面上（`tool.desc` 仍进 `aria-label`）：桌面图标没有副标题，
 * 一枚图标加一个名字就是全部。一句话说明在这页只起到「把格子撑回卡片」的作用。
 *
 * **图标块是 `PressTile`**（`components/PressTile.vue`）：一块光从左上方来的压印纸。
 * 材质、悬停提亮、按下凹回去全在那个组件里，这里只剩「格子怎么排」和「点了去哪」。
 * 它和左栏牌记是同一块——两处原先各有一套立体写法，34px 的牌记那套读作「贴了张带框的图」。
 */
const router = useRouter();

function open(tool: ToolEntry) {
    if (!tool.ready) return;
    void router.push(tool.path);
}
</script>

<template>
    <PageShell title="工具" desc="日常要用的几件">
        <ul class="tool-grid">
            <li v-for="tool in TOOLS" :key="tool.key">
                <button
                    class="tool-item"
                    type="button"
                    :disabled="!tool.ready"
                    :aria-label="`${tool.name}：${tool.desc}`"
                    @click="open(tool)"
                >
                    <PressTile class="tool-tile">
                        <AppIcon :name="tool.icon" />
                    </PressTile>
                    <span class="tool-name">{{ tool.name }}</span>
                </button>
            </li>
        </ul>
    </PageShell>
</template>

<style scoped>
/* ---------- 网格 ----------
 * 固定 92px 列宽，不是 `1fr`：图标格是「一枚一枚摆上去的」，宽度不该随窗口拉伸。
 * 拉伸会让一件工具时的那一枚变成一条通栏按钮，正是这次要摆脱的形状。
 * 列间距 34px 接近半格，是桌面图标的松紧；行距 26px 略紧，因为名称只有一行。
 */
.tool-grid {
    /* 两个尺寸只在下面两处用到（对齐补偿、格子宽度），定成变量免得改一处漏一处。
     * `--tile-w` 这个**名字归 `PressTile`**：它会一直被继承到块上，块就按 56 见方。
     * 不要再给它起一个本地的别名——两处同名反而说明它本来就只有一个值。 */
    --cell-w: 92px;
    --tile-w: 56px;
    display: grid;
    grid-template-columns: repeat(auto-fill, var(--cell-w));
    justify-content: start;
    column-gap: 34px;
    row-gap: 26px;
    /* 格子里的图标块是居中的，第一列块的左缘会比内容左线缩进 (92-56)/2 = 18px。
     * 整片左移回去，「工具」标题与图标块左缘成一条线——否则图标像浮在标题右边，
     * 读不出「这一页从这里开始」。 */
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

/* 图标 26px：块 56 见方，图标撑到近一半才饱满；14px 的默认值在块上只有四分之一，
 * 读作「图太小、块太空」。 */
.tool-tile {
    --icon-size: calc(26px * var(--fs-scale));
}

/* 键盘焦点：环画在图标块上，跟随块的圆角。
 * 只靠「颜色变朱红」不够——那也是悬停态，读不出「焦点停在这里」。 */
.tool-item:focus-visible .tool-tile {
    outline: 2px solid var(--cinnabar);
    outline-offset: 3px;
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
