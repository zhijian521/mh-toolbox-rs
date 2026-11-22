<script setup lang="ts">
import { computed, ref } from 'vue';
import AppIcon from '../components/AppIcon.vue';
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
import GlassDialog from '../components/liquid-glass/GlassDialog.vue';
import GlassEmptyState from '../components/liquid-glass/GlassEmptyState.vue';
import GlassInput from '../components/liquid-glass/GlassInput.vue';
import GlassPriceField from '../components/liquid-glass/GlassPriceField.vue';
import GlassSelect from '../components/liquid-glass/GlassSelect.vue';
import { useLiquidPreferences } from '../composables/use-liquid-preferences';
import { moneyText, todayText } from '../services/format';
import { makeId } from '../services/shape';
import LiquidPriceCard from './prices/LiquidPriceCard.vue';
import LiquidPriceEditor from './prices/LiquidPriceEditor.vue';
import { sortedPoints, type PriceItem, type PricePointDraft } from './prices/prices';

const { wallpaper } = useLiquidPreferences();
const day = todayText();
const sampleItem = ref<PriceItem>({
    id: 'sample',
    name: '金刚石',
    category: '任务产出',
    sub: '五宝',
    unit: '个',
    note: '',
    createdAt: 0,
    updatedAt: 0,
    points: [
        { id: 'first', date: day, price: 830_000, note: '', createdAt: 0 },
        { id: 'second', date: day, price: 855_000, note: '', createdAt: 1 },
    ],
});
const history = computed(() => sortedPoints(sampleItem.value));
const sheetOpen = ref(false);
const editorOpen = ref(false);
function saveSample(draft: PricePointDraft) {
    sampleItem.value.points.push({ ...draft, id: makeId('sample'), createdAt: Date.now() });
    editorOpen.value = false;
}

const priceExample = ref<number | null>(3_200_000);
const initialPrice = ref<number | null>(null);
const name = ref('');
const note = ref('');
const category = ref('');
const formCategory = ref('任务产出');
const categories = [
    { value: '任务产出', label: '任务产出' },
    { value: '装备灵饰', label: '装备灵饰' },
    { value: '召唤兽', label: '召唤兽' },
];
const filterOptions = [{ value: '', label: '全部分类' }, ...categories];
const query = ref('');
const names = ['金刚石', '定魂珠', '夜光珠'];
const matches = computed(() => names.filter((item) => item.includes(query.value.trim())));
const alerts = ref(true);
const threshold = ref(62);
const currentTab = ref('prices');
const range = ref('week');
const sort = ref('名称');
const timeline = ref<HTMLElement | null>(null);
const observations = [
    '06:15　记录金刚石行情',
    '07:40　更新定魂珠价格',
    '08:25　查看历史',
    '09:50　补记夜光珠价格',
    '11:10　更新五宝行情',
];
</script>

