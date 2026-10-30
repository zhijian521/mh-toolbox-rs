<script lang="ts">
import type { IconName } from './icons';

/** 导航项的形状。放在普通 `<script>` 块里才能被外部 import——`script setup` 不允许 export。 */
export interface RailPage {
    key: string;
    label: string;
    icon: IconName;
}
</script>

<script setup lang="ts">
import { ref, watch } from 'vue';
import AppIcon from './AppIcon.vue';
import { useTheme } from '../composables/use-theme';
import { openExternal } from '../services/desktop';

/** 项目地址。一个仓库、没有多环境之分，写死在这里比读配置省事。 */
const REPO_URL = 'https://github.com/zhijian521/mh-toolbox-rs';

/**
 * 左栏：一条书脊，八枚凹槽。
 *
 * 质感跟 `base.css` 的 `.bevel-pill` 同一套四件套，只是换成方角：
 * 未选中是纸面上一条几乎平的槽，悬停时槽沉下去，选中时**灌满朱红**——
 * 那枚朱印从纸里抬起来，带内高光和一道向外投的影。不做描边、不做纯色块。
 *
 * 折叠：
 * - 宽度 158 → 58（不跟 `--fs-scale` 走，折叠态只放图标，放得下就是放得下）
 * - 文字用 `width:0 + opacity:0` 收，不是 `display:none`，否则边缘会跳
 * - 折叠按钮在栏底，图标表示**下一步**（收起 / 展开），不是当前状态
 */
const props = defineProps<{ pages: RailPage[]; current: string }>();
const emit = defineEmits<{ (event: 'update:current', key: string): void }>();

const { isDark, toggle: toggleTheme } = useTheme();

const STORAGE_KEY = 'mh-rail-collapsed';
const collapsed = ref(localStorage.getItem(STORAGE_KEY) === '1');
watch(collapsed, (value) => localStorage.setItem(STORAGE_KEY, String(value)));
</script>

<template>
    <aside class="rail" :class="{ collapsed }">
        <nav class="rail-nav" aria-label="主导航">
            <button
                v-for="page in props.pages"
                :key="page.key"
                type="button"
                class="rail-item"
                :class="{
                    on: props.current === page.key,
                    pending: props.current !== page.key && page.key !== 'settings',
                }"
                :title="page.key === 'settings' ? page.label : page.label + '（未实现）'"
                :aria-current="props.current === page.key ? 'page' : undefined"
                @click="emit('update:current', page.key)"
            >
                <AppIcon :name="page.icon" />
                <span class="rail-label">{{ page.label }}</span>
            </button>
        </nav>

        <div class="rail-foot">
            <p class="rail-meta">
                <span>v0.1.0</span>
                <span>开发中</span>
            </p>

            <div class="rail-tools">
                <button
                    type="button"
                    class="rail-tool"
                    :title="isDark ? '切到日间' : '切到夜间'"
                    :aria-label="isDark ? '切到日间' : '切到夜间'"
                    @click="toggleTheme"
                >
                    <AppIcon :name="isDark ? 'sun' : 'moon'" />
                </button>

                <button
                    type="button"
                    class="rail-tool"
                    title="在浏览器里打开项目仓库"
                    aria-label="在浏览器里打开项目仓库"
                    @click="openExternal(REPO_URL)"
                >
                    <AppIcon name="github" />
                </button>

                <button
                    type="button"
                    class="rail-tool"
                    :title="collapsed ? '展开侧栏' : '收起侧栏'"
                    :aria-label="collapsed ? '展开侧栏' : '收起侧栏'"
                    :aria-expanded="!collapsed"
                    @click="collapsed = !collapsed"
                >
                    <AppIcon :name="collapsed ? 'rail-expand' : 'rail-collapse'" />
                </button>
            </div>
        </div>
    </aside>
</template>

<style scoped>
/* ---------- 书脊 ----------
 * 一条比内容区亮的板，右侧是一条受光的棱：内边缘一条高光，板身向外投一道淡影。
 * 光从上方来，所以顶部再压一道极淡的竖向渐变，板才不会像贴纸。
 */
.rail {
    display: flex;
    flex: none;
    flex-direction: column;
    width: calc(158px * var(--fs-scale));
    padding: 14px 10px 10px;
    background-color: var(--paper);
    background-image: linear-gradient(180deg, var(--bevel-hi), transparent 96px);
    box-shadow:
        inset -1px 0 0 var(--bevel-hi),
        inset -3px 0 5px -4px var(--bevel-lo),
        3px 0 10px -3px var(--shadow);
    transition: width 220ms var(--ease-soft);
}
.rail.collapsed {
    width: 58px;
    padding: 10px 9px;
}

