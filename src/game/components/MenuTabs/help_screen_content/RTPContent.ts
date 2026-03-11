import type { ContentSection } from '../ContentSection';
import { HELP_RTP_TITLE } from '../../../../backend/LocalizationData';

export const rtpContent: ContentSection = {
    Header: {
        opts: { padding: { top: 12, bottom: 12 } },
        key: HELP_RTP_TITLE,
        value: 'RTP',
    },
    Content: [
        { Text: { opts: { padding: 2 }, value: '96.49% - 96.6%' } },
    ],
};