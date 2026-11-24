<script setup lang="ts">
import { computed, inject } from 'vue';
import LedgerSection from '../../components/LedgerSection.vue';
import NumberField from '../../components/NumberField.vue';
import GlassSelect from '../../components/liquid-glass/GlassSelect.vue';
import { glassLedger } from '../../components/glass-ledger';
import SelectField from '../../components/SelectField.vue';
import PressButton from '../../components/PressButton.vue';
import { ledgerMoneyText } from '../../services/format';
import { MENPAI_FLY_MIN_LEVEL, type LevelCosts } from '../../services/level-costs';
import { growthExtraCost, MENPAI_OPTIONS, type GrowthExtra } from './growth-extras';

/** 可选项目沿用养成卡片，输入变更交回父页，删除即从预算移除。 */
const props = defineProps<{ item: GrowthExtra; costs: LevelCosts }>();
const emit = defineEmits<{ 'update:item': [value: GrowthExtra]; remove: [] }>();
const glass = inject(glassLedger, null);
const selectControl = glass ? GlassSelect : SelectField;
const result = computed(() => growthExtraCost(props.costs, props.item));
const fields = computed<{ key: 'a' | 'b' | 'c'; label: string }[]>(() => {
    switch (props.item.kind) {
        case 'menpai':
            return [
                { key: 'a', label: '人物等级' },
                { key: 'b', label: '人物总经验' },
                ...(props.item.pick === 'fly' ? [{ key: 'c' as const, label: '已吃潜能果' }] : []),
            ];
        case 'petScene':
            return [{ key: 'a', label: '召唤兽等级' }];
        case 'expGrade':
            return [
                { key: 'a', label: '当前等级' },
                { key: 'b', label: '手上经验' },
            ];
        case 'convention':
            return [{ key: 'a', label: '人物等级' }];
    }
    return [];
});
function update(key: 'a' | 'b' | 'c' | 'pick', value: number | string) {
    const next = { ...props.item, [key]: value };
    if (key === 'pick' && props.item.kind === 'menpai' && value === 'fly') {
        next.a = Math.max(next.a, MENPAI_FLY_MIN_LEVEL);
    }
    emit('update:item', next);
}
const count = (value: number) => value.toLocaleString('zh-CN');
</script>

<template>
    <LedgerSection plain class="growth-card" :title="item.name">
        <template #actions
            ><PressButton
                icon="trash"
                :label="`删除${item.name}计算卡片`"
                danger
                @click="emit('remove')"
        /></template>
        <div
            v-if="item.kind === 'menpai'"
            class="growth-input-row growth-pick-row extra-select"
        >
            <span class="field-label">飞升阶段</span>
            <component
                :is="selectControl"
                :hide-label="glass ? true : undefined"
                :model-value="item.pick"
                :options="MENPAI_OPTIONS"
                :label="`${item.name}类型`"
                @update:model-value="update('pick', $event)"
            />
        </div>
        <div class="growth-field-grid">
            <label v-for="field in fields" :key="field.key" class="growth-input-row">
                <span class="field-label">{{ field.label }}</span>
                <NumberField
                    :model-value="item[field.key]"
                    :label="`${item.name}${field.label}`"
                    update-on-input
                    @update:model-value="update(field.key, $event)"
                />
            </label>
        </div>
        <p v-if="result.error" class="note error" role="alert">{{ result.error }}</p>
        <template v-else>
            <dl class="extra-results growth-readings">
                <template v-for="reading in result.readings" :key="reading.label">
                    <dt>{{ reading.label }}</dt>
                    <dd class="num">
                        {{
                            reading.money && typeof reading.value === 'number'
                                ? ledgerMoneyText(reading.value)
                                : typeof reading.value === 'number'
                                  ? count(reading.value)
                                  : reading.value
                        }}
                    </dd>
                </template>
                <template v-if="result.exp"
                    ><dt>需要人物经验</dt>
                    <dd class="num">{{ count(result.exp) }}</dd></template
                >
                <template v-if="result.fruits"
                    ><dt>扣除潜能果</dt>
                    <dd class="num">{{ result.fruits }} 颗</dd></template
                >
            </dl>
            <p class="note">{{ result.note }}</p>
        </template>
    </LedgerSection>
</template>

<style scoped>
.extra-select {
    margin-bottom: 8px;
}
</style>
