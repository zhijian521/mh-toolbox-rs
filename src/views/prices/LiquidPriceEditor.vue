<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { GlassButton } from '../../components/liquid-glass';
import PriceField from '../../components/PriceField.vue';
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
const title = computed(() => {
    if (!props.item) return '新增物品';
    return props.point ? '编辑价格记录' : '更新价格';
});
const subcategories = computed(
    () => props.categories.find((group) => group.value === category.value)?.children ?? [],
);
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
    if (props.item) {
        if (!props.retrying && (priceErrors.value.date || priceErrors.value.price)) return;
        emit('save', priceDraft.value);
    } else {
        if (!props.retrying && (itemErrors.value.name || itemErrors.value.sub)) return;
        emit('add', itemDraft.value, price.value ?? 0);
    }
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
        <fieldset :disabled="locked" class="price-editor-fields">
            <template v-if="!item">
                <label class="editor-wide">
                    <span>名称</span>
                    <input v-model="name" :maxlength="NAME_LIMIT" type="text" />
                    <small v-if="submitted && itemErrors.name" role="alert">
                        {{ itemErrors.name }}
                    </small>
                </label>
                <label>
                    <span>一级分类</span>
                    <select v-model="category" @change="subcategory = ''">
                        <option v-for="group in categories" :key="group.value" :value="group.value">
                            {{ group.label }}
                        </option>
                    </select>
                </label>
                <label>
                    <span>二级分类</span>
                    <select v-model="subcategory">
                        <option value="">未分类</option>
                        <option
                            v-for="option in subcategories"
                            :key="option.value"
                            :value="option.value"
                        >
                            {{ option.label }}
                        </option>
                        <option :value="customSubcategory">自定义</option>
                    </select>
                </label>
                <label v-if="subcategory === customSubcategory" class="editor-wide">
                    <span>自定义子类</span>
                    <input v-model="customSub" :maxlength="SUB_LIMIT" type="text" />
                    <small v-if="submitted && itemErrors.sub" role="alert">
                        {{ itemErrors.sub }}
                    </small>
                </label>
            </template>
            <label v-else>
                <span>记录日期</span>
                <input v-model="date" type="date" />
                <small v-if="submitted && priceErrors.date" role="alert">
                    {{ priceErrors.date }}
                </small>
            </label>
            <PriceField
                v-model="price"
                :class="{ 'editor-wide': !item }"
                :label="item ? '价格' : '初始价格（选填）'"
                :error="item && submitted ? priceErrors.price : ''"
                placeholder="0"
                size="md"
            />
            <label class="editor-wide">
                <span>备注（选填）</span>
                <input v-model="note" type="text" />
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
