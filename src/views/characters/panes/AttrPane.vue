<script setup lang="ts">
import { computed } from 'vue';
import MeterBar from '../../../components/MeterBar.vue';
import NumTag from '../../../components/NumTag.vue';
import { expPercent, type AttrGroup, type ExpRow } from '../character';

/**
 * 卡内「属性」页。2026-11-05 从 `CharacterCard.vue` 拆出来：那张卡一个文件装六个分区，
 * 561 行模板 + 982 行样式，改哪一页都要在同一份文件里找。
 *
 * 拆的**界线是分区**：这个文件连同它自己的 `<style scoped>` 只认「五组属性 + 经验条」，
 * 卡头、页签、滚动容器仍留在 `CharacterCard.vue`。样式跟着模板走是关键——
 * 父组件的 `scoped` 样式够不到子组件的内部元素，所以搬模板必须连样式一起搬。
 */
const props = defineProps<{ groups: AttrGroup[]; experience: ExpRow }>();

/* 经验条的两个值：百分比在 `character.ts` 里算（纯函数、有单测），这里只负责文案。
 * 两者都没填就不显示文字——一根空轨道配一个空字符串会把这一行压成一条灰线。 */
const expPercentValue = computed(() => expPercent(props.experience.value, props.experience.need));

const expText = computed(() => {
    const { value, need } = props.experience;
    if (value && need) return `${value} / ${need}`;
    return value || need;
});
</script>

<template>
    <section class="pane" role="tabpanel">
        <!-- 两行两列：上排资源 / 名望，下排战斗 / 加点。顺序来自数据
             （`attrGroups`），这里只给网格——按列排会让下排两组被上一组的
             长短拖着错位，按行排才能「上下两排各自顶对齐」。 -->
        <div class="attr-layout">
            <div
                v-for="group in groups"
                :key="group.title"
                class="attr-group"
                :class="{ wide: group.wide }"
            >
                <div class="group-head"><span class="section-mark"></span>{{ group.title }}</div>
                <!-- 一行一张**小一号**的票：名目在左、读数在右，28 高。
                     属性这一页要塞 20 项、排成 11 个视觉行（资源 4 / 名望 3 /
                     战斗 6 / 加点 5 / 潜能通栏 1），只有 28 装得进 493 的版心
                     ——42 的票会让这一页溢出 100 多（算式见 CONVENTIONS §2.4-43）。
                     不再画引导点线：票里名目吃满中间、签贴右缘，两端本来就对齐，
                     那串点只在这张 192 宽的列里剩十来颗。
                     空值画一个淡「—」：一行里只有一个空档时，「没填」读起来像
                     「值恰好很短」。 -->
                <dl class="slip-rows sm">
                    <div
                        v-for="row in group.rows"
                        :key="row.label"
                        class="slip-row sm"
                        :class="{ blank: !row.value }"
                    >
                        <dt class="slip-name">{{ row.label }}</dt>
                        <dd class="attr-val">
                            <NumTag class="slip-val">
                                <span class="lv">{{ row.value || '—' }}</span>
                            </NumTag>
                        </dd>
                    </div>
                </dl>
            </div>
        </div>

        <!-- 经验单独一行：它是这一屏唯一有分母的数（离下一级还有多远），
             混在资源那五行里只是第六个数字。 -->
        <div class="exp-row">
            <span class="group-head"><span class="section-mark"></span>经验</span>
            <MeterBar :percent="expPercentValue" label="经验进度" :text="expText" />
        </div>
    </section>
</template>

<style scoped src="./attr-pane.css"></style>
