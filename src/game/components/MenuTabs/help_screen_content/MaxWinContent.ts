import type { ContentSection } from '../ContentSection';
import { HELP_MAX_WIN_TITLE } from '../../../../backend/LocalizationData';

export const maxWinContent: ContentSection = {
    Header: {
        opts: { padding: { top: 12, bottom: 12 } },
        key: HELP_MAX_WIN_TITLE,
        value: 'Max Win',
    },
    Content: [
        { Text: { opts: { padding: 2 }, value: '21,000x' } },
    ],
};