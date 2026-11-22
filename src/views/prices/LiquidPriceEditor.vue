<script setup lang="ts">
import { computed, nextTick, onMounted, ref, useId } from 'vue';
import { GlassButton } from '../../components/liquid-glass';
import GlassInput from '../../components/liquid-glass/GlassInput.vue';
import GlassSelect from '../../components/liquid-glass/GlassSelect.vue';
import GlassPriceField from '../../components/liquid-glass/GlassPriceField.vue';
import { todayText } from '../../services/format';
import { DEFAULT_CATEGORY, type priceCategoryGroups } from './prices-catalog';
import {
    currentPoint,
    itemDraftErrors,
    NAME_LIMIT,
    pointDraftErrors,
    SUB_LIMIT,
    type PriceItemDraft,
    type PricePoint,
    type PricePointDraft,
    type ReadonlyPriceItem,
} from './prices';

const props = defineProps<{
    item?: ReadonlyPriceItem;
    point?: PricePoint;
    categories: ReturnType<typeof priceCategoryGroups>;
    active: boolean;
    saving: boolean;
    locked: boolean;
    retrying: boolean;
    error: string;
}>();
const emit = defineEmits<{
    add: [draft: PriceItemDraft, initialPrice: number];
    save: [draft: PricePointDraft];
    cancel: [];
}>();

const fieldId = useId();
const form = ref<HTMLFormElement | null>(null);
const name = ref('');
const category = ref(DEFAULT_CATEGORY);
const subcategory = ref('');
const customSubcategory = '__custom_subcategory__';
const customSub = ref('');
const date = ref(props.point?.date ?? todayText());
const currentPrice = props.item ? currentPoint(props.item)?.price : undefined;
const price = ref<number | null>(props.point?.price ?? currentPrice ?? null);
const note = ref(props.point?.note ?? '');
const submitted = ref(false);
const priceTouched = ref(false);
const title = computed(() => {
    if (!props.item) return '新增物品';
    return props.point ? '编辑价格记录' : '更新价格';
});
const subcategoryOptions = computed(() => [
    { value: '', label: '未分类' },
    ...(props.categories.find((group) => group.value === category.value)?.children ?? []),
    { value: customSubcategory, label: '自定义' },
]);
const itemDraft = computed(() => ({
    name: name.value,
    category: category.value,
    sub: subcategory.value === customSubcategory ? customSub.value : subcategory.value,
    note: note.value,
}));
const priceDraft = computed(() => ({ date: date.value, price: price.value ?? 0, note: note.value }));
const itemErrors = computed(() => itemDraftErrors(itemDraft.value));
const priceErrors = computed(() => pointDraftErrors(priceDraft.value));

function submit() {
    if (props.saving) return;
    submitted.value = true;
    const invalid = props.item
        ? priceErrors.value.price || priceErrors.value.date
        : itemErrors.value.name || itemErrors.value.sub;
    if (!props.retrying && invalid) {
        void nextTick(() => form.value?.querySelector<HTMLInputElement>('input[aria-invalid="true"]')?.focus());
        return;
    }
    if (props.item) emit('save', priceDraft.value);
    else emit('add', itemDraft.value, price.value ?? 0);
}

function submitFromInput(event: KeyboardEvent) {
    if (event.isComposing || !(event.target instanceof HTMLInputElement)) return;
    if (event.target.type !== 'text') return;
    event.preventDefault();
    submit();
}

onMounted(() => {
    if (!props.active) return;
    const firstInput = props.item ? '[inputmode="decimal"]' : 'input';
    form.value?.querySelector<HTMLInputElement>(firstInput)?.focus({ preventScroll: true });
});
</script>

<template>
    <form
        ref="form"
        class="liquid-price-editor"
        @submit.prevent="submit"
        @keydown.enter="submitFromInput"
    >
        <header class="price-editor-header">
            <h2>{{ title }}</h2>
            <p v-if="item">{{ item.name }}</p>
        </header>
        <fieldset :disabled="locked" class="price-editor-fields lg-form-fields">
            <template v-if="!item">
                <label class="editor-wide">
                    <span>名称</span>
                    <GlassInput
                        v-model="name"
                        :maxlength="NAME_LIMIT"
                        type="text"
                        :aria-invalid="(submitted && !!itemErrors.name) || undefined"
                        :aria-describedby="submitted && itemErrors.name ? fieldId + '-name' : undefined"
                    />
                    <small v-if="submitted && itemErrors.name" :id="fieldId + '-name'" role="alert">
                        {{ itemErrors.name }}
                    </small>
                </label>
                <GlassSelect
                    v-model="category"
                    label="一级分类"
                    :options="categories"
                    :disabled="locked"
                    @update:model-value="subcategory = ''"
                />
                <GlassSelect
                    v-model="subcategory"
                    label="二级分类"
                    :options="subcategoryOptions"
                    :disabled="locked"
                />
                <label v-if="subcategory === customSubcategory" class="editor-wide">
                    <span>自定义子类</span>
                    <GlassInput
                        v-model="customSub"
                        :maxlength="SUB_LIMIT"
                        type="text"
                        :aria-invalid="(submitted && !!itemErrors.sub) || undefined"
                        :aria-describedby="submitted && itemErrors.sub ? fieldId + '-customSub' : undefined"
                    />
                    <small v-if="submitted && itemErrors.sub" :id="fieldId + '-customSub'" role="alert">
                        {{ itemErrors.sub }}
                    </small>
                </label>
            </template>
            <GlassPriceField
                v-model="price"
                class="editor-wide"
                :label="item ? '这一笔多少钱' : '初始价格（选填）'"
                :compact="!item"
                :disabled="locked"
                :reserve-error="!!item"
                :error="item && (submitted || priceTouched) ? priceErrors.price : ''"
                @blur="priceTouched = true"
            />
            <label v-if="item">
                <span>记录日期</span>
                <GlassInput
                    v-model="date"
                    type="date"
                    :aria-invalid="(submitted && !!priceErrors.date) || undefined"
                    :aria-describedby="submitted && priceErrors.date ? fieldId + '-date' : undefined"
                />
                <small v-if="submitted && priceErrors.date" :id="fieldId + '-date'" role="alert">
                    {{ priceErrors.date }}
                </small>
            </label>
            <label :class="{ 'editor-wide': !item }">
                <span>备注（选填）</span>
                <GlassInput v-model="note" type="text" />
            </label>
        </fieldset>
        <p v-if="error" class="price-editor-error" role="alert">{{ error }}</p>
        <footer>
            <GlassButton size="small" variant="plain" :disabled="saving" @click="emit('cancel')">
                取消
            </GlassButton>
            <GlassButton size="small" :disabled="saving" @click="submit">
                {{ saving ? '正在保存…' : retrying ? '重试保存' : '保存' }}
            </GlassButton>
        </footer>
    </form>
</template>

<style scoped src="./liquid-price-editor.css"></style>
