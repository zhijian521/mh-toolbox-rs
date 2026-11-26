<script setup lang="ts">
import { computed, nextTick, onMounted, ref, useId, watch } from 'vue';
import { GlassButton } from '../../components/liquid-glass';
import GlassDateField from '../../components/liquid-glass/GlassDateField.vue';
import GlassInput from '../../components/liquid-glass/GlassInput.vue';
import GlassSelect from '../../components/liquid-glass/GlassSelect.vue';
import GlassPriceField from '../../components/liquid-glass/GlassPriceField.vue';
import { todayText } from '../../services/format';
import { DEFAULT_CATEGORY, type priceCategoryGroups } from './prices-catalog';
import {
    currentPoint,
    toItemDraft,
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
    editItem?: boolean;
    prefillCurrent?: boolean;
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
    update: [draft: PriceItemDraft];
    save: [draft: PricePointDraft];
    cancel: [];
    'update:dirty': [value: boolean];
}>();

const fieldId = useId();
const form = ref<HTMLFormElement | null>(null);
const details = props.editItem && props.item ? toItemDraft(props.item) : undefined;
const recording = computed(() => !!props.item && !props.editItem);
const name = ref(details?.name ?? '');
const category = ref(details?.category ?? DEFAULT_CATEGORY);
const subcategory = ref(details?.sub ?? '');
const customSubcategory = '__custom_subcategory__';
const customSub = ref('');
const date = ref(props.point?.date ?? todayText());
const currentPrice = props.prefillCurrent && props.item ? currentPoint(props.item)?.price : null;
const price = ref<number | null>(props.point?.price ?? currentPrice ?? null);
const note = ref(details?.note ?? props.point?.note ?? '');
const submitted = ref(false);
const priceTouched = ref(false);
const title = computed(() => {
    if (props.editItem) return '编辑物品';
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
const priceDraft = computed(() => ({
    date: date.value,
    price: price.value ?? 0,
    note: note.value,
}));
const draftSnapshot = computed(() => {
    if (recording.value) return JSON.stringify(priceDraft.value);
    return JSON.stringify({
        ...itemDraft.value,
        initialPrice: props.editItem ? 0 : (price.value ?? 0),
    });
});
const initialDraft = draftSnapshot.value;
watch(draftSnapshot, (snapshot) => emit('update:dirty', snapshot !== initialDraft), {
    flush: 'sync',
});
const itemErrors = computed(() => itemDraftErrors(itemDraft.value));
const priceErrors = computed(() => pointDraftErrors(priceDraft.value));

function submit() {
    if (props.saving) return;
    submitted.value = true;
    const invalid = recording.value
        ? priceErrors.value.price || priceErrors.value.date
        : itemErrors.value.name || itemErrors.value.sub;
    if (!props.retrying && invalid) {
        void nextTick(() =>
            form.value?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus(),
        );
        return;
    }
    if (props.editItem) emit('update', itemDraft.value);
    else if (recording.value) emit('save', priceDraft.value);
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
    const firstInput = recording.value ? '[inputmode="decimal"]' : 'input';
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
            <p v-if="recording">{{ item?.name }}</p>
        </header>
        <fieldset :disabled="locked" class="price-editor-fields lg-form-fields">
            <template v-if="!recording">
                <label class="editor-wide">
                    <span>名称</span>
                    <GlassInput
                        v-model="name"
                        :maxlength="NAME_LIMIT"
                        type="text"
                        :aria-invalid="(submitted && !!itemErrors.name) || undefined"
                        :aria-describedby="
                            submitted && itemErrors.name ? fieldId + '-name' : undefined
                        "
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
                        :aria-describedby="
                            submitted && itemErrors.sub ? fieldId + '-customSub' : undefined
                        "
                    />
                    <small
                        v-if="submitted && itemErrors.sub"
                        :id="fieldId + '-customSub'"
                        role="alert"
                    >
                        {{ itemErrors.sub }}
                    </small>
                </label>
            </template>
            <GlassPriceField
                v-if="!editItem"
                v-model="price"
                class="editor-wide"
                :label="recording ? '这一笔多少钱' : '初始价格（选填）'"
                :compact="!recording"
                :disabled="locked"
                :reserve-error="recording"
                :error="recording && (submitted || priceTouched) ? priceErrors.price : ''"
                @blur="priceTouched = true"
            />
            <GlassDateField
                v-if="recording"
                v-model="date"
                label="记录日期"
                :disabled="locked"
                :error="submitted ? priceErrors.date : ''"
            />
            <label :class="{ 'editor-wide': !recording }">
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
