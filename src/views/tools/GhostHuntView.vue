<script setup lang="ts">
import SelectField from '../../components/SelectField.vue';
import PaperCard from '../../components/PaperCard.vue';
import { computed, inject, onMounted } from 'vue';
import GroupHead from '../../components/GroupHead.vue';
import AppIcon from '../../components/AppIcon.vue';
import CostSwitch from '../../components/CostSwitch.vue';
import ToolPageShell from './ToolPageShell.vue';
import WatchStatusTag from './WatchStatusTag.vue';
import PressButton from '../../components/PressButton.vue';
import MapCanvas from '../../components/ghost/MapCanvas.vue';
import { useGhostWatch } from '../../composables/use-ghost-watch';
import type { GhostPlan } from '../../services/ghost-model';
import { glassLedger } from '../../components/glass-ledger';
import GlassSmallSwitch from '../../components/liquid-glass/GlassSmallSwitch.vue';
import GlassSelect from '../../components/liquid-glass/GlassSelect.vue';
import AppNotice from '../../components/AppNotice.vue';

const {
    running,
    starting,
    windows,
    selectedHwnd,
    report,
    plans,
    stats,
    engineLabel,
    ages,
    hot,
    desktop,
    statusText,
    statusKind,
    degraded,
    scalePercent,
    toggle,
    start,
} = useGhostWatch();

const glass = inject(glassLedger, null);
const card = glass?.card ?? PaperCard;
const cardProps = glass ? { radius: 16 } : { plain: true };
const windowOptions = computed(() => [
    { value: '', label: windows.value.length > 1 ? '请选择游戏窗口' : '自动选择' },
    ...windows.value.map(({ hwnd, title }) => ({ value: String(hwnd), label: title })),
]);
const windowValue = computed({
    get: () => (selectedHwnd.value === null ? '' : String(selectedHwnd.value)),
    set: (value: string) => {
        selectedHwnd.value = value ? Number(value) : null;
    },
});
const hasRange = computed(() => plans.value.some((plan) => plan.mode === 'range'));
const hasLikelyRange = computed(() =>
    plans.value.some((plan) => plan.mode === 'range' && plan.range.likely),
);

/** 纠错对（`甲→乙`）按空格连成一句话，挂在「识别原文」的标题上。 */
const corrections = computed(() => {
    const list = report.value?.corrections ?? [];
    return list.map((item) => `${item.from}→${item.to}`).join(' ');
});

function kindLabel(plan: GhostPlan): string {
    return plan.task.kind === 'small' ? '小鬼' : '大鬼';
}

function mapLabel(plan: GhostPlan): string {
    return plan.mode === 'invalid' ? plan.task.mapText : plan.map.name;
}

onMounted(() => {
    if (desktop) void start();
});
</script>

<template>
    <ToolPageShell title="捉鬼助手" desc="任务识别 · 地图指引">
        <template #actions>
            <PressButton
                :icon="running ? 'stop' : 'play'"
                :text="running ? '停止识别' : '开始识别'"
                :label="running ? '停止识别（回到未开始）' : '开始识别任务栏'"
                :seal="!!glass && !running"
                :disabled="!desktop || starting"
                @click="toggle"
            />
        </template>

        <div class="hunt-frame" :class="{ 'hunt-glass': glass }">
            <div class="hunt">
                <component :is="card" v-bind="cardProps" class="map-card">
                    <header class="map-toolbar">
                        <GroupHead as="h3">任务地图</GroupHead>
                        <div v-if="hasRange" class="legend" aria-label="地图图例">
                            <span><i class="legend-wash" aria-hidden="true" />官方 ±50</span>
                            <span v-if="hasLikelyRange"
                                ><i class="legend-hot" aria-hidden="true" />高概率区域</span
                            >
                        </div>
                    </header>
                    <div v-for="plan in plans" :key="plan.task.kind" class="map-item">
                        <div class="map-head">
                            <span class="chip">{{ kindLabel(plan) }}</span>
                            <span>{{ mapLabel(plan) }}</span>
                            <span v-if="running && ages[plan.task.kind] >= 3" class="meta head-age">
                                {{ ages[plan.task.kind] }}s 前
                            </span>
                        </div>
                        <MapCanvas :plan="plan" />
                    </div>
                    <div v-if="!plans.length" class="map-item"><MapCanvas :plan="null" /></div>
                </component>
                <aside class="hunt-side">
                    <component :is="card" v-bind="cardProps" class="hunt-controls">
                        <GroupHead as="h3">识别设置</GroupHead>
                        <div class="window-field">
                            <span class="field-label">监听窗口</span>
                            <GlassSelect
                                v-if="glass"
                                v-model="windowValue"
                                class="lg-form-fields"
                                :options="windowOptions"
                                label="监听窗口"
                                hide-label
                                :disabled="running || starting"
                            />
                            <SelectField
                                v-else
                                v-model="windowValue"
                                :options="windowOptions"
                                label="监听窗口"
                                :disabled="running || starting"
                            />
                            <WatchStatusTag :tone="statusKind">{{ statusText }}</WatchStatusTag>
                        </div>
                        <AppNotice v-if="degraded" tone="warning" role="status">
                            已切换到系统 OCR，彩色文字可能识别不全。
                        </AppNotice>
                        <div class="hot-row">
                            <span class="field-label">高概率区域</span>
                            <GlassSmallSwitch
                                v-if="glass"
                                v-model:checked="hot"
                                aria-label="高概率区域"
                                class="hot-switch"
                            />
                            <CostSwitch
                                v-else
                                v-model="hot"
                                label="高概率区域"
                                off-label="关"
                                on-label="开"
                                class="hot-switch"
                            />
                        </div>
                        <p class="field-note">识别时请保持游戏任务栏可见。</p>
                        <details v-if="report" class="detail-block">
                            <summary class="detail-head">
                                <AppIcon name="chevron-right" class="detail-arrow" />
                                识别原文
                                <span v-if="engineLabel" class="meta detail-tag">{{
                                    engineLabel
                                }}</span>
                                <span v-if="corrections" class="meta detail-tag"
                                    >纠错 {{ corrections }}</span
                                >
                            </summary>
                            <p v-if="stats" class="meta status-meta">
                                截屏 {{ stats.grabMs }}ms · 识别 {{ stats.ocrMs }}ms · 系统
                                {{ scalePercent }}%
                            </p>
                            <ol class="detail-lines">
                                <li v-for="(line, index) in report.lines" :key="index">
                                    {{ line }}
                                </li>
                            </ol>
                            <p
                                v-for="issue in report.issues"
                                :key="issue"
                                class="meta detail-issue"
                            >
                                {{ issue }}
                            </p>
                        </details>
                    </component>
                </aside>
            </div>
        </div>
    </ToolPageShell>
