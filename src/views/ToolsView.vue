<script setup lang="ts">
import { useRouter } from 'vue-router';
import AppIcon from '../components/AppIcon.vue';
import PageShell from '../components/PageShell.vue';
import { TOOLS, type ToolEntry } from '../tools';

/**
 * 工具列表。
 *
 * 一件工具一格，格子按可用宽度自动排几列、换行往下长，所以现在只有一件也读得过去
 * （一格在左上角，不是「一条空表」），以后加到七八件也不会挤成一条长清单。
 *
 * 早先这里是一行一件的目录。改掉的原因是「目录」的形状只在条目够多时才成立：
 * 只有一件工具时，目录就是一行字压在一整张纸上，看着像表格没加载完。
 * 卡片不依赖条目数量成立——一件是一格，十件是十格。
 *
 * **卡片是「抬起来的一块纸板」**，与全站的凹槽（`.well`）、印面（`.stamp`）同一套光向：
 * 上沿受光、下沿落地、整体带一层软影，图标框是一道按下去的小凹槽。
 * 按下时整块翻成凹槽（内影取代投影）——这是这套材质里唯一说得通的「点击」反馈：
 * 纸板能被压回纸里，不会浮到纸上面去。早先用的是 `.frame` 的文武线，读起来是
 * 「表格里的一行」而不是「一样可以按的东西」。
 *
 * 清单本身在 `src/tools.ts`，路由也从那里生成，这里是纯渲染。
 */

const router = useRouter();

function open(tool: ToolEntry) {
    if (!tool.ready) return;
    void router.push(tool.path);
}
</script>

<template>
    <PageShell title="工具" desc="日常要用的几件">
        <div class="stack">
            <ul class="tool-grid">
                <li v-for="tool in TOOLS" :key="tool.key">
                    <button
                        class="tool-card"
                        type="button"
                        :disabled="!tool.ready"
                        :aria-label="`${tool.name}：${tool.desc}`"
                        @click="open(tool)"
                    >
                        <span class="tool-head">
                            <span class="tool-icon well">
                                <AppIcon :name="tool.icon" />
                            </span>
                            <span class="tool-name">{{ tool.name }}</span>
                            <span v-if="!tool.ready" class="tool-tag">还没做</span>
                            <AppIcon v-else name="chevron-right" class="tool-arrow" />
                        </span>
                        <span class="tool-desc">{{ tool.desc }}</span>
                    </button>
                </li>
            </ul>

            <p class="note">点一张进去，页头右上角能回到这张表。加新工具时这里会自己多一格。</p>
        </div>
    </PageShell>
</template>

<style scoped>
/* ---------- 网格 ---------- */
.tool-grid {
    display: grid;
    /* 下限 232px：再窄，说明文字会掉到第三行；再宽，1280 下只能排三列，
     * 右边留一条空纸。auto-fill 而不是 auto-fit——auto-fit 会在一件工具时
     * 把那一格拉到满宽，读起来像详情页而不是格子。 */
    grid-template-columns: repeat(auto-fill, minmax(232px, 1fr));
    gap: 12px;
    margin: 0;
    padding: 0;
    list-style: none;
}
.tool-grid li {
    display: flex;
}

/* ---------- 卡片：一块抬起来的纸板 ----------
 * 光从左上：上沿一条亮线（`--bevel-hi`）、底下 2px 硬边当**厚度**、再一层软影落地。
 * 三层缺一层就退回「一个带边的方块」——实测把软影降到 8% 透明度、底色只用
 * `--paper-2` 时，卡片只比页面亮 4 个色阶，肉眼读成「一圈线」而不是「一块纸板」。
 *
 * 底色用 `--paper`（比页面底 `--bg` 亮约 10 阶）而不是 `--paper-2`：
 * 凸起的东西迎着光，本来就该比周围亮；`--paper-2` 是承载面的颜色，用在凸面上会把
 * 光向反过来说。
 */
