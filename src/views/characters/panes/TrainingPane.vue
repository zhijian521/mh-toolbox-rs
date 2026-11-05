<script setup lang="ts">
import NumTag from '../../../components/NumTag.vue';
import { isMaxed, type TrainingGroup } from '../character';

/** 卡内「修炼」页。拆法与理由见 `AttrPane.vue` 顶部。 */
defineProps<{ groups: TrainingGroup[] }>();
</script>

<template>
    <section class="pane" role="tabpanel">
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
                        :class="{ full: isMaxed(row), idle: row.level === 0 }"
                    >
                        <span class="slip-name">{{ row.name }}</span>
                        <!-- 读数进数值签（四页同一枚）：上限写成 `/20` 的淡字，
                             只有等级是读数。满级时签里的等级转朱。 -->
                        <NumTag class="slip-val">
                            <span class="lv"
                                >{{ row.level }}<i>/{{ row.cap }}</i></span
                            >
                        </NumTag>
                    </div>
                </div>
            </div>
        </div>
    </section>
</template>

<style scoped src="./training-pane.css"></style>
