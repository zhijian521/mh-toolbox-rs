<script setup lang="ts">
/** 头像与技能共用候选区；触发方式、选中值和清除动作由各自入口决定。 */
import { computed, onMounted, ref } from 'vue';
import PressButton from '../../../components/PressButton.vue';
import {
    findPetPortrait,
    loadPetAssets,
    petAssets,
    petAssetsError,
    petAssetsLoading,
} from '../../../services/pet-assets';
import PetImage from '../PetImage.vue';

const props = defineProps<{
    kind: 'portrait' | 'skill';
    selected: string;
    clearLabel: string;
}>();
const emit = defineEmits<{ choose: [value: string]; clear: [] }>();
const query = ref('');
const limit = ref(48);
const portrait = computed(() => props.kind === 'portrait');
const subject = computed(() => (portrait.value ? '头像' : '技能'));
const prefix = computed(() => (portrait.value ? 'portrait' : 'skill'));
const selectedValue = computed(() =>
    portrait.value
        ? (findPetPortrait(petAssets.value?.portraits ?? [], props.selected)?.id ?? props.selected)
        : props.selected,
);
const filtered = computed(() => {
    const all = portrait.value ? petAssets.value?.portraits : petAssets.value?.skills;
    return (all ?? []).filter((one) => one.name.includes(query.value.trim()));
});
function valueOf(one: { id: string; name: string }) {
    return portrait.value ? one.id : one.name;
}
function load() {
    void loadPetAssets().catch(() => {});
}
onMounted(load);
</script>

<template>
    <div class="pet-picker-tools" :class="`${prefix}-tools`">
        <input
            v-model="query"
            class="field"
            type="search"
            :placeholder="portrait ? '搜索召唤兽' : '搜索技能'"
            :aria-label="'搜索召唤兽' + subject"
            :disabled="!petAssets"
            @input="limit = 48"
        />
        <PressButton
            v-if="selected"
            danger
            text="清除"
            :label="clearLabel"
            size="sm"
            @click="emit('clear')"
        />
    </div>
    <p v-if="petAssetsLoading" class="pet-picker-state" role="status">正在加载召唤兽资源…</p>
    <p v-else-if="petAssetsError" class="pet-picker-state error" role="alert">
        {{ petAssetsError }}
        <PressButton
            text="重试"
            :label="portrait ? '重试加载召唤兽资源' : '重试加载召唤兽技能'"
            size="sm"
            @click="load"
        />
    </p>
    <div v-if="petAssets && filtered.length" class="pet-picker-grid" :class="`${prefix}-grid`">
        <button
            v-for="one in filtered.slice(0, limit)"
            :key="one.id"
            class="pet-picker-choice"
            type="button"
            :aria-pressed="selectedValue === valueOf(one)"
            :aria-label="'选择' + subject + '：' + one.name"
            @click="emit('choose', valueOf(one))"
        >
            <PetImage :name="valueOf(one)" :kind="kind" /><span>{{ one.name }}</span>
        </button>
    </div>
    <p v-if="petAssets && !filtered.length" class="pet-picker-state" role="status">
        未找到{{ subject }}
    </p>
    <PressButton
        v-if="filtered.length > limit"
        class="pet-picker-more"
        :class="`${prefix}-more`"
        text="显示更多"
        :label="'显示更多召唤兽' + subject"
        size="sm"
        @click="limit += 48"
    />
</template>
