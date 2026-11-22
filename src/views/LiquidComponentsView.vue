<script setup lang="ts">
import { computed, ref } from 'vue';
import {
    GlassButton,
    GlassCard,
    GlassGroup,
    GlassMenu,
    GlassMenuItem,
    GlassMenuLabel,
    GlassMenuSeparator,
    GlassProgressiveBlur,
    GlassScene,
    GlassSearch,
    GlassSegment,
    GlassSegmented,
    GlassSheet,
    GlassSlider,
    GlassSpacer,
    GlassSwitch,
    GlassTab,
    GlassTabBar,
    GlassToolbar,
} from '../components/liquid-glass';

const game = `${import.meta.env.BASE_URL}game/`;
const backgrounds = [
    { name: '江南野外', src: `${game}maps/jiangnanyewai.webp` },
    { name: '长寿村', src: `${game}maps/changshoucun.webp` },
    { name: '傲来国', src: `${game}maps/aolaiguo.webp` },
];
const observations = [
    '06:15 记录金刚石行情',
    '07:40 更新角色状态',
    '08:25 登记今日收益',
    '09:50 补录账号费用',
    '11:10 查看养成目标',
];
const photoIndex = ref(0);
const wifi = ref(true);
const brightness = ref(62);
const currentTab = ref('overview');
const range = ref('week');
const sort = ref('名称');
const query = ref('');
const menuOpen = ref(false);
const sheetOpen = ref(false);
const favorite = ref(false);
const timeline = ref<HTMLElement | null>(null);
const photo = computed(() => backgrounds[photoIndex.value] ?? backgrounds[0]!);
const matches = computed(() =>
    backgrounds.filter((item) => item.name.includes(query.value.trim())),
);

function nextPhoto() {
    photoIndex.value = (photoIndex.value + 1) % backgrounds.length;
}

function applySearch() {
    const [match] = matches.value;
    if (match) photoIndex.value = backgrounds.indexOf(match);
}
</script>

