<script setup lang="ts">
import { onMounted, ref } from 'vue';
import AppIcon from '../components/AppIcon.vue';
import BaseCheck from '../components/BaseCheck.vue';
import BevelPill from '../components/BevelPill.vue';
import CostSwitch from '../components/CostSwitch.vue';
import FontSizeSlider from '../components/FontSizeSlider.vue';
import LedgerSection from '../components/LedgerSection.vue';
import PageHeader from '../components/PageHeader.vue';
import SealMark from '../components/SealMark.vue';
import SegmentedPills from '../components/SegmentedPills.vue';
import SlotButton from '../components/SlotButton.vue';
import { ICON_GROUPS, ICON_LABELS } from '../components/icons';
import { useFontScale } from '../composables/use-font-scale';
import { useTheme, type ThemeMode } from '../composables/use-theme';
import { appInfo, type AppInfo } from '../services/desktop';

/**
 * 设置页：这一版只做两件事——把主题与字号两条通路跑通，把设计语言落成真组件。
 *
 * 组件预览不是「演示页」，它是这套语言的验收面：色板、字号、凹槽、开关、勾选、印章、
 * 文武线与账线都在这里出现一次。以后新增控件先加进这一块，再进业务页面。
 */
const { mode } = useTheme();
const { scale } = useFontScale();

/* 分段胶囊只认 { value, label }：选项怎么描述由调用方定，组件不掺业务字段。 */
const themeOptions: { value: ThemeMode; label: string }[] = [
    { value: 'system', label: '跟随系统' },
    { value: 'light', label: '浅色' },
    { value: 'dark', label: '深色' },
];

const info = ref<AppInfo | null>(null);
onMounted(async () => {
    info.value = await appInfo();
});

/* 组件预览的交互状态 */
const picked = ref('小号一');
const cardCost = ref(true);
const autoSave = ref(false);
const onlyEarn = ref(true);
const withCost = ref(false);

/* 图标清单直接按 icons.ts 的分组渲染，新加图标不用回来改这一页。 */

const swatches: { token: string; label: string }[] = [
    { token: '--bg', label: '页面底' },
    { token: '--paper', label: '纸面' },
    { token: '--paper-2', label: '纸面·次' },
    { token: '--well', label: '凹槽' },
    { token: '--rule', label: '账线' },
    { token: '--rule-2', label: '描边' },
    { token: '--ink', label: '墨' },
    { token: '--ink-2', label: '正文' },
    { token: '--muted', label: '淡墨' },
    { token: '--cinnabar', label: '朱' },
    { token: '--ochre', label: '赭' },
    { token: '--indigo', label: '靛' },
    { token: '--moss', label: '苔' },
];

/* 全站唯一字体，所以这里只列字号；px 是「默认档」下的实际值。 */
const typeScale: { token: string; px: string; usage: string; size: string }[] = [
    { token: '--fs-mini', px: '10px', usage: '印章 · 表头', size: 'var(--fs-mini)' },
    { token: '--fs-xs', px: '11px', usage: '元信息 · 时间', size: 'var(--fs-xs)' },
    { token: '--fs-sm', px: '12px', usage: '胶囊 · 流水', size: 'var(--fs-sm)' },
    { token: '--fs-base', px: '13.5px', usage: '正文 · 表单', size: 'var(--fs-base)' },
    { token: '--fs-md', px: '14.5px', usage: '分栏标题', size: 'var(--fs-md)' },
    { token: '--fs-lg', px: '17px', usage: '弹窗标题', size: 'var(--fs-lg)' },
    { token: '--fs-xl', px: '22px', usage: '页面标题', size: 'var(--fs-xl)' },
    { token: '--fs-amount', px: '29px', usage: '金额', size: 'var(--fs-amount)' },
];
</script>

