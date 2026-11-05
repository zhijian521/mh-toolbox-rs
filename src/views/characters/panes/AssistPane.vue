<script setup lang="ts">
import { computed } from 'vue';
import NumTag from '../../../components/NumTag.vue';
import AssistIcon from '../AssistIcon.vue';
import { isMaxed, type AssistSkill } from '../character';

/** 卡内「辅助」页。拆法与理由见 `AttrPane.vue` 顶部。 */
const props = defineProps<{ assists: AssistSkill[] }>();

/* 生活与剧情分两段，各自一张格子图。空的那一类不出现——
 * 一个只有生活技能的角色，不该看到一行「剧情技能」然后底下什么都没有。 */
const assistGroups = computed(() =>
    [
        { title: '生活技能', rows: props.assists.filter((row) => row.kind === 'life') },
        { title: '剧情技能', rows: props.assists.filter((row) => row.kind === 'story') },
    ].filter((group) => group.rows.length > 0),
);
</script>

<template>
    <section class="pane" role="tabpanel">
        <!-- 格子，照游戏「辅助技能」面板：一行五个（卡只有 450 宽，四列时每格
             左右各空 24，读作散落的邮票），图标在上、等级在下。
             生活技能与剧情技能合在同一张图里（游戏里就是同一个入口），
             但等级下面那行小字把名字补上——图标是我们从截图切的，
             用户认得图标，可这张表是拿来核对的，名字比图形可靠。 -->
        <div class="assist-groups">
            <section v-for="group in assistGroups" :key="group.title" class="assist-group">
                <!-- 两类必须各有小标题：生活技能练到 100+，剧情技能最高 5 级，
                     混在一张图里时「5」会被读成「才练了 5 级」。 -->
                <div class="group-head"><span class="section-mark"></span>{{ group.title }}</div>
                <div class="slip-rows slip-cols">
                    <!-- 一项一张票：图标 ｜ 名字 ｜ 数值签，一行读完。
                         票面在 `base.css` 的 `.slip-row`（四页共用一份），这一页
                         只给两列网格；图标的块与蒙版在 `AssistIcon.vue`。 -->
                    <div
                        v-for="row in group.rows"
                        :key="`${row.kind}-${row.name}`"
                        class="slip-row"
                        :class="{ off: row.off, full: isMaxed(row) }"
                        :title="`${row.name} ${row.level}${row.cap ? `/${row.cap}` : ''}`"
                    >
                        <AssistIcon :name="row.name" :kind="row.kind" />
                        <span class="slip-name">{{ row.name }}</span>
                        <!-- 等级包进一枚数值签（`NumTag`）：名目在左、读数在右，
                             与师门、修炼、属性三页同一个读法。 -->
                        <NumTag class="slip-val">
                            <span class="lv">{{ row.level }}</span>
                        </NumTag>
                    </div>
                </div>
            </section>
        </div>
        <!-- 两项都没有时给一句话，与师门、召唤兽两页同一句式：
             空白的纸页读作「没画完」，一句话才说明「这里本来就还没记」。 -->
        <p v-if="!assistGroups.length" class="empty-note">还没有记录辅助技能</p>
    </section>
</template>

<style scoped src="./assist-pane.css"></style>
