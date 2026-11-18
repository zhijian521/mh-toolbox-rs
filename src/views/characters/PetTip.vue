<script setup lang="ts">
/** 召唤兽只读详情沿用角色属性票，不展示兼容存档中的内丹。 */
import { computed } from 'vue';
import GroupHead from '../../components/GroupHead.vue';
import NumTag from '../../components/NumTag.vue';
import DetailTipShell from '../../components/DetailTipShell.vue';
import { PET_QUALITY_FIELDS, type ReadonlyPet } from './pets';
import PetImage from './PetImage.vue';

const props = defineProps<{
    anchor: DOMRect | null;
    pet: ReadonlyPet | null;
    tooltipId?: string;
    layer?: number;
    interactive?: boolean;
}>();
const emit = defineEmits<{ mouseenter: []; mouseleave: [] }>();
const groups = computed(() => [
    { title: '属性', rows: props.pet?.attrs ?? [] },
    { title: '加点', rows: props.pet?.points ?? [] },
    {
        title: '资质',
        rows: PET_QUALITY_FIELDS.map((field) => ({
            label: field.label,
            value: props.pet?.quality[field.key] ? String(props.pet.quality[field.key]) : '',
        })),
    },
]);
const facts = computed(() => [
    { label: '寿命', value: props.pet?.life ? String(props.pet.life) : '' },
    { label: '成长', value: props.pet?.growth },
]);
</script>

<template>
    <DetailTipShell
        class="pet-tip character-theme"
        :open="pet !== null"
        :anchor="anchor"
        :tooltip-id="tooltipId"
        :layer="layer"
        :interactive="interactive"
        @mouseenter="() => emit('mouseenter')"
        @mouseleave="() => emit('mouseleave')"
    >
        <template v-if="pet">
            <div class="tip-name">{{ pet.name }}</div>
            <div class="meta tip-kind">
                {{ pet.level }} 级<template v-if="pet.joinLevel">
                    · 参战 {{ pet.joinLevel }} 级</template
                >
                <template v-if="pet.element"> · {{ pet.element }}</template>
            </div>
            <div class="pet-tip-columns">
                <section
                    v-for="group in groups"
                    :key="group.title"
                    class="pet-tip-group"
                    :aria-label="group.title"
                >
                    <div v-if="group.title === '资质'" class="pet-tip-facts">
                        <span v-for="row in facts" :key="row.label" class="slip-row sm">
                            <span class="slip-name">{{ row.label }}</span>
                            <NumTag class="slip-val">{{ row.value || '—' }}</NumTag>
                        </span>
                    </div>
                    <GroupHead as="h4"
                        ><span>{{ group.title }}</span></GroupHead
                    >
                    <div v-if="group.rows.length" class="pet-tip-rows">
                        <span v-for="(row, i) in group.rows" :key="i" class="slip-row sm">
                            <span class="slip-name">{{ row.label }}</span>
                            <NumTag class="slip-val">{{ row.value || '—' }}</NumTag>
                        </span>
                    </div>
                    <p v-else class="empty-note inline">尚未记录</p>
                </section>
            </div>
            <section class="pet-tip-group">
                <GroupHead as="h4">
                    <span>技能</span><span class="muted">{{ pet.skills.length }} 项</span>
                </GroupHead>
                <div v-if="pet.skills.length" class="pet-tip-skills">
                    <span v-for="(name, i) in pet.skills" :key="i" class="pet-tip-skill">
                        <PetImage :name="name" title="" aria-hidden="true" />
                        <span>{{ name }}</span>
                    </span>
                </div>
                <p v-else class="empty-note inline">尚未记录技能</p>
            </section>
            <slot />
        </template>
    </DetailTipShell>
</template>