<template>
    <PageHeader title="设置" desc="主题 · 组件预览 · 关于">
        <span class="hint">设计样张见 design/income.html</span>
    </PageHeader>

    <div class="page-content">
        <div class="stack">
            <!-- 主题 -->
            <LedgerSection title="外观" seal="貌" hint="一键换纸：令牌全部走 light-dark()">
                <div class="row">
                    <span class="row-label">主题</span>
                    <SegmentedPills v-model="mode" :options="themeOptions" label="主题" />
                    <span class="hint"
                        >当前：{{ themeOptions.find((item) => item.value === mode)?.label }}</span
                    >
                </div>
                <div class="row row-gap">
                    <span class="row-label">字号</span>
                    <FontSizeSlider v-model="scale" />
                    <span class="hint">全站文字同步缩放，印章与金额一起变</span>
                </div>
                <p class="note">
                    切主题只改根元素上的 <code>color-scheme</code>，颜色令牌不需要第二份；
                    「跟随系统」时监听 <code>prefers-color-scheme</code>，Tauri 侧以后接
                    <code>setTheme('system')</code> 即可，前端不用改。 字号同理：三档只改
                    <code>--fs-scale</code> 一个变量（0.92 / 1 / 1.1）， 八档字号全是
                    <code>calc(Npx * var(--fs-scale))</code>。
                </p>
            </LedgerSection>

            <!-- 原子组件：三个被抽出来复用的小件，业务页面直接拿去用 -->
            <LedgerSection title="原子组件" seal="原" hint="抽出来复用的三件，业务页直接拿去用">
                <div class="kit atoms-kit">
                    <div class="kit-cell">
                        <span class="col-head">SegmentedPills · 分段胶囊</span>
                        <div class="kit-row">
                            <SegmentedPills v-model="mode" :options="themeOptions" label="主题" />
                        </div>
                        <p class="note">
                            一组里选一个。选项文案与值的类型由调用方给（泛型 T）， 单格质感全交给
                            <code>BevelPill</code>，它自己不重复写。
                        </p>
                    </div>

                    <div class="kit-cell">
                        <span class="col-head">FontSizeSlider · 三档滑块</span>
                        <div class="kit-row">
                            <FontSizeSlider v-model="scale" />
                        </div>
                        <p class="note">
                            三个落点，不是连续值——所以滑块要「啪」地掉到格上（240ms 回弹），
                            而不是三格各自变亮。凹轨道由它自己带。
                        </p>
                    </div>

                    <div class="kit-cell">
                        <span class="col-head">SlotButton · 槽按钮</span>
                        <div class="kit-row">
                            <SlotButton label="主题"><AppIcon name="moon" /></SlotButton>
                            <SlotButton label="仓库"><AppIcon name="github" /></SlotButton>
                            <SlotButton label="收起"><AppIcon name="rail-collapse" /></SlotButton>
                            <SlotButton label="停用" disabled><AppIcon name="trash" /></SlotButton>
                        </div>
                        <p class="note">
                            常态是槽（槽底 + 金边），悬停时朱印内缩 1px 落进去——移上去看。
                            尺寸不写死：侧栏经 <code>--slot-h</code> / <code>--slot-w</code> 传 30px
                            正方形。
                        </p>
                    </div>
                </div>
            </LedgerSection>

            <!-- 色板 -->
            <LedgerSection title="色板" seal="色" hint="纸是暖的，墨是灰的，朱只给三处">
                <div class="swatches">
                    <div v-for="item in swatches" :key="item.token" class="swatch">
                        <i :style="{ '--c': `var(${item.token})` }" />
                        <span>
                            <b>{{ item.label }}</b>
                            <code>{{ item.token }}</code>
                        </span>
                    </div>
                </div>
            </LedgerSection>

            <!-- 字号 -->
            <LedgerSection title="字号阶梯" seal="字" hint="霞鹜文楷 · 八档 · 受上方滑块控制">
                <div class="type-scale">
                    <div v-for="item in typeScale" :key="item.token" class="type-row">
                        <code class="type-token">{{ item.token }}</code>
                        <em class="type-px">{{ item.px }}</em>
                        <span class="type-sample" :style="{ fontSize: item.size }">
                            {{ item.usage }} · 梦幻养老助手 328.6 万
                        </span>
                    </div>
                </div>
            </LedgerSection>

            <!-- 控件 -->
            <LedgerSection title="控件" seal="件" hint="一种动作只有一种质感">
                <div class="kit">
                    <div class="kit-cell">
                        <span class="col-head">按钮</span>
                        <div class="kit-row">
                            <button class="btn" type="button">次要</button>
                            <button class="btn primary" type="button">
                                <AppIcon name="add" :size="13" />主要
                            </button>
                            <button class="btn compact" type="button">
                                <AppIcon name="download" :size="12" />导出
                            </button>
                            <button class="btn" type="button" disabled>禁用</button>
                            <button class="icon-button" type="button" title="编辑">
                                <AppIcon name="edit" :size="13" />
                            </button>
                            <button class="icon-button" type="button" title="删除">
                                <AppIcon name="trash" :size="13" />
                            </button>
                        </div>
                        <p class="note">灌朱的按钮一页不超过两个，主操作只留一个。</p>
                    </div>

                    <div class="kit-cell">
                        <span class="col-head">凹槽胶囊 · 单选</span>
                        <div class="kit-row pill-group">
                            <BevelPill
                                v-for="name in ['主号', '小号一', '小号二']"
                                :key="name"
                                :on="picked === name"
                                @click="picked = name"
                            >
                                {{ name }}
                            </BevelPill>
                            <BevelPill disabled>已归档</BevelPill>
                        </div>
                        <p class="note">
                            凹要四件齐（槽底、上暗下亮、上沿内阴影、下沿高光）；选中是灌满，不是描边。
                        </p>
                    </div>

                    <div class="kit-cell">
                        <span class="col-head">两格开关 · 位移</span>
                        <div class="kit-row">
                            <CostSwitch v-model="cardCost" />
                            <CostSwitch v-model="autoSave" off-label="手动" on-label="自动" />
                        </div>
                        <p class="note">
                            滑块 240ms
                            <code>cubic-bezier(0.34,1.28,0.6,1)</code>
                            带过冲；关闭态是灭灯，不是变灰。
                        </p>
                    </div>

                    <div class="kit-cell">
                        <span class="col-head">勾选</span>
                        <div class="kit-row checks">
                            <BaseCheck v-model="onlyEarn">只显示进账</BaseCheck>
                            <BaseCheck v-model="withCost">含点卡成本</BaseCheck>
                            <BaseCheck :model-value="false" disabled>停用项</BaseCheck>
                        </div>
                        <p class="note">
                            多选用胶囊、互斥用开关、是/否用勾选——别把三种语义混着用。
                        </p>
                    </div>

                    <div class="kit-cell">
                        <span class="col-head">印章</span>
                        <div class="kit-row seals">
                            <SealMark text="梦" />
                            <SealMark text="记" />
                            <SealMark text="账" solid />
                            <span class="hint"
                                >标记已定稿 / 已入账 / 已达成，全站唯一允许歪 2.5° 的元素。</span
                            >
                        </div>
                    </div>

                    <div class="kit-cell">
                        <span class="col-head">金额</span>
                        <div class="amount-demo">
                            <span class="amount-value">232.6<i>万</i></span>
                            <span class="amount-note">净收益 · 今日</span>
                        </div>
                        <p class="note">
                            金额单独一档字号（29px），下方一条金额线；它是唯一允许超过页面标题的字。
                        </p>
                    </div>
                </div>
            </LedgerSection>

            <!-- 图标 -->
            <LedgerSection title="图标" seal="图" hint="成套线稿 · 24 网格 · 笔宽 1.8 · 随字号缩放">
                <div class="icon-sheet">
                    <div v-for="group in ICON_GROUPS" :key="group.label" class="icon-group">
                        <div class="icon-group-head">
                            <span class="icon-group-label">{{ group.label }}</span>
                            <span class="icon-group-note">{{ group.note }}</span>
                            <span class="icon-group-count">{{ group.names.length }}</span>
                        </div>
                        <div class="icon-list">
                            <div v-for="name in group.names" :key="name" class="icon-item">
                                <AppIcon :name="name" :size="18" />
                                <b>{{ ICON_LABELS[name] }}</b>
                                <code>{{ name }}</code>
                            </div>
                        </div>
                    </div>
                </div>

                <p class="note">
                    图标来自成套库（tabler），我们只维护「业务名 → 图标」的映射。早先那套是手画的 16
                    格 path，问题不在能不能画对，而在一致性——28 个图标一次画完，圆角、边长比例、
                    留白各走各的，放大看就参差，加一个新图标还得重新对齐一次。 实际使用尺寸是
                    <code>calc(14px * var(--fs-scale))</code>，调大字号图标一起长； 下面的清单固定
                    18px，只为看清形状。标题栏三个窗口键另用固定 13px。
                </p>
            </LedgerSection>

            <!-- 结构 -->
            <LedgerSection title="结构" seal="构" hint="结构靠线，不靠阴影">
                <div class="structure">
                    <div class="ledger-demo">
                        <div class="ledger-head">
                            <span class="col-head">时间</span>
                            <span class="col-head">角色</span>
                            <span class="col-head">来源</span>
                            <span class="col-head amount-col">金额</span>
                        </div>
                        <div
                            v-for="row in [
                                ['09:12', '黑山老妖', '师门任务', '8.8'],
                                ['11:44', '一剪梅', '金柳露 ×3', '8.4'],
                                ['12:25', '五开合计', '点卡成本', '96.0'],
                            ]"
                            :key="row[0]"
                            class="ledger-line"
                        >
                            <span class="time">{{ row[0] }}</span>
                            <span>{{ row[1] }}</span>
                            <span class="from">{{ row[2] }}</span>
                            <span class="amount-col num" :class="{ out: row[3] === '96.0' }">{{
                                row[3]
                            }}</span>
                        </div>
                    </div>
                    <div class="structure-note">
                        <p class="note">
                            <b>文武线</b>：外框 1px <code>--rule-2</code> + 内框 1px
                            <code>--rule</code>，中间留 3px——
                            本页每个区块都是它，替代旧版的「圆角卡片 + 投影」。
                        </p>
                        <p class="note">
                            <b>账线</b>：行高严格 28px，线在 27–28px
                            之间。只用在「一行一条记录」的列表上，
                            铺到底色上就成格子纸，反而看不清字。
                        </p>
                    </div>
                </div>
            </LedgerSection>

            <!-- 关于 -->
            <LedgerSection title="关于" seal="关" hint="版本与运行环境">
                <dl class="about">
                    <dt>产品名</dt>
                    <dd>{{ info?.productName ?? '梦幻养老助手' }}（开发中）</dd>
                    <dt>版本</dt>
                    <dd>
                        <template v-if="info">{{ info.version }}</template>
                        <template v-else
                            ><span class="warn">未连到 Rust 侧</span>（浏览器预览）</template
                        >
                    </dd>
                    <dt>标识</dt>
                    <dd>
                        <code>{{ info?.identifier ?? 'com.zhijian.mhtoolbox.rs' }}</code>
                    </dd>
                    <dt>数据目录</dt>
                    <dd>
                        <code>{{ info?.dataDir ?? '%APPDATA%\\mh-tool-v2' }}</code>
                    </dd>
                    <dt>运行环境</dt>
                    <dd>{{ info?.webview ?? '系统 WebView2（Tauri 2）' }}</dd>
                    <dt>字体</dt>
                    <dd>霞鹜文楷 Screen（SIL OFL 1.1，全量不子集化）</dd>
                </dl>
            </LedgerSection>
        </div>
    </div>
