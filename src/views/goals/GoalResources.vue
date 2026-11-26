<script setup lang="ts">
import { computed } from 'vue';
import GoalReadouts from './GoalReadouts.vue';
import type { GoalResources } from './goal-resources';

const props = defineProps<{ resources?: GoalResources | null; status?: string }>();
// 等级和帮贡门槛不是消耗；不同经验也不能折成一个总数。
const fields = [
    { key: 'exp', label: '人物经验' },
    { key: 'cash', label: '梦幻币' },
    { key: 'cultivationExp', label: '人物修炼经验' },
    { key: 'petCultivationExp', label: '召唤兽修炼经验' },
    { key: 'usedBond', label: '消耗帮贡' },
    { key: 'material', label: '资材' },
] as const;
const items = computed(() => {
    const resources = props.resources;
    if (!resources) return [];
    return fields.flatMap(({ key, label }) => {
        const value = resources.total[key];
        if (!value) return [];
        const inWan = ['cash', 'exp', 'cultivationExp', 'petCultivationExp'].includes(key);
        return [
            {
                key,
                label,
                exact: value.toLocaleString('zh-CN'),
                text: (inWan ? value / 10_000 : value).toLocaleString('zh-CN', {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                }),
                unit: inWan ? '万' : '点',
            },
        ];
    });
});
</script>

<template>
    <section
        v-if="!resources || items.length"
        class="goal-resources"
        aria-label="可估算的目标资源消耗"
        :aria-busy="!resources && !status"
    >
        <p v-if="!resources" class="resource-note" role="status">{{ status || '正在计算…' }}</p>
        <GoalReadouts v-else :items="items" />
    </section>
</template>

<style scoped>
.goal-resources {
    min-width: 0;
}
.resource-note {
    margin: 0;
    color: var(--muted);
    font-size: var(--fs-xs);
}
</style>
