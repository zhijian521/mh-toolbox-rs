<script setup lang="ts">
import { computed } from 'vue';
import LedgerSection from '../../components/LedgerSection.vue';
import NumberField from '../../components/NumberField.vue';
import SelectField from '../../components/SelectField.vue';
import SlotButton from '../../components/SlotButton.vue';
import { ledgerMoneyText } from '../../services/format';
import { MENPAI_FLY_MIN_LEVEL, type LevelCosts } from '../../services/level-costs';
import { growthExtraCost, type GrowthExtra } from './growth-extras';

/** 可选项目沿用养成卡片，输入变更交回父页，删除即从预算移除。 */
const props = defineProps<{ item: GrowthExtra; costs: LevelCosts }>();
const emit = defineEmits<{ change: [value: GrowthExtra]; remove: [] }>();
const result = computed(() => growthExtraCost(props.costs, props.item));
const fields = computed<{ key: 'a' | 'b' | 'c'; label: string; precision?: number }[]>(() => {
    switch (props.item.kind) {
        case 'gem':
            return [
                { key: 'a', label: '目标等级' },
                { key: 'b', label: '1 级单价（万）', precision: 2 },
            ];
        case 'menpai':
            return [
                { key: 'a', label: '人物等级' },
                { key: 'b', label: '人物总经验' },
                ...(props.item.pick === 'fly' ? [{ key: 'c' as const, label: '已吃潜能果' }] : []),
            ];
        case 'guildShop':
            return [
                { key: 'a', label: '商业指数' },
                { key: 'b', label: '店铺间数' },
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
});
const options = computed(() =>
    props.item.kind === 'gem'
        ? props.costs.gem.types.map((one) => ({ value: one.id, label: one.name }))
        : [
              { value: 'nofly', label: '未飞升' },
              { value: 'fly', label: '已飞升' },
          ],
);
function update(key: 'a' | 'b' | 'c' | 'pick', value: number | string) {
    const next = { ...props.item, [key]: value };
    if (key === 'pick' && props.item.kind === 'menpai' && value === 'fly') {
        next.a = Math.max(next.a, MENPAI_FLY_MIN_LEVEL);
    }
    if (key === 'pick' && props.item.kind === 'gem') {
        const type = props.costs.gem.types.find((one) => one.id === value);
        if (type) next.a = Math.min(next.a, type.cap);
    }
    emit('change', next);
}
const count = (value: number) => value.toLocaleString('zh-CN');
</script>

<template>
    <LedgerSection plain class="growth-card" :title="item.name">
        <template #actions
            ><SlotButton
                icon="trash"
                :label="`删除${item.name}计算卡片`"
                danger
                @click="emit('remove')"
        /></template>
        <label
            v-if="item.kind === 'gem' || item.kind === 'menpai'"
            class="slip-row sm growth-input-row growth-pick-row extra-select"
        >
            <span class="field-label">{{ item.kind === 'gem' ? '宝石' : '阶段' }}</span>
            <SelectField
                :model-value="item.pick"
                :options="options"
                :label="`${item.name}类型`"
                @update:model-value="update('pick', $event)"
            />
        </label>
        <div class="growth-field-grid">
            <label v-for="field in fields" :key="field.key" class="slip-row sm growth-input-row">
                <span class="field-label">{{ field.label }}</span>
                <NumberField
                    :model-value="item[field.key]"
                    :label="`${item.name}${field.label}`"
                    :precision="field.precision ?? 0"
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
                <template v-if="item.kind === 'gem'"
                    ><dt>需要梦幻币</dt>
                    <dd class="num">{{ ledgerMoneyText(result.cash) }}</dd></template
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