<template>
    <div class="component-catalog">
        <header class="intro"><h1>组件</h1></header>
        <div class="gallery">
            <h2>物价与录入</h2>
            <section>
                <header><h3>物价卡片</h3></header>
                <div class="stage">
                    <LiquidPriceCard
                        class="sample-card"
                        :item="sampleItem"
                        @history="sheetOpen = true"
                        @record="editorOpen = true"
                    />
                </div>
            </section>
            <section>
                <header>
                    <h3>按钮</h3>
                    <small>行内 · 表单</small>
                </header>
                <div class="stage stack">
                    <div class="example-row">
                        <span class="sample-label">卡内操作</span>
                        <GlassButton
                            size="small"
                            class="lg-inline-action"
                            variant="plain"
                            @click="sheetOpen = true"
                            >历史</GlassButton
                        >
                        <GlassButton
                            size="small"
                            class="lg-inline-action"
                            @click="editorOpen = true"
                            >记价</GlassButton
                        >
                    </div>
                    <div class="example-row">
                        <span class="sample-label">表单操作</span>
                        <GlassButton size="small" variant="prominent" @click="editorOpen = true"
                            >编辑价格</GlassButton
                        >
                        <GlassButton
                            size="small"
                            shape="circle"
                            aria-label="新增价格记录"
                            @click="editorOpen = true"
                            ><AppIcon name="add"
                        /></GlassButton>
                    </div>
                </div>
            </section>
            <section>
                <header>
                    <h3>价格输入</h3>
                    <small>记价 · 初始价</small>
                </header>
                <div class="stage stack">
                    <GlassPriceField v-model="priceExample" label="这一笔多少钱" />
                    <GlassPriceField v-model="initialPrice" label="初始价格（选填）" compact />
                </div>
            </section>
            <section>
                <header>
                    <h3>输入框</h3>
                    <small>表单 · 标准</small>
                </header>
                <div class="stage stack">
                    <label class="field-example lg-form-fields"
                        >物品名称<GlassInput v-model="name" placeholder="例如：金刚石"
                    /></label>
                    <label class="field-example"
                        >备注<GlassInput v-model="note" placeholder="选填"
                    /></label>
                </div>
            </section>
            <section>
                <header>
                    <h3>下拉选择</h3>
                    <small>筛选 · 表单</small>
                </header>
                <div class="stage select-examples">
                    <GlassSelect
                        v-model="category"
                        class="lg-category-filter"
                        label="一级分类"
                        :options="filterOptions"
                    />
                    <GlassSelect
                        v-model="formCategory"
                        class="lg-category-filter lg-form-fields"
                        label="录入分类"
                        :options="categories"
                    />
                </div>
            </section>
            <section>
                <header><h3>搜索框</h3></header>
                <div class="stage stack">
                    <GlassSearch
                        v-model:value="query"
                        class="lg-price-search"
                        aria-label="搜索示例物品"
                        placeholder="搜索物品"
                    />
                    <output v-if="matches.length" class="lg-caption">{{
                        matches.join(' · ')
                    }}</output>
                    <GlassEmptyState v-else />
                </div>
            </section>

            <h2>选择与导航</h2>
            <section>
                <header><h3>开关</h3></header>
                <div class="stage">
                    <div class="setting-row">
                        <span>价格提醒</span><output>{{ alerts ? '开启' : '关闭' }}</output
                        ><GlassSwitch v-model:checked="alerts" aria-label="价格提醒" />
                    </div>
                </div>
            </section>
            <section>
                <header><h3>滑块</h3></header>
                <div class="stage">
                    <div class="field-example">
                        <div class="setting-row">
                            <span>提醒阈值</span><output>{{ threshold }} 万</output>
                        </div>
                        <GlassSlider
                            v-model:value="threshold"
                            :step="1"
                            aria-label="提醒阈值（万）"
                        />
                    </div>
                </div>
            </section>
            <section>
                <header><h3>分段选择</h3></header>
                <div class="stage">
                    <GlassSegmented v-model:value="range" aria-label="时间范围">
                        <GlassSegment value="day">今天</GlassSegment
                        ><GlassSegment value="week">本周</GlassSegment
                        ><GlassSegment value="month">本月</GlassSegment>
                    </GlassSegmented>
                </div>
            </section>
            <section>
                <header><h3>标签栏</h3></header>
                <div class="stage">
                    <GlassTabBar v-model:value="currentTab" aria-label="示例导航">
                        <GlassTab value="overview"><AppIcon name="overview" />概览</GlassTab>
                        <GlassTab value="prices"><AppIcon name="prices" />物价</GlassTab>
                        <GlassTab value="income"><AppIcon name="income" />收益</GlassTab>
                    </GlassTabBar>
                </div>
            </section>
            <section>
                <header><h3>菜单</h3></header>
                <div class="stage">
                    <GlassMenu @select="sort = $event === 'reset' ? '名称' : $event">
                        <template #trigger
                            ><GlassButton size="small"
                                >按{{ sort }}排序 <AppIcon name="chevron-down" /></GlassButton
                        ></template>
                        <GlassMenuLabel>排序方式</GlassMenuLabel>
                        <GlassMenuItem
                            v-for="option in ['名称', '时间']"
                            :key="option"
                            :value="option"
                            group="sort"
                            checkable
                            :checked="sort === option"
                            >{{ option }}</GlassMenuItem
                        >
                        <GlassMenuSeparator /><GlassMenuItem value="reset">恢复默认</GlassMenuItem>
                    </GlassMenu>
                </div>
            </section>
            <section>
                <header><h3>工具栏</h3></header>
                <div class="stage">
                    <GlassToolbar aria-label="价格工具栏">
                        <span>金刚石</span><GlassSpacer />
                        <GlassGroup aria-label="价格操作">
                            <GlassButton
                                size="small"
                                variant="plain"
                                shape="circle"
                                aria-label="查看示例历史"
                                @click="sheetOpen = true"
                                ><AppIcon name="history"
                            /></GlassButton>
                            <GlassButton
                                size="small"
                                variant="plain"
                                shape="circle"
                                aria-label="编辑示例价格"
                                @click="editorOpen = true"
                                ><AppIcon name="edit"
                            /></GlassButton>
                        </GlassGroup>
                    </GlassToolbar>
                </div>
            </section>

            <h2>弹层与反馈</h2>
            <section>
                <header><h3>对话框</h3></header>
                <div class="stage">
                    <GlassButton size="small" @click="editorOpen = true">打开记价表单</GlassButton>
                </div>
            </section>
            <section>
                <header><h3>底部弹层</h3></header>
                <div class="stage">
                    <GlassButton size="small" aria-haspopup="dialog" @click="sheetOpen = true"
                        >查看价格历史</GlassButton
                    >
                </div>
            </section>
            <section>
                <header><h3>空状态</h3></header>
                <div class="stage"><GlassEmptyState /></div>
            </section>
            <section>
                <header><h3>滚动边缘</h3></header>
                <div class="stage scroll-stage">
                    <div ref="timeline" class="timeline" tabindex="0" aria-label="操作记录">
                        <GlassCard v-for="item in observations" :key="item" :radius="10">{{
                            item
                        }}</GlassCard>
                    </div>
                    <GlassProgressiveBlur edge="top" :size="40" />
                    <GlassToolbar class="timeline-bar" aria-label="记录工具栏">
                        <span>操作记录</span><GlassSpacer /><GlassButton
                            size="small"
                            class="lg-inline-action"
                            @click="timeline?.scrollTo({ top: 0 })"
                            >回到顶部</GlassButton
                        >
                    </GlassToolbar>
                </div>
            </section>
            <section>
                <header><h3>场景容器</h3></header>
                <GlassScene class="stage scene" :src="wallpaper"
                    ><GlassCard :radius="15" class="scene-label">应用壁纸</GlassCard></GlassScene
                >
            </section>
        </div>
        <GlassDialog v-model:open="editorOpen" label="示例记价">
            <LiquidPriceEditor
                v-if="editorOpen"
                :item="sampleItem"
                :categories="[]"
                active
                :saving="false"
                :locked="false"
                :retrying="false"
                error=""
                @save="saveSample"
                @cancel="editorOpen = false"
            />
        </GlassDialog>
        <GlassSheet
            v-model:open="sheetOpen"
            class="sample-history"
            detents="small medium"
            aria-label="示例价格历史"
            modal
        >
            <div class="sheet-content">
                <header>
                    <h2>金刚石 · 价格历史</h2>
                    <GlassButton size="small" @click="sheetOpen = false">关闭</GlassButton>
                </header>
                <ol>
                    <li v-for="point in history" :key="point.id">
                        <time :datetime="point.date">{{ point.date }}</time
                        >{{ moneyText(point.price) }}
                    </li>
                </ol>
            </div>
        </GlassSheet>
    </div>
</template>

<style scoped src="./liquid-components.css"></style>