</template>

<style scoped>
.stack {
    display: flex;
    flex-direction: column;
    gap: 14px;
    max-width: 1240px;
}

/* ---------- 通用行 ---------- */
.row {
    display: flex;
    align-items: center;
    gap: 12px;
    flex-wrap: wrap;
}
.row-gap {
    margin-top: 12px;
}
.row-label {
    color: var(--muted);
    font-family: var(--font-ui);
    font-size: var(--fs-xs);
    letter-spacing: 0.14em;
}
/* 凹槽胶囊要垫一层 --paper 承载面：直接摆在页面底色上读不出凹（暗色下尤甚）。 */
.pill-group {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 3px;
    border-radius: var(--r-pill);
    background: var(--paper-2);
}
.note {
    margin-top: 8px;
    color: var(--muted);
    font-size: var(--fs-xs);
    line-height: 1.72;
}
.note code,
dd code {
    font-family: var(--font-ui);
    font-size: var(--fs-xs);
    letter-spacing: 0;
}
.note b {
    color: var(--ink-2);
    font-weight: 400;
}

/* ---------- 色板 ---------- */
.swatches {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(148px, 1fr));
    gap: 8px;
}
.swatch {
    display: flex;
    align-items: center;
    gap: 9px;
    padding: 6px 8px;
    border: var(--w-hair) solid var(--rule);
}
.swatch i {
    flex: none;
    width: 26px;
    height: 26px;
    border: var(--w-hair) solid var(--rule-2);
    background: var(--c);
}
.swatch span {
    display: flex;
    flex-direction: column;
    min-width: 0;
    color: var(--muted);
    font-size: var(--fs-xs);
}
.swatch b {
    color: var(--ink);
    font-size: var(--fs-sm);
    font-weight: 400;
}
.swatch code {
    font-family: var(--font-ui);
    font-size: var(--fs-mini);
    letter-spacing: 0;
}