.tool-card {
    display: flex;
    flex: 1;
    flex-direction: column;
    gap: 8px;
    /* 整块是点击区：不留浏览器默认内边距，也不套 `.frame`（那是给「一块区块」的，
     * 20px 内边距放在一格卡片上会让 30px 的图标四周空得能再塞一行字）。 */
    padding: 14px 15px 15px;
    border: var(--w-hair) solid var(--rule-2);
    border-radius: var(--r-3);
    background-color: var(--paper);
    background-image: linear-gradient(
        180deg,
        color-mix(in srgb, var(--bevel-hi) 62%, transparent),
        transparent 30px
    );
    /* 厚度用 `--shadow-*` 而不是 `--bevel-lo`：后者亮色下只有 12% 黑，画硬边会虚。
     * 两者都随主题翻面（暗色恒偏黑），但 `--shadow-lg` 的跨度够当一条边。 */
    box-shadow:
        inset 0 1px 0 var(--bevel-hi),
        0 2px 0 var(--shadow-lg),
        0 7px 14px -5px var(--shadow-lg);
    color: inherit;
    font-family: var(--font-ui);
    text-align: left;
    cursor: pointer;
    /* 位移与阴影一起走：只动其中一样，会读成「元素在飘但没落地」。 */
    transition:
        transform var(--t-quick) var(--ease-soft),
        box-shadow var(--t-quick) var(--ease-soft),
        border-color var(--t-quick) var(--ease-soft),
        background-color var(--t-quick) var(--ease-soft);
}
/* 掀起 2px、厚度长到 3px、软影拉开：纸板被手指掀起一角，不是「悬到半空」。
 * 2px 是位移与厚度同步的上限——再高，整齐的网格会读成散落的便签。 */
.tool-card:hover:not(:disabled) {
    border-color: color-mix(in srgb, var(--cinnabar) 58%, var(--rule-2));
    box-shadow:
        inset 0 1px 0 var(--bevel-hi),
        0 3px 0 var(--shadow-lg),
        0 10px 18px -6px var(--shadow-lg);
    transform: translateY(-2px);
}
.tool-card:hover:not(:disabled) .tool-name,
.tool-card:hover:not(:disabled) .tool-arrow,
.tool-card:hover:not(:disabled) .tool-icon {
    color: var(--cinnabar);
}
/* 按下：整块翻成凹槽——内影取代投影、渐变从上暗改为上沿压暗。这就是 `.well` 的四件套，
 * 与 `SlotButton` 的按下态同一个意思：不是变暗，是被压回纸里。
 * 厚度必须一起收掉，否则「按下去」还留在原地 2px 高，会读成卡片在抖。 */
.tool-card:active:not(:disabled) {
    border-color: color-mix(in srgb, var(--cinnabar) 36%, var(--rule-2));
    background-color: var(--well);
    background-image: linear-gradient(180deg, var(--bevel-lo), transparent 62%);
    box-shadow:
        inset 0 1px 2px var(--bevel-lo),
        inset 0 -1px 0 var(--bevel-hi);
    transform: translateY(1px);
}
/* 键盘焦点必须自己画：整套反馈都靠颜色与光影，`outline: none` 就只剩「颜色变了一点」，
 * 而颜色变化同时也是悬停态，读不出「焦点在这里」。 */
.tool-card:focus-visible {
    outline: 2px solid var(--cinnabar);
    outline-offset: 2px;
}
.tool-card:disabled {
    cursor: default;
    opacity: 0.55;
}

.tool-head {
    display: flex;
    align-items: center;
    gap: 9px;
    min-width: 0;
}
/* 图标框是卡片上的一道小凹槽（`.well` 给四件套），尺寸沿用列表那套：
 * 它是「这件工具」的记号，不是配图，放大就变成应用商店的图标了。 */
.tool-icon {
    display: grid;
    flex: none;
    place-items: center;
    width: 30px;
    height: 30px;
    border-radius: var(--r-2);
    color: var(--ink-2);
    --icon-size: calc(16px * var(--fs-scale));
    transition: color var(--t-quick) var(--ease-soft);
}
.tool-name {
    min-width: 0;
    font-size: var(--fs-base);
    transition: color var(--t-quick) var(--ease-soft);
}
.tool-arrow {
    flex: none;
    margin-left: auto;
    color: var(--muted);
    --icon-size: calc(15px * var(--fs-scale));
    transition: color var(--t-quick) var(--ease-soft);
}
.tool-tag {
    flex: none;
    margin-left: auto;
    padding: 1px 6px;
    border: var(--w-hair) solid var(--rule-2);
    border-radius: var(--r-2);
    color: var(--muted);
    font-size: var(--fs-mini);
    letter-spacing: 0.08em;
}
/* 说明文字压到两行：三行会把同一行的卡片撑得高低不齐，
 * 而这两行只是「它干什么」，不需要说全。 */
.tool-desc {
    display: -webkit-box;
    overflow: hidden;
    color: var(--muted);
    font-size: var(--fs-xs);
    line-height: 1.62;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    line-clamp: 2;
}
</style>
