<script setup lang="ts">
import { computed, ref } from 'vue';
import { notify } from '../composables/use-notify';
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
import GlassDateField from '../components/liquid-glass/GlassDateField.vue';
import GlassDialog from '../components/liquid-glass/GlassDialog.vue';
import GlassEmptyState from '../components/liquid-glass/GlassEmptyState.vue';
import GlassInput from '../components/liquid-glass/GlassInput.vue';
import GlassPriceField from '../components/liquid-glass/GlassPriceField.vue';
import GlassMenuTrigger from '../components/liquid-glass/GlassMenuTrigger.vue';
import GlassMultiSelect from '../components/liquid-glass/GlassMultiSelect.vue';
import GlassTable from '../components/liquid-glass/GlassTable.vue';
import GlassSelect from '../components/liquid-glass/GlassSelect.vue';
import { useLiquidPreferences } from '../composables/use-liquid-preferences';
import { moneyText, todayText } from '../services/format';
import { makeId } from '../services/shape';
import LiquidPriceCard from './prices/LiquidPriceCard.vue';
import LiquidPriceEditor from './prices/LiquidPriceEditor.vue';
import { sortedPoints, type PriceItem, type PricePoint, type PricePointDraft } from './prices/prices';

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
const editingPoint = ref<PricePoint>();
function openSample(mode: 'add' | 'edit') {
    editingPoint.value = mode === 'edit' ? history.value[0] : undefined;
    editorOpen.value = true;
}
function saveSample(draft: PricePointDraft) {
    if (editingPoint.value) Object.assign(editingPoint.value, draft);
    else sampleItem.value.points.push({ ...draft, id: makeId('sample'), createdAt: Date.now() });
    editorOpen.value = false;
}