</template>

<style scoped>
.hunt-frame {
    width: 100%;
    max-width: 1080px;
    margin-inline: auto;
    container-type: inline-size;
}
.hunt-frame.hunt-glass {
    max-width: none;
}
.hunt {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(252px, 30%);
    align-items: start;
    gap: 12px;
}
.map-card,
.hunt-controls {
    display: grid;
    min-width: 0;
    gap: 14px;
    padding: 16px;
}
.hunt-glass :is(.map-card, .hunt-controls) {
    --glass-foreground: var(--liquid-ink);
    --glass-text-shadow: none;
}
.hunt .group-head {
    margin: 0;
}
.hunt-side,
.map-item {
    min-width: 0;
}
.map-toolbar,
.map-head,
.hot-row,
.detail-head {
    display: flex;
    gap: 8px;
    align-items: center;
}
.map-toolbar {
    justify-content: space-between;
    flex-wrap: wrap;
}
.map-head {
    margin-bottom: 6px;
    font-size: var(--fs-sm);
}
.head-age,
.detail-tag {
    margin-inline-start: auto;
}
.map-item + .map-item,
.hot-row,
.detail-block {
    border-top: 1px solid var(--rule);
    padding-top: 12px;
}
.map-item > .map-stage {
    height: clamp(240px, 52dvh, 480px);
    border-radius: 10px;
}
.map-card:has(.map-item + .map-item) .map-stage {
    height: clamp(240px, 32dvh, 340px);
}
.legend,
.legend span {
    display: inline-flex;
    align-items: center;
    gap: 5px;
}
.legend {
    flex-wrap: wrap;
    gap: 4px 12px;
    color: var(--muted);
    font-size: var(--fs-mini);
}
.legend i {
    width: 12px;
    height: 8px;
    border-radius: 2px;
}
.legend-wash {
    background: var(--ghost-wash);
    border: 1px solid var(--ghost-wash-edge);
}
.legend-hot {
    background: var(--ghost-hot);
    border: 1px solid var(--ghost-hot-edge);
}
.window-field {
    display: grid;
    gap: 6px;
    min-width: 0;
}
.detail-issue {
    color: var(--warning);
}
.hot-row {
    justify-content: space-between;
}
.field-note,
.detail-head,
.detail-lines {
    color: var(--muted);
    font-size: var(--fs-sm);
    line-height: 1.5;
}
.field-note {
    margin: 0;
}
.detail-head {
    flex-wrap: wrap;
    cursor: pointer;
    list-style: none;
}
.detail-head::-webkit-details-marker {
    display: none;
}
.detail-block[open] .detail-arrow {
    transform: rotate(90deg);
}
.detail-lines {
    max-height: 12rem;
    overflow: auto;
    overflow-wrap: anywhere;
    padding-inline-start: 24px;
}
.detail-tag {
    overflow-wrap: anywhere;
}
@container (max-width: 660px) {
    .hunt {
        grid-template-columns: minmax(0, 1fr);
    }
    .map-item > .map-stage {
        height: clamp(240px, 38dvh, 360px);
    }
}
</style>
