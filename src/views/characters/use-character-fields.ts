import { inject } from 'vue';
import { glassLedger } from '../../components/glass-ledger';
import GlassCompactNumberField from '../../components/liquid-glass/GlassCompactNumberField.vue';
import GlassSelect from '../../components/liquid-glass/GlassSelect.vue';
import LedgerNumberField from '../../components/NumberField.vue';
import PaperCard from '../../components/PaperCard.vue';
import LedgerSelectField from '../../components/SelectField.vue';

export function useCharacterFields() {
    const glass = inject(glassLedger, null);
    return {
        glass,
        NumberField: glass ? GlassCompactNumberField : LedgerNumberField,
        SelectField: glass ? GlassSelect : LedgerSelectField,
        selectProps: glass ? { hideLabel: true } : {},
        DetailCard: glass?.card ?? PaperCard,
    };
}