/* ---------- 字号 ---------- */
.type-scale {
    display: flex;
    flex-direction: column;
    gap: 7px;
}
.type-row {
    display: flex;
    align-items: baseline;
    gap: 14px;
    padding-bottom: 7px;
    border-bottom: 1px dashed var(--rule);
}
.type-row:last-child {
    padding-bottom: 0;
    border-bottom: 0;
}
.type-token {
    flex: none;
    width: 96px;
    color: var(--muted);
    font-family: var(--font-ui);
    font-size: var(--fs-xs);
    letter-spacing: 0;
}
.type-px {
    flex: none;
    width: 52px;
    color: var(--muted);
    font-family: var(--font-ui);
    font-size: var(--fs-xs);
    font-style: normal;
}
.type-sample {
    color: var(--ink);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

/* ---------- 控件 ---------- */
.kit {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(330px, 1fr));
    gap: 14px;
}
.kit-cell {
    display: flex;
    flex-direction: column;
    gap: 7px;
    padding: 10px 11px 11px;
    border: var(--w-hair) solid var(--rule);
    background: var(--bg);
}
.kit-row {
    display: flex;
    align-items: center;
    gap: 7px;
    flex-wrap: wrap;
}
.kit-row.checks {
    gap: 14px;
    padding: 2px 0;
}
.kit-row.seals {
    gap: 10px;
}
.kit-cell .note {
    margin-top: 0;
}

