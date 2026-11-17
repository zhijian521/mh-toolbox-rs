<script setup lang="ts">
/** 召唤兽只读详情沿用角色属性票，不展示兼容存档中的内丹。 */
import { computed, watch } from 'vue';
import NumTag from '../../components/NumTag.vue';
import { useAnchoredTip } from '../../composables/use-anchored-tip';
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
const { el, pos, place } = useAnchoredTip();
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
    { label: '成长', value: props.pet?.growth },
    { label: '寿命', value: props.pet?.life ? String(props.pet.life) : '' },
    { label: '五行', value: props.pet?.element },
]);
watch([() => props.pet, () => props.anchor], ([pet]) => {
    if (pet) void place(props.anchor);
});
</script>

<template>
    <Teleport to="body">
        <div
            :id="tooltipId"
            ref="el"
            class="pet-tip detail-tip dual-rule character-theme"
            :class="{ on: pet !== null, interactive }"
            :style="{ left: `${pos.left}px`, top: `${pos.top}px`, zIndex: layer }"
            role="tooltip"
            :aria-hidden="pet === null"
            @mouseenter="emit('mouseenter')"
            @mouseleave="emit('mouseleave')"
        >
            <div v-if="pet" class="tip-content">
                <div class="tip-name">{{ pet.name }}</div>
                <div class="meta tip-kind">
                    {{ pet.level }} 级<template v-if="pet.joinLevel">
                        · 参战 {{ pet.joinLevel }} 级</template
                    >
                </div>
                <section v-for="group in groups" :key="group.title" class="pet-tip-group">
                    <h4 class="group-head">
                        <span class="section-mark" aria-hidden="true" /><span>{{
                            group.title
                        }}</span>
                    </h4>
                    <div v-if="group.rows.length" class="pet-tip-rows">
                        <span v-for="(row, i) in group.rows" :key="i" class="slip-row sm">
                            <span class="slip-name">{{ row.label }}</span>
                            <NumTag class="slip-val">{{ row.value || '—' }}</NumTag>
                        </span>
                    </div>
                    <p v-else class="empty-note inline">尚未记录</p>
                </section>
                <div class="pet-tip-facts">
                    <span v-for="row in facts" :key="row.label" class="slip-row sm">
                        <span class="slip-name">{{ row.label }}</span>
                        <NumTag class="slip-val">{{ row.value || '—' }}</NumTag>
                    </span>
                </div>
                <section class="pet-tip-group">
                    <h4 class="group-head">
                        <span class="section-mark" aria-hidden="true" /><span>技能</span
                        ><span class="muted">{{ pet.skills.length }} 项</span>
                    </h4>
                    <div v-if="pet.skills.length" class="pet-tip-skills">
                        <span v-for="(name, i) in pet.skills" :key="i" class="pet-tip-skill">
                            <PetImage :name="name" title="" aria-hidden="true" />
                            <span>{{ name }}</span>
                        </span>
                    </div>
                    <p v-else class="empty-note inline">尚未记录技能</p>
                </section>
                <slot />
            </div>
        </div>
    </Teleport>
</template>

<style scoped src="./detail-tip.css"></style>
<style scoped>
.pet-tip {
    width: 320px;
}
.pet-tip-group {
    margin-top: 10px;
}
.pet-tip-group .group-head {
    margin: 0 0 6px;
    font-size: var(--fs-mini);
}
.pet-tip-rows,
.pet-tip-facts {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 5px 8px;
    --tag-w: calc(58px * var(--fs-scale));
}
.pet-tip-facts {
    margin-top: 8px;
}
.pet-tip-skills {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 6px 8px;
}
.pet-tip-skill {
    display: flex;
    align-items: center;
    min-width: 0;
    gap: 5px;
    font-size: var(--fs-mini);
    overflow-wrap: anywhere;
    --pet-icon-size: 24px;
}
</style>
