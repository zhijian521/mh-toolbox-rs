<script setup lang="ts">
import { useId } from 'vue';
import NumberField from '../../../components/NumberField.vue';
import GroupHead from '../../../components/GroupHead.vue';
import NumTag from '../../../components/NumTag.vue';
import type { TrainingGroup, TrainingRow } from '../character';
import type { QuickTarget } from '../quick/quick-target';
import { quickRowBinds, useQuickable } from '../quick-row';

/** 卡内「修炼」页。拆法与理由见 `AttrPane.vue` 顶部。 */
const props = withDefaults(
    defineProps<{
        groups: TrainingGroup[];
        quick?: boolean;
        editable?: boolean;
        tabbed?: boolean;
    }>(),
    { quick: false, editable: false, tabbed: true },
);

const emit = defineEmits<{
    quick: [target: QuickTarget];
    'edit-level': [name: string, level: number];
}>();
const uid = useId();
const quickable = useQuickable(props);

/* 十项的名字在本表里唯一（两组没有重名），所以名字就够定位。 */
function open(row: TrainingRow) {
    if (!quickable.value) return;
    emit('quick', { kind: 'training', name: row.name });
}
</script>

<template>
    <section class="pane" :role="tabbed ? 'tabpanel' : 'region'">
        <div class="training-groups">
            <div v-for="group in groups" :key="group.title" class="training-col">
                <GroupHead>{{ group.title }}</GroupHead>
                <!-- 一组一列、一项一张票：与编辑弹窗那一页同构（票面在全局
                     `.slip-row`）。没有图标——修炼十项本来就没有图可给，行首那
                     一格让给名目，名目从左内边距起排。 -->
                <div class="training-list slip-rows">
                    <div
                        v-for="row in group.rows"
                        :key="row.name"
                        class="slip-row"
                        :class="{ idle: row.level === 0, quickable }"
                        v-bind="quickRowBinds(quickable, () => open(row), `快速修改 ${row.name}`)"
                    >
                        <label v-if="editable" class="slip-name" :for="`${uid}-${row.name}`">
                            {{ row.name }}
                        </label>
                        <span v-else class="slip-name">{{ row.name }}</span>
                        <!-- 修炼只记等级，卡上与修改入口都不再显示上限。 -->
                        <NumTag v-if="!editable" class="slip-val">
                            <span class="lv">{{ row.level }}</span>
                        </NumTag>
                        <NumberField
                            v-else
                            :id="`${uid}-${row.name}`"
                            update-on-input
                            :model-value="row.level"
                            :label="`${row.name} 等级`"
                            class="lv-field num-slot slip-input"
                            @update:model-value="emit('edit-level', row.name, $event)"
                        />
                    </div>
                </div>
            </div>
        </div>
    </section>
</template>

<style scoped src="./training-pane.css"></style>