<template>
    <div class="component-catalog" :style="{ '--preview-photo': `url(${photo.src})` }">
        <header class="intro">
            <h1>组件</h1>
            <div class="pickers">
                <fieldset>
                    <legend>背景</legend>
                    <label v-for="(background, index) in backgrounds" :key="background.name">
                        <input v-model="photoIndex" type="radio" name="background" :value="index" />
                        <span>{{ background.name }}</span>
                    </label>
                </fieldset>
            </div>
        </header>

        <div class="gallery">
            <section>
                <h2>按钮</h2>
                <div class="stage">
                    <glass-button shape="circle" aria-label="切换背景" @click="nextPhoto"
                        >↻</glass-button
                    >
                    <glass-button @click="nextPhoto">切换背景</glass-button>
                    <glass-button
                        variant="prominent"
                        tint="rgb(178 234 188 / 0.24)"
                        @click="sheetOpen = true"
                    >
                        打开详情
                    </glass-button>
                </div>
            </section>

            <section>
                <h2>卡片</h2>
                <div class="stage">
                    <glass-card class="quote" :radius="24">
                        <div class="quote-item">
                            <img
                                :src="`${game}icons/item/item-8.png`"
                                alt=""
                                width="32"
                                height="32"
                            />
                            <div>
                                <small>五宝</small>
                                <div>金刚石</div>
                            </div>
                        </div>
                        <strong>85.5</strong> <small>万两</small>
                    </glass-card>
                </div>
            </section>

            <section>
                <h2>开关</h2>
                <div class="stage">
                    <glass-card class="control" :radius="21">
                        <div class="control-label">
                            <span>无线网络</span>
                            <glass-switch v-model:checked="wifi" aria-label="无线网络" />
                        </div>
                        <small>{{ wifi ? '无线网络已开启' : '无线网络已关闭' }}</small>
                    </glass-card>
                </div>
            </section>

            <section>
                <h2>滑块</h2>
                <div class="stage">
                    <glass-card class="control" :radius="21">
                        <label class="control-label" for="brightness"
                            >亮度 <output>{{ brightness }}%</output></label
                        >
                        <glass-slider
                            id="brightness"
                            v-model:value="brightness"
                            :step="1"
                            aria-label="亮度"
                        />
                    </glass-card>
                </div>
            </section>

            <section>
                <h2>标签栏</h2>
                <div class="stage">
                    <glass-tab-bar
                        v-model:value="currentTab"
                        class="control-width"
                        aria-label="旅行导航"
                    >
                        <glass-tab value="overview"
                            ><span aria-hidden="true">⌂</span>概览</glass-tab
                        >
                        <glass-tab value="path"><span aria-hidden="true">↗</span>路线</glass-tab>
                        <glass-tab value="saved"><span aria-hidden="true">♡</span>收藏</glass-tab>
                    </glass-tab-bar>
                </div>
            </section>

            <section>
                <h2>分段选择</h2>
                <div class="stage">
                    <glass-segmented v-model:value="range" aria-label="时间范围">
                        <glass-segment value="day">今天</glass-segment>
                        <glass-segment value="week">本周</glass-segment>
                        <glass-segment value="month">本月</glass-segment>
                    </glass-segmented>
                </div>
            </section>

            <section>
                <h2>菜单</h2>
                <div class="stage">
                    <glass-menu v-model:open="menuOpen" @select="sort = $event">
                        <template #trigger
                            ><glass-button>排序 · {{ sort }} ⌄</glass-button></template
                        >
                        <glass-menu-label>排序方式</glass-menu-label>
                        <glass-menu-item
                            value="名称"
                            group="sort"
                            checkable
                            :checked="sort === '名称'"
                            >按名称</glass-menu-item
                        >
                        <glass-menu-item
                            value="时间"
                            group="sort"
                            checkable
                            :checked="sort === '时间'"
                            >按时间</glass-menu-item
                        >
                        <glass-menu-separator />
                        <glass-menu-item value="默认">恢复默认</glass-menu-item>
                    </glass-menu>
                </div>
            </section>

            <section>
                <h2>工具栏</h2>
                <div class="stage">
                    <glass-toolbar class="control-width" aria-label="照片工具栏">
                        <glass-button shape="circle" aria-label="下一张照片" @click="nextPhoto"
                            >→</glass-button
                        >
                        <glass-spacer />
                        <glass-group aria-label="照片操作">
                            <glass-button
                                variant="plain"
                                shape="circle"
                                aria-label="收藏照片"
                                :aria-pressed="favorite"
                                @click="favorite = !favorite"
                                >{{ favorite ? '♥' : '♡' }}</glass-button
                            >
                            <glass-button
                                variant="plain"
                                shape="circle"
                                aria-label="照片详情"
                                @click="sheetOpen = true"
                                >···</glass-button
                            >
                        </glass-group>
                    </glass-toolbar>
                </div>
            </section>

            <section>
                <h2>搜索框</h2>
                <div class="stage search-stage">
                    <glass-search
                        v-model:value="query"
                        class="control-width"
                        aria-label="搜索背景"
                        placeholder="搜索背景"
                        @search="applySearch"
                    />
                    <output>{{
                        matches.map((item) => item.name).join(' · ') || '没有匹配的背景'
                    }}</output>
                </div>
            </section>

            <section>
                <h2>底部弹层</h2>
                <div class="stage">
                    <glass-button @click="sheetOpen = true">打开弹层 ↑</glass-button>
                </div>
            </section>

            <section>
                <h2>滚动边缘</h2>
                <div class="stage scroll-stage">
                    <div ref="timeline" class="timeline" tabindex="0" aria-label="助手记录">
                        <glass-card v-for="item in observations" :key="item" :radius="12">{{
                            item
                        }}</glass-card>
                    </div>
                    <glass-progressive-blur edge="top" :size="66" tint="rgb(3 16 12 / 0.3)" />
                    <glass-toolbar class="timeline-bar" aria-label="记录工具栏">
                        <strong>助手记录</strong><glass-spacer />
                        <glass-button size="small" @click="timeline?.scrollTo({ top: 0 })"
                            >回到顶部 ↑</glass-button
                        >
                    </glass-toolbar>
                </div>
            </section>

            <section>
                <h2>场景容器</h2>
                <glass-scene class="scene" :src="photo.src">
                    <glass-card class="scene-label" :radius="21"
                        >{{ photo.name }} · 图像背景折射</glass-card
                    >
                </glass-scene>
            </section>
        </div>

        <glass-sheet v-model:open="sheetOpen" detents="small medium" aria-label="金刚石行情" modal>
            <div class="sheet-content">
                <h2>金刚石行情</h2>
                <p>当前参考价 85.5 万两，较上次上涨 2.5 万两。</p>
                <glass-button @click="sheetOpen = false">关闭</glass-button>
            </div>
        </glass-sheet>
    </div>
