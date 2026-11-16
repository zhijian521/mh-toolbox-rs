<script setup lang="ts">
import { computed } from 'vue';
import type { OcrReport } from './change-summary';

const props = defineProps<{ reports: OcrReport[] }>();
const changes = computed(() => props.reports.flatMap((report) => report.changes));
const added = computed(() => changes.value.filter((row) => !row.before && row.after).length);
const cleared = computed(() => changes.value.filter((row) => row.before && !row.after).length);
const modified = computed(() => changes.value.length - added.value - cleared.value);
</script>

<template>
    <div v-if="reports.length" class="ocr-summary">
        <p class="ocr-summary-live" role="status">
            本次识别 {{ reports.length }} 张 · 新增 {{ added }} · 修改 {{ modified }}
            <span v-if="cleared"> · 清空 {{ cleared }}</span>
        </p>
        <details v-for="(report, index) in reports" :key="index" class="ocr-report">
            <summary>
                {{ report.title }} ·
                {{ report.changes.length ? `${report.changes.length} 项变更` : '数值无变化' }}
                <span v-if="report.review.length" class="ocr-review-count">
                    · {{ report.review.length }} 项待核对
                </span>
            </summary>
            <p v-if="report.note" class="ocr-summary-note">{{ report.note }}</p>
            <dl v-if="report.changes.length" class="ocr-changes">
                <div v-for="change in report.changes" :key="change.label">
                    <dt>{{ change.label }}</dt>
                    <dd>
                        <span>{{ change.before || '空' }}</span>
                        <span aria-label="改为"> → </span>
                        <b>{{ change.after || '空' }}</b>
                    </dd>
                </div>
            </dl>
            <p v-if="report.review.length" class="ocr-summary-note">
                待核对：{{ report.review.join('；') }}
            </p>
        </details>
    </div>
</template>

<style scoped>
.ocr-summary {
    flex: none;
    max-height: min(180px, 28vh);
    margin-top: 10px;
    overflow-y: auto;
    border-top: var(--w-hair) solid var(--rule-2);
    color: var(--ink-2);
    font-size: var(--fs-mini);
    scrollbar-gutter: stable;
}
.ocr-summary-live {
    margin: 6px 0;
}
.ocr-report {
    padding: 4px 0;
}
.ocr-report summary {
    cursor: pointer;
    overflow-wrap: anywhere;
}
.ocr-review-count {
    color: var(--accent);
}
.ocr-summary-note {
    margin: 6px 0;
    color: var(--muted);
    overflow-wrap: anywhere;
}
.ocr-changes {
    margin: 6px 0;
}
.ocr-changes > div {
    display: grid;
    grid-template-columns: minmax(100px, 1fr) minmax(0, 2fr);
    gap: 10px;
    padding: 3px 0;
}
.ocr-changes dt,
.ocr-changes dd {
    margin: 0;
    overflow-wrap: anywhere;
}
.ocr-changes dd {
    font-variant-numeric: tabular-nums;
}
.ocr-changes dd > span:first-child {
    color: var(--muted);
}
.ocr-changes b {
    color: var(--num);
    font-weight: 400;
}
</style>