/* ---------- 金额 ---------- */
.amount-demo {
    display: flex;
    align-items: center;
    gap: 12px;
}
.amount-value {
    padding-bottom: 3px;
    border-bottom: var(--w-hair) solid var(--rule-2);
    color: var(--ink);
    font-size: var(--fs-amount);
    line-height: 1.2;
    font-variant-numeric: tabular-nums;
}
.amount-value i {
    margin-left: 4px;
    color: var(--muted);
    font-family: var(--font-ui);
    font-size: var(--fs-sm);
    font-style: normal;
}
.amount-note {
    color: var(--muted);
    font-size: var(--fs-xs);
}

/* ---------- 图标 ----------
 * 不堆卡片格子。图标清单本质是一张目录：一行（或一格）一条记录，靠账线分隔、
 * 靠留白呼吸。28 个描边方框堆在一起是最典型的模板感，也正是这次要修掉的。
 */
.icon-group {
    padding-top: 14px;
}
.icon-group-head {
    display: flex;
    align-items: baseline;
    gap: 8px;
    padding-bottom: 5px;
    border-bottom: var(--w-hair) solid var(--rule-2);
}
.icon-group-label {
    color: var(--ink);
    font-size: var(--fs-sm);
    letter-spacing: 0.1em;
}
.icon-group-note {
    color: var(--muted);
    font-size: var(--fs-mini);
}
.icon-group-count {
    margin-left: auto;
    color: var(--muted);
    font-size: var(--fs-mini);
    font-variant-numeric: tabular-nums;
}
.icon-list {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
}
.icon-item {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
    padding: 7px 8px 7px 2px;
    border-bottom: var(--w-hair) solid var(--rule);
    color: var(--ink-2);
    font-size: var(--fs-xs);
}
.icon-item b {
    flex: none;
    color: var(--ink);
    font-weight: normal;
    letter-spacing: 0.04em;
}
.icon-item code {
    min-width: 0;
    margin-left: 6px;
    overflow: hidden;
    color: var(--muted);
    font-family: var(--font-ui);
    font-size: var(--fs-mini);
    text-overflow: ellipsis;
    white-space: nowrap;
    opacity: 0.7;
}
.icon-item:hover code {
    opacity: 1;
}

/* ---------- 结构 ---------- */
.structure {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    gap: 16px;
}
.ledger-demo {
    border-top: var(--w-rule) solid var(--rule-2);
}
.ledger-head,
.ledger-line {
    display: grid;
    grid-template-columns: 54px 92px minmax(0, 1fr) 70px;
    align-items: center;
    gap: 8px;
    height: 28px;
    font-size: var(--fs-sm);
}
.ledger-head {
    height: 24px;
    border-bottom: var(--w-hair) solid var(--rule-2);
}
.ledger-line {
    border-bottom: var(--w-hair) solid var(--rule);
}
.ledger-line .time {
    color: var(--muted);
    font-family: var(--font-ui);
    font-size: var(--fs-xs);
    font-variant-numeric: tabular-nums;
}
.ledger-line .from {
    color: var(--ink);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}
.amount-col {
    text-align: right;
}
.ledger-line .amount-col {
    color: var(--ink);
}
.ledger-line .amount-col.out {
    color: var(--cinnabar);
}
.structure-note {
    display: flex;
    flex-direction: column;
    gap: 6px;
}

/* ---------- 关于 ---------- */
.about {
    display: grid;
    grid-template-columns: 84px minmax(0, 1fr);
    gap: 6px 12px;
    align-items: baseline;
}
.about dt {
    color: var(--muted);
    font-family: var(--font-ui);
    font-size: var(--fs-xs);
    letter-spacing: 0.08em;
}
.about dd {
    color: var(--ink-2);
    font-size: var(--fs-sm);
    overflow-wrap: anywhere;
}
.warn {
    color: var(--cinnabar);
}

@media (max-width: 1080px) {
    .structure {
        grid-template-columns: minmax(0, 1fr);
    }
}
</style>
