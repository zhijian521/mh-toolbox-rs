<script setup lang="ts">
import { computed, useId } from 'vue';
import NumberField from '../../../components/NumberField.vue';
import NumTag from '../../../components/NumTag.vue';
import AssistIcon from '../AssistIcon.vue';
import { isMaxed, type AssistKind, type AssistSkill } from '../character';
import type { QuickTarget } from '../quick/quick-target';

/** 卡内「辅助」页。拆法与理由见 `AttrPane.vue` 顶部。 */
const props = withDefaults(
    defineProps<{
        assists: AssistSkill[];
        quick?: boolean;
        editable?: boolean;
        tabbed?: boolean;
    }>(),
    { quick: false, editable: false, tabbed: true },
);

const emit = defineEmits<{
    quick: [target: QuickTarget];
    'edit-level': [name: string, kind: AssistKind, level: number];
}>();
const uid = useId();
const quickable = computed(() => props.quick && !props.editable);

/* 定位键带上 `kind`：生活与剧情各是一套名字，`normalizeAssists` 的查重键就是
 * `kind + name`，这里跟着它走，同一件事只认一个键。 */
function open(row: AssistSkill) {
    if (!quickable.value) return;
    emit('quick', { kind: 'assist', name: row.name, assist: row.kind });
}

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
    <section class="pane" :role="tabbed ? 'tabpanel' : 'region'">
        <!-- 生活与剧情分组显示；预览可改等级，普通卡片仍用只读签。 -->
        <div class="assist-groups">
            <section v-for="group in assistGroups" :key="group.title" class="assist-group">
                <!-- 分组名同时区分游戏中的两个截图页签。 -->
                <div class="group-head"><span class="section-mark"></span>{{ group.title }}</div>
                <div class="slip-rows slip-cols">
                    <!-- 一项一张票：图标 ｜ 名字 ｜ 数值签，一行读完。
                         票面在 `base.css` 的 `.slip-row`（四页共用一份），这一页
                         只给两列网格；图标的块与蒙版在 `AssistIcon.vue`。 -->
                    <div
                        v-for="(row, index) in group.rows"
                        :key="`${row.kind}-${row.name}`"
                        class="slip-row"
                        :class="{ off: row.off, full: isMaxed(row), quickable }"
                        :title="`${row.name} ${row.level}${row.cap ? `/${row.cap}` : ''}`"
                        :role="quickable ? 'button' : undefined"
                        :tabindex="quickable ? 0 : undefined"
                        :aria-label="quickable ? `快速修改 ${row.name}` : undefined"
                        @click="open(row)"
                        @keydown.enter.prevent="open(row)"
                        @keydown.space.prevent="open(row)"
                    >
                        <AssistIcon :name="row.name" :kind="row.kind" />
                        <label
                            v-if="editable"
                            class="slip-name"
                            :for="`${uid}-${row.kind}-${index}`"
                        >
                            {{ row.name }}
                        </label>
                        <span v-else class="slip-name">{{ row.name }}</span>
                        <!-- 等级包进一枚数值签（`NumTag`）：名目在左、读数在右，
                             与师门、修炼、属性三页同一个读法。 -->
                        <NumTag v-if="!editable" class="slip-val">
                            <span class="lv">{{ row.level }}</span>
                        </NumTag>
                        <NumberField
                            v-else
                            :id="`${uid}-${row.kind}-${index}`"
                            :model-value="row.level"
                            :label="`${row.name} 等级`"
                            class="lv-field num-slot"
                            @update:model-value="emit('edit-level', row.name, row.kind, $event)"
                        />
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