.rail-nav {
    display: flex;
    flex: 1;
    flex-direction: column;
    gap: 2px;
    min-height: 0;
    overflow-y: auto;
}

/* ---------- 导航项：一条槽 ----------
 * 未选中几乎与纸齐平，只留一圈极淡的凹轮廓——八条深槽会抢戏。
 * 悬停时槽沉下去（上沿内阴影 + 下沿高光同时加重）。
 */
.rail-item {
    display: flex;
    align-items: center;
    gap: calc(9px * var(--fs-scale));
    height: calc(31px * var(--fs-scale));
    padding: 0 calc(9px * var(--fs-scale));
    border: 0;
    border-radius: var(--r-2);
    background-color: color-mix(in srgb, var(--well) 52%, var(--paper));
    box-shadow:
        inset 0 1px 1px color-mix(in srgb, var(--bevel-lo) 62%, transparent),
        inset 0 -1px 0 color-mix(in srgb, var(--bevel-hi) 70%, transparent);
    color: var(--ink-2);
    font-size: calc(13px * var(--fs-scale));
    line-height: 1;
    text-align: left;
    white-space: nowrap;
    transition:
        color var(--t-quick) var(--ease-soft),
        border-color var(--t-quick) var(--ease-soft),
        background-color var(--t-quick) var(--ease-soft),
        box-shadow var(--t-quick) var(--ease-soft);
}
.rail-item:hover:not(.on) {
    background-color: color-mix(in srgb, var(--well) 90%, var(--paper));
    background-image: linear-gradient(180deg, var(--bevel-lo), transparent 62%);
    box-shadow:
        inset 0 1px 3px var(--bevel-lo),
        inset 0 -1px 0 var(--bevel-hi);
    color: var(--ink);
}

/* 选中：灌满朱红，印从纸里抬起来。与 .bevel-pill.on 同一套明暗。 */
.rail-item.on {
    background-color: var(--cinnabar);
    background-image: linear-gradient(180deg, var(--bevel-hi), transparent 46%, var(--bevel-lo));
    box-shadow:
        inset 0 1px 0 var(--bevel-hi),
        0 1px 1px var(--bevel-lo),
        0 3px 7px color-mix(in srgb, var(--cinnabar) 26%, transparent);
    color: var(--on-cinnabar);
    opacity: 1;
}
.rail-item.on :deep(.app-icon) {
    color: var(--on-cinnabar);
}
/* 按下去：渐变倒过来、投影收紧——同一枚印被压回纸里。 */
.rail-item.on:active {
    background-image: linear-gradient(180deg, var(--bevel-lo), transparent 58%);
    box-shadow:
        inset 0 1px 3px var(--bevel-lo),
        0 1px 2px color-mix(in srgb, var(--cinnabar) 22%, transparent);
}

.rail-item:focus-visible {
    outline: 2px solid color-mix(in srgb, var(--cinnabar) 60%, transparent);
    outline-offset: 1px;
}
.rail-item.pending {
    opacity: 0.52;
}
.rail-item.pending:hover {
    opacity: 0.86;
}

/* 文字收进去而不是消失：宽度归零，边缘不会跳。 */
/* min-width:0 是必须的：flex item 默认 min-width:auto，宽度归零了内容仍占位，
 * 折叠态的图标就会偏左而不是居中。 */
.rail-label {
    overflow: hidden;
    min-width: 0;
    transition:
        opacity 140ms var(--ease-soft),
        width 220ms var(--ease-soft);
}

/* ---------- 折叠态 ---------- */
.rail.collapsed .rail-item {
    justify-content: center;
    gap: 0;
    padding: 0;
}
.rail.collapsed .rail-label {
    width: 0;
    min-width: 0;
    flex: 0 0 0;
    opacity: 0;
}

/* ---------- 底部 ----------
 * 从下往上：折叠按钮在栏底最末一行，上面是主题切换，再上是元信息。
 */
.rail-foot {
    display: flex;
    flex: none;
    flex-direction: column;
    gap: 8px;
    margin-top: 10px;
    padding-top: 10px;
    border-top: var(--w-hair) solid var(--rule);
}
.rail-meta {
    display: flex;
    flex-direction: column;
    margin: 0;
    color: var(--muted);
    font-size: var(--fs-mini);
    letter-spacing: 0.02em;
    line-height: 1.5;
    overflow: hidden;
    transition: opacity 140ms var(--ease-soft);
}
.rail.collapsed .rail-meta {
    opacity: 0;
    height: 0;
}