const priceExample = ref<number | null>(3_200_000);
const initialPrice = ref<number | null>(null);
const fieldRows = ref(['紧凑', '标准'].map((size) => ({ size, name: '', category: '', date: day, query: '' })));
const invalidPrice = ref<number | null>(0);
const unavailableCategory = ref('');
const categories = [
    { value: '任务产出', label: '任务产出' },
    { value: '装备灵饰', label: '装备灵饰' },
    { value: '召唤兽', label: '召唤兽' },
];
const filterOptions = [{ value: '', label: '全部分类' }, ...categories];
const names = ['金刚石', '定魂珠', '夜光珠'];
function searchExamples(query: string) {
    return names.filter((item) => item.includes(query.trim()));
}
const alerts = ref(true);
const threshold = ref(62);
const currentTab = ref('prices');
const choiceExamples = ref((['compact', 'standard'] as const).map((size) => ({
    size,
    label: size === 'compact' ? '紧凑' : '标准',
    status: 'active',
    categories: ['任务产出', '召唤兽'],
})));
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
        <!-- 按组件类型分组，不按业务场景：卡片 / 按钮 / 输入 / 选择 / 容器 / 反馈。 -->
        <div class="gallery lg-scroll-hidden">
            <h2>卡片</h2>
            <section>
                <header><h3>物价卡片</h3></header>
                <div class="stage">
                    <LiquidPriceCard
                        class="sample-card"
                        :item="sampleItem"
                        @history="sheetOpen = true"
                        @record="openSample('add')"
                    />
                </div>
            </section>

            <h2>按钮与菜单</h2>
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
                            @click="openSample('add')"
                            >记价</GlassButton
                        >
                    </div>
                    <div class="example-row">
                        <span class="sample-label">表单操作</span>
                        <GlassButton size="small" @click="openSample('edit')"
                            >编辑价格</GlassButton
                        >
                        <GlassButton
                            size="small"
                            shape="circle"
                            aria-label="新增价格记录"
                            @click="openSample('add')"
                            ><AppIcon name="add"
                        /></GlassButton>
                    </div>
                </div>
            </section>
            <section>
                <header><h3>菜单</h3></header>
                <div class="stage">
                    <GlassMenu class="lg-popup-menu lg-select-menu lg-form-fields" @select="sort = $event === 'reset' ? '名称' : $event">
                        <template #trigger>
                            <GlassMenuTrigger :text="'按' + sort + '排序'" aria-label="选择排序方式" />
                        </template>
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

            <h2>输入控件</h2>
            <section v-for="row in fieldRows" :key="row.size" class="field-comparison"
                :class="{ 'lg-form-fields': row.size === '紧凑' }">
                <header><h3>{{ row.size }}输入控件</h3><small>{{ row.size === '紧凑' ? '32' : '44' }} px</small></header>
                <div class="comparison-grid">
                    <div class="field-example">
                        <span>搜索物品</span>
                        <GlassSearch v-model:value="row.query" class="lg-price-search" :aria-label="row.size + '搜索物品'" placeholder="搜索物品" />
                    </div>
                    <label class="field-example">物品名称<GlassInput v-model="row.name" placeholder="例如：金刚石" /></label>
                    <GlassSelect v-model="row.category" :options="filterOptions" label="一级分类" />
                    <GlassDateField v-model="row.date" label="记录日期" />
                </div>
                <div v-if="row.query.trim()" class="comparison-results" role="status">
                    <output v-if="searchExamples(row.query).length" class="lg-caption">{{ searchExamples(row.query).join(' · ') }}</output>
                    <GlassEmptyState v-else />
                </div>
            </section>
            <section>
                <header><h3>输入状态</h3><small>错误 · 禁用</small></header>
                <div class="stage stack lg-form-fields">
                    <GlassPriceField v-model="invalidPrice" compact label="记录价格" :error="(invalidPrice ?? 0) > 0 ? '' : '价格要大于 0'" reserve-error />
                    <GlassSelect v-model="unavailableCategory" class="field-example" label="二级分类" :options="[]" disabled />
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
            <h2>选择控件</h2>
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
            <template v-for="example in choiceExamples" :key="example.size">
                <section>
                    <header><h3>{{ example.label }}分段选择</h3></header>
                    <div class="stage">
                        <GlassSegmented v-model:value="example.status" class="lg-status-tabs" :data-size="example.size" :aria-label="example.label + '目标状态'">
                            <GlassSegment value="active">进行中</GlassSegment>
                            <GlassSegment value="done">已达成</GlassSegment>
                            <GlassSegment value="all">全部</GlassSegment>
                        </GlassSegmented>
                    </div>
                </section>
                <section>
                    <header><h3>{{ example.label }}多选</h3></header>
                    <div class="stage">
                        <GlassMultiSelect v-model="example.categories" :options="categories" :size="example.size" :label="example.label + '示例物品分类'" />
                    </div>
                </section>
            </template>
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

            <h2>容器与表面</h2>
            <section>
                <header><h3>表格</h3></header>
                <div class="stage">
                    <GlassTable aria-label="示例物价记录">
                        <thead><tr><th scope="col">日期</th><th scope="col">价格</th></tr></thead>
                        <tbody>
                            <tr v-for="point in history" :key="point.id">
                                <td>{{ point.date }}</td><td>{{ moneyText(point.price) }}</td>
                            </tr>
                        </tbody>
                    </GlassTable>
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
                                @click="openSample('edit')"
                                ><AppIcon name="edit"
                            /></GlassButton>
                        </GlassGroup>
                    </GlassToolbar>
                </div>
            </section>
            <section>
                <header><h3>场景容器</h3></header>
                <GlassScene class="stage scene" :src="wallpaper"
                    ><GlassCard :radius="15" class="scene-label">应用壁纸</GlassCard></GlassScene
                >
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

            <h2>反馈与弹层</h2>
            <section>
                <header><h3>提示</h3></header>
                <div class="stage">
                    <GlassButton size="small" class="sample-notice" @click="notify.info('这是一条顶部消息提示。')">
                        显示顶部提示
                    </GlassButton>
                </div>
            </section>
            <section>
                <header><h3>对话框</h3></header>
                <div class="stage">
                    <GlassButton size="small" @click="openSample('add')">打开记价表单</GlassButton>
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
        </div>
        <GlassDialog v-model:open="editorOpen" :label="editingPoint ? '编辑示例价格' : '示例记价'">
            <LiquidPriceEditor
                v-if="editorOpen"
                :item="sampleItem"
                :point="editingPoint"
                prefill-current
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