</template>

<style scoped>
.component-catalog {
    --catalog-gutter: clamp(12px, 3vw, 48px);
    display: flex;
    flex-direction: column;
    height: 100%;
}

.intro {
    flex: none;
    display: flex;
    align-items: end;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 14px 24px;
    padding: 12px var(--catalog-gutter);
    border-bottom: 1px solid var(--liquid-outline);
}

.intro h1 {
    margin: 0;
}

.pickers {
    display: flex;
    flex-wrap: wrap;
    gap: 8px 12px;
}
.pickers fieldset {
    display: flex;
    flex-wrap: wrap;
    gap: 2px;
    min-width: 0;
    margin: 0;
    padding: 3px;
    border: 1px solid var(--liquid-outline);
    border-radius: 20px;
    font-size: var(--fs-sm);
}
.pickers legend {
    padding: 0 6px;
}
.pickers label {
    position: relative;
    cursor: pointer;
}
.pickers input {
    position: absolute;
    inset: 0;
    margin: 0;
    opacity: 0;
    cursor: inherit;
}
.pickers span {
    display: block;
    padding: 4px 10px;
    border-radius: 14px;
    white-space: nowrap;
}
.pickers :checked + span {
    background: light-dark(#fff, #3b544b);
    box-shadow: 0 1px 3px #15241c22;
}
.pickers :focus-visible + span {
    outline: 2px solid var(--liquid-focus);
}

.gallery {
    flex: 1;
    min-height: 0;
    display: grid;
    align-content: start;
    grid-template-columns: repeat(auto-fit, minmax(min(100%, 276px), 1fr));
    gap: 20px 14px;
    overflow: auto;
    padding: 16px var(--catalog-gutter) calc(var(--liquid-dock-clearance) + 22px);
    scroll-padding-bottom: var(--liquid-dock-clearance);
}
.gallery section {
    min-width: 0;
}
.gallery h2 {
    margin: 0 0 8px 3px;
}

.stage,
.scene {
    --lg-appearance: dark;
    --lg-accent: #b3e8c6;
    --lg-selected-text: #efffec;
    color: #f7faf7;
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 154px;
    padding: 14px;
    border-radius: 18px;
}
.stage {
    position: relative;
    flex-wrap: wrap;
    gap: 8px;
    background:
        linear-gradient(150deg, #101b1f2b, #182b1e78),
        var(--preview-photo) center / cover;
    box-shadow: inset 0 0 0 1px #fff3;
}
.stage:focus-within {
    z-index: 1;
}

.quote,
.scene-label {
    padding: 12px 17px;
}
.quote-item {
    display: flex;
    align-items: center;
    gap: 8px;
}
.quote-item small {
    opacity: 0.85;
}
.quote strong {
    font-size: var(--fs-amount);
    font-weight: 400;
}
.control,
.control-width {
    width: min(280px, 100%);
}
.control {
    display: grid;
    gap: 10px;
    padding: 12px 15px;
}
.control-label {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
}
.search-stage {
    flex-direction: column;
}
.search-stage output {
    font-size: var(--fs-sm);
    text-shadow: 0 1px 4px #111;
}
.scroll-stage {
    display: block;
    overflow: hidden;
    padding: 0;
}
.timeline {
    display: grid;
    gap: 6px;
    overflow: auto;
    height: 154px;
    padding: 56px 10px 10px;
}
.timeline glass-surface {
    padding: 7px 12px;
}
.timeline-bar {
    position: absolute;
    inset: 9px 12px auto;
}
.scene {
    overflow: hidden;
}
.sheet-content {
    max-width: 360px;
    margin: 0 auto;
}
.sheet-content h2 {
    margin: 0;
}
</style>