/* ---------- 底部工具条 ----------
 * 两态，照设置页 `.size-slider` 的「轨道 + 滑块」关系拆开用：
 *   常态  = 轨道：--well 底、一道 --rule-2 金边、上沿内阴影，凹进纸面
 *   悬停  = 朱印落进槽里：伪元素内缩 2px，四周仍露出槽底与金边（.size-thumb 与轨道就是这个关系）
 *   按下  = 印被压进去
 *
 * 朱红走伪元素而不是直接改按钮底色：底色一改，金边与槽就整片被盖掉了，
 * 那读起来是「换了块色板」，不是「一枚印落在槽里」。
 *
 * 圆角 --r-2（3px）与导航项同档：方，但角不刺手。
 */
.rail-tools {
    display: flex;
    gap: 5px;
}

.rail-tool {
    position: relative;
    display: flex;
    flex: 1 1 0;
    align-items: center;
    justify-content: center;
    min-width: 0;
    height: 26px;
    padding: 0;
    border: var(--w-hair) solid color-mix(in srgb, var(--rule-2) 80%, transparent);
    border-radius: var(--r-2);
    background-color: var(--well);
    background-image: linear-gradient(180deg, var(--bevel-lo), transparent 62%);
    box-shadow:
        inset 0 1px 2px var(--bevel-lo),
        inset 0 -1px 0 var(--bevel-hi);
    color: var(--ink-2);
    transition:
        border-color var(--t-quick) var(--ease-soft),
        color var(--t-quick) var(--ease-soft),
        height 220ms var(--ease-soft);
}

/* 朱印：内缩 1px 落进槽里——只留一道槽底 + 一道金边，印面才占得住这块地。
 * 缩到 2px 时印只剩 39×22，四周一圈 2px 的槽底显得「里面小小的」。
 * 印面渐变压得很淡（30% 白 / 32% 就透明）：真正的印泥是均匀一片朱色，
 * 立体感交给那 1px 顶边高光和外投影去撑。渐变一重，读起来就是塑料按键不是印。 */
.rail-tool::before {
    content: '';
    position: absolute;
    inset: 1px;
    border-radius: calc(var(--r-2) - 1px);
    background-color: var(--cinnabar);
    background-image: linear-gradient(
        180deg,
        color-mix(in srgb, var(--bevel-hi) 30%, transparent),
        transparent 32%,
        var(--bevel-lo)
    );
    box-shadow:
        inset 0 1px 0 var(--bevel-hi),
        0 1px 1px var(--bevel-lo),
        0 2px 5px color-mix(in srgb, var(--cinnabar) 30%, transparent);
    opacity: 0;
    transform: scale(0.94);
    transition:
        opacity var(--t-quick) var(--ease-soft),
        transform 200ms var(--ease-snap),
        background-color var(--t-quick) var(--ease-soft),
        box-shadow var(--t-quick) var(--ease-soft);
}

.rail-tool:hover::before {
    opacity: 1;
    transform: scale(1);
}
.rail-tool:hover {
    color: var(--on-cinnabar);
}
.rail-tool:hover :deep(.app-icon) {
    color: var(--on-cinnabar);
}

/* 按下：印被压进槽底的凹痕。 */
.rail-tool:active::before {
    background-color: color-mix(in srgb, var(--cinnabar) 82%, var(--ink));
    background-image: linear-gradient(180deg, var(--bevel-lo), transparent 58%);
    box-shadow: inset 0 2px 4px var(--bevel-lo);
}

/* 图标要压在伪元素上面：绝对定位的 ::before 会盖住非定位内容。
 * 尺寸放大到 16px：默认的 14px 在 24px 高的印面上只占四成，四周一圈留白，
 * 看着就是「里面小小的」。16px 撑到三分之二，印面才饱满。 */
.rail-tool :deep(.app-icon) {
    position: relative;
    z-index: 1;
    width: calc(16px * var(--fs-scale));
    height: calc(16px * var(--fs-scale));
}

/* 聚焦环不能再用朱红：悬停时底就是朱红，红环会消失。 */
.rail-tool:focus-visible {
    outline: 2px solid color-mix(in srgb, var(--ink) 45%, transparent);
    outline-offset: 1px;
}

/* 收起：一行改一列；宽高收成正方形，方角不变。 */
.rail.collapsed .rail-tools {
    flex-direction: column;
    align-items: center;
    gap: 6px;
}
.rail.collapsed .rail-tool {
    flex: none;
    width: 30px;
    height: 30px;
}
</style>
