<script setup lang="ts">
import { computed } from 'vue';
import { RouterLink, useRouter } from 'vue-router';
import AppIcon from '../../components/AppIcon.vue';
import LedgerSection from '../../components/LedgerSection.vue';
import PressButton from '../../components/PressButton.vue';
import GoalProgress from '../goals/GoalProgress.vue';
import { deadlineText, kindMeta } from '../goals/goals';
import type { activeGoals } from './overview';

const props = defineProps<{
    goals: ReturnType<typeof activeGoals>;
    hasGoals: boolean;
    error: boolean;
    today: string;
}>();
const router = useRouter();
const visibleGoals = computed(() => props.goals.slice(0, 3));
</script>

<template>
    <LedgerSection title="目标" class="goals-section" plain>
        <template #actions
            ><PressButton
                icon="grid"
                text="全部"
                label="查看全部目标"
                size="sm"
                @click="router.push('/goals')"
        /></template>
        <p v-if="error" class="empty-note">目标未读取</p>
        <div v-else-if="!goals.length" class="section-empty empty-note">
            <p>{{ hasGoals ? '目标已全部达成' : '暂无养成计划' }}</p>
            <PressButton
                icon="add"
                text="新增"
                label="新建养成目标"
                size="sm"
                @click="router.push({ path: '/goals', query: { action: 'new' } })"
            />
        </div>
        <div v-else class="goal-list">
            <RouterLink
                v-for="(one, index) in visibleGoals"
                :key="one.goal.id"
                class="goal-row"
                :to="{ path: '/goals', query: { action: 'update', goal: one.goal.id } }"
                :aria-label="'更新目标：' + one.goal.title"
            >
                <span class="focus-number num">{{ String(index + 1).padStart(2, '0') }}</span>
                <div class="focus-copy">
                    <div class="goal-line">
                        <h3>{{ one.goal.title }}</h3>
                        <b class="num">{{ one.summary.pct }}%</b>
                    </div>
                    <p class="goal-meta">
                        <span>{{ kindMeta(one.goal.kind).label }}</span
                        ><span v-if="one.goal.tracking"
                            >{{ one.summary.achieved }} /
                            {{ one.summary.totalMembers }} 个角色达标</span
                        ><span v-else-if="one.goal.kind === 'combo'"
                            >{{ one.summary.achieved }} / {{ one.summary.total }} 项达标</span
                        ><span v-else-if="one.goal.members.length"
                            >{{ one.goal.members.length }} 个角色</span
                        ><span v-if="one.goal.deadline">{{
                            deadlineText(one.goal.deadline, today, one.summary.done)
                        }}</span>
                    </p>
                    <GoalProgress
                        :percent="one.summary.pct"
                        :label="one.goal.title + '进度'"
                        adaptive
                    />
                </div>
                <AppIcon name="chevron-right" class="goal-arrow" />
            </RouterLink>
        </div>
    </LedgerSection>
</template>

<style scoped>
.goal-list {
    display: grid;
}
.goal-row {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 14px 0;
}
.goal-row + .goal-row {
    border-top: var(--w-hair) solid var(--rule);
}
.focus-number {
    align-self: flex-start;
    padding-top: 2px;
    color: var(--muted);
    font-size: var(--fs-xs);
}
.focus-copy {
    flex: 1;
    min-width: 0;
    display: grid;
    gap: 9px;
}
.goal-line {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 8px;
}
.goal-line h3 {
    font-size: var(--fs-sm);
    color: var(--ink);
    overflow-wrap: anywhere;
}
.goal-line b {
    flex: none;
    color: var(--accent);
    font-weight: 400;
    font-size: var(--fs-xs);
}
.goal-meta {
    display: flex;
    flex-wrap: wrap;
    gap: 4px 9px;
    color: var(--muted);
    font-size: var(--fs-mini);
}
.goal-meta > span:first-child {
    color: var(--indigo-ink);
}
.goal-arrow {
    color: var(--muted);
    flex: none;
}
</style>
