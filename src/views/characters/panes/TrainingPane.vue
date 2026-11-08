<script setup lang="ts">
import { computed, useId } from 'vue';
import NumberField from '../../../components/NumberField.vue';
import NumTag from '../../../components/NumTag.vue';
import { isMaxed, type TrainingGroup, type TrainingRow } from '../character';
import type { QuickTarget } from '../quick/quick-target';

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
const quickable = computed(() => props.quick && !props.editable);

/* 十项的名字在本表里唯一（两组没有重名），所以名字就够定位；
 * 上限跟行走，由弹窗自己读那一行，不需要另外传。 */
function open(row: TrainingRow) {
    if (!quickable.value) return;
    emit('quick', { kind: 'training', name: row.name });
}
</script>

<template>
    <section class="pane" :role="tabbed ? 'tabpanel' : 'region'">
        <div class="training-groups">
            <div v-for="group in groups" :key="group.title" class="training-col">
                <div class="group-head"><span class="section-mark"></span>{{ group.title }}</div>
                <!-- 一组一列、一项一张票：与编辑弹窗那一页同构（票面在全局
                     `.slip-row`）。没有图标——修炼十项本来就没有图可给，行首那
                     一格让给名目，名目从左内边距起排。 -->
                <div class="training-list slip-rows">
                    <div
                        v-for="row in group.rows"
                        :key="row.name"
                        class="slip-row"
                        :class="{ full: isMaxed(row), idle: row.level === 0, quickable }"
                        :role="quickable ? 'button' : undefined"
                        :tabindex="quickable ? 0 : undefined"
                        :aria-label="quickable ? `快速修改 ${row.name}` : undefined"
                        @click="open(row)"
                        @keydown.enter.self.prevent="open(row)"
                        @keydown.space.self.prevent="open(row)"
                    >
                        <label v-if="editable" class="slip-name" :for="`${uid}-${row.name}`">
                            {{ row.name }}
                        </label>
                        <span v-else class="slip-name">{{ row.name }}</span>
                        <!-- 读数进数值签（四页同一枚）：上限写成 `/20` 的淡字，
                             只有等级是读数。满级时签里的等级转朱。 -->
                        <NumTag v-if="!editable" class="slip-val">
                            <span class="lv"
                                >{{ row.level }}<i>/{{ row.cap }}</i></span
                            >
                        </NumTag>
                        <NumberField
                            v-else
                            :id="`${uid}-${row.name}`"
                            :model-value="row.level"
                            :label="`${row.name} 等级`"
                            class="lv-field num-slot"
                            @update:model-value="emit('edit-level', row.name, $event)"
                        />
                    </div>
                </div>
            </div>
        </div>
    </section>
</template>

<style scoped src="./training-pane.css"></style>
