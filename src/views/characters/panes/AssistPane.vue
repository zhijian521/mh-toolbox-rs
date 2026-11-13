<script setup lang="ts">
import { computed, useId } from 'vue';
import NumberField from '../../../components/NumberField.vue';
import GroupHead from '../../../components/GroupHead.vue';
import NumTag from '../../../components/NumTag.vue';
import SelectField from '../../../components/SelectField.vue';
import PressButton from '../../../components/PressButton.vue';
import { lifeSkills, storySkills } from '../../../services/game-data';
import AssistIcon from '../AssistIcon.vue';
import { isMaxed, type AssistKind, type AssistSkill } from '../character';
import type { QuickTarget } from '../quick/quick-target';
import { quickRowBinds, useQuickable } from '../quick-row';

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
    'edit-row': [index: number, patch: Partial<AssistSkill>];
    'add-row': [kind: AssistKind];
    'remove-row': [index: number];
}>();
const uid = useId();
const quickable = useQuickable(props);

/* 定位键带上 `kind`：生活与剧情各是一套名字，`normalizeAssists` 的查重键就是
 * `kind + name`，这里跟着它走，同一件事只认一个键。 */
function open(row: AssistSkill) {
    if (!quickable.value) return;
    emit('quick', { kind: 'assist', name: row.name, assist: row.kind });
}

/* 生活与剧情分组；只读时隐藏空组，编辑时保留新增入口。 */
const assistGroups = computed(() =>
    [
        {
            title: '生活技能',
            kind: 'life' as const,
            rows: props.assists.filter((row) => row.kind === 'life'),
        },
        {
            title: '剧情技能',
            kind: 'story' as const,
            rows: props.assists.filter((row) => row.kind === 'story'),
        },
    ].filter((group) => props.editable || group.rows.length > 0),
);
function optionsFor(row: AssistSkill) {
    const names = row.kind === 'life' ? lifeSkills() : storySkills();
    const options = names.filter(
        (name) =>
            !props.assists.some(
                (other) => other !== row && other.kind === row.kind && other.name === name,
            ),
    );
    if (row.name && !options.includes(row.name)) options.unshift(row.name);
    return options.map((name) => ({ value: name, label: name }));
}
</script>

<template>
    <section class="pane" :class="{ editing: editable }" :role="tabbed ? 'tabpanel' : 'region'">
        <!-- 编辑时可选名称、改等级及增删行；名册卡片保留只读签。 -->
        <div class="assist-groups">
            <section v-for="group in assistGroups" :key="group.title" class="assist-group">
                <!-- 分组名同时区分游戏中的两个截图页签。 -->
                <GroupHead>{{ group.title }}</GroupHead>
                <div class="slip-rows slip-cols">
                    <!-- 只读与编辑均一行两个，编辑控件在票内紧凑排列。 -->
                    <div
                        v-for="(row, index) in group.rows"
                        :key="`${row.kind}-${index}`"
                        class="slip-row"
                        :class="{ off: row.off, full: isMaxed(row), quickable }"
                        :title="`${row.name} ${row.level}${row.cap ? `/${row.cap}` : ''}`"
                        v-bind="quickRowBinds(quickable, () => open(row), `快速修改 ${row.name}`)"
                    >
                        <AssistIcon :name="row.name" :kind="row.kind" />
                        <SelectField
                            v-if="editable"
                            class="assist-select"
                            :model-value="row.name"
                            :options="optionsFor(row)"
                            :label="group.title + '名称'"
                            placeholder="选择技能"
                            @update:model-value="
                                emit('edit-row', assists.indexOf(row), { name: $event })
                            "
                        />
                        <span v-else class="slip-name">{{ row.name }}</span>
                        <!-- 等级包进一枚数值签（`NumTag`）：名目在左、读数在右，
                             与师门、修炼、属性三页同一个读法。 -->
                        <NumTag v-if="!editable" class="slip-val">
                            <span class="lv">{{ row.level }}</span>
                        </NumTag>
                        <NumberField
                            v-else
                            :id="`${uid}-${row.kind}-${index}`"
                            update-on-input
                            :model-value="row.level"
                            :label="`${row.name || group.title} 等级`"
                            class="lv-field num-slot slip-input compact"
                            @update:model-value="
                                emit('edit-row', assists.indexOf(row), { level: $event })
                            "
                        />
                        <PressButton
                            v-if="editable"
                            danger
                            class="assist-remove"
                            icon="trash"
                            :label="'删除' + (row.name || group.title)"
                            @click="emit('remove-row', assists.indexOf(row))"
                        />
                    </div>
                </div>
                <PressButton
                    v-if="editable"
                    class="assist-add"
                    icon="add"
                    text="新增"
                    :label="'新增' + group.title"
                    @click="emit('add-row', group.kind)"
                />
            </section>
        </div>
        <!-- 两项都没有时给一句话，与师门、召唤兽两页同一句式：
             空白的纸页读作「没画完」，一句话才说明「这里本来就还没记」。 -->
        <p v-if="!assistGroups.length" class="empty-note">还没有记录辅助技能</p>
    </section>
</template>

<style scoped src="./assist-pane.css"></style>
