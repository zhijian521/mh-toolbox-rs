<script setup lang="ts">
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
 *
 * 它不知道路由的存在：收 `items` 和 `current`，点出去一个 key。
 * 导航项形状见 `navigation.ts` 的 `NavItem`——那是导航与路由共用的单一真源。
 */
import { ref, watch } from 'vue';
import AppIcon from './AppIcon.vue';
import BevelPill from './BevelPill.vue';
import SlotButton from './SlotButton.vue';
import type { NavItem } from '../navigation';
import { useTheme } from '../composables/use-theme';
import { openExternal } from '../services/desktop';
import { useAppInfo } from '../composables/use-app-info';

const props = defineProps<{ items: NavItem[]; current: string }>();
const emit = defineEmits<{ (event: 'update:current', key: string): void }>();

/** 项目地址。一个仓库、没有多环境之分，写死在这里比读配置省事。 */
const REPO_URL = 'https://github.com/zhijian521/mh-toolbox-rs';

/* 版本号经 `useAppInfo` 取：真窗口里来自 Rust，浏览器预览时退回 package.json 的值。
 * 写死的数字升级后必然忘记改（这里原先就是手写的 v0.1.0）。 */
const { version } = useAppInfo();

const { isDark, toggle: toggleTheme } = useTheme();

const STORAGE_KEY = 'mh-rail-collapsed';
const collapsed = ref(localStorage.getItem(STORAGE_KEY) === '1');
watch(collapsed, (value) => localStorage.setItem(STORAGE_KEY, String(value)));
</script>

<template>
    <aside class="rail" :class="{ collapsed }">
        <nav class="rail-nav" aria-label="主导航">
            <BevelPill
                v-for="item in props.items"
                :key="item.key"
                radius="sm"
                class="rail-item"
                :class="{
                    on: props.current === item.key,
                    pending: !item.view && props.current !== item.key,
                }"
                :title="item.view ? item.label : item.label + '（未实现）'"
                :aria-current="props.current === item.key ? 'page' : undefined"
                @click="emit('update:current', item.key)"
            >
                <AppIcon :name="item.icon" />
                <span class="rail-label">{{ item.label }}</span>
            </BevelPill>
        </nav>

        <div class="rail-foot">
            <p class="rail-meta">
                <span>v{{ version }}</span>
                <span>开发中</span>
            </p>

            <div class="rail-tools">
                <SlotButton :label="isDark ? '切到日间' : '切到夜间'" @click="toggleTheme">
                    <AppIcon :name="isDark ? 'sun' : 'moon'" />
                </SlotButton>

                <SlotButton label="在浏览器里打开项目仓库" @click="openExternal(REPO_URL)">
                    <AppIcon name="github" />
                </SlotButton>

                <SlotButton
                    :label="collapsed ? '展开侧栏' : '收起侧栏'"
                    :aria-expanded="!collapsed"
                    @click="collapsed = !collapsed"
                >
                    <AppIcon :name="collapsed ? 'rail-expand' : 'rail-collapse'" />
                </SlotButton>
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

/* ---------- 导航：八枚独立的胶囊 ----------
 * 每一项自己就是一枚胶囊（`.bevel-pill` 的四件套 + 小圆角），不是一条大槽里的八段：
 * 大槽会把八个目标读成一整块控件，而这里每一项都是独立入口。
 * 互斥关系由数据保证——`current` 只有一个值。
 *
 * 间距 6px（原来是 2px）：贴太紧会连成一片，认不出是八个独立目标。
 */
.rail-nav {
    display: flex;
    flex: 1;
    flex-direction: column;
    gap: 6px;
    min-height: 0;
    overflow-y: auto;
}

/* 只改尺寸与对齐，底/边/渐变/内阴影全部交给 `.bevel-pill`——质感只有一份。
 * 选择器带上 .rail-nav 是为了稳压 `.bevel-pill.on` 与各伪类态（同权时会打成平手）。
 */
.rail-nav .rail-item {
    display: flex;
    align-items: center;
    justify-content: flex-start;
    gap: calc(9px * var(--fs-scale));
    height: calc(33px * var(--fs-scale));
    padding: 0 calc(10px * var(--fs-scale));
    color: var(--ink-2);
    font-size: calc(13px * var(--fs-scale));
    line-height: 1;
    text-align: left;
    white-space: nowrap;
}

/* 选中：灌满朱红，印从纸里抬起来。 */
.rail-nav .rail-item.on,
.rail-nav .rail-item.on:hover:not(:disabled) {
    background-color: var(--cinnabar);
    background-image: linear-gradient(180deg, var(--bevel-hi), transparent 46%, var(--bevel-lo));
    box-shadow:
        inset 0 1px 0 var(--bevel-hi),
        0 1px 1px var(--bevel-lo),
        0 3px 7px color-mix(in srgb, var(--cinnabar) 26%, transparent);
    color: var(--on-cinnabar);
}
.rail-nav .rail-item.on :deep(.app-icon) {
    color: var(--on-cinnabar);
}
/* 按下去：渐变倒过来、投影收紧——同一枚印被压回槽里。 */
.rail-nav .rail-item.on:active:not(:disabled) {
    background-image: linear-gradient(180deg, var(--bevel-lo), transparent 58%);
    box-shadow:
        inset 0 1px 3px var(--bevel-lo),
        0 1px 2px color-mix(in srgb, var(--cinnabar) 22%, transparent);
}

.rail-nav .rail-item:focus-visible {
    outline: 2px solid color-mix(in srgb, var(--cinnabar) 60%, transparent);
    outline-offset: 1px;
}
.rail-nav .rail-item.pending {
    opacity: 0.52;
}
.rail-nav .rail-item.pending:hover {
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
/* 选择器带上 .rail-nav：`.rail-nav .rail-item` 是三个类，这里必须同权或更高才能压住。 */
.rail.collapsed .rail-nav {
    gap: 4px;
}
.rail.collapsed .rail-nav .rail-item {
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
 * 三枚槽按钮，排布随折叠方向走：展开一行等分，收起一列。
 * 质感在 `SlotButton` 里，这里只管位置与尺寸——尺寸经 `--slot-h` / `--slot-w` 传下去，
 * 组件自己不写死。
 */
.rail-tools {
    display: flex;
    gap: 5px;
    --slot-h: 26px;
}
.rail-tools .slot-btn {
    flex: 1 1 0;
}
.rail.collapsed .rail-tools {
    flex-direction: column;
    align-items: center;
    gap: 6px;
    --slot-h: 30px;
}
.rail.collapsed .rail-tools .slot-btn {
    flex: none;
    --slot-w: 30px;
}
</style>
