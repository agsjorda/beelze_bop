import type { ContentSection } from '../ContentSection';
import { scatterSymbolKey } from './PayoutContent';

const bonusTriggerContent: ContentSection = {
    Border: {
        opts: {
            margin: { top: 10, bottom: 10 },
            style: {
                alpha: 0,
                strokeAlpha: 0,
            },
        },
    },
    Content: [
        {
            Header: {
                key: 'help_bonus-trigger-title',
                value: 'Bonus Trigger',
                opts: {
                    padding: { top: 12, bottom: 12 },
                },
            },
        },
        {
            RichText: {
                opts: {
                    padding: { top: 15, bottom: 15 },
                },
                placeholderImages: {
                    image: {
                        key: scatterSymbolKey,
                        opts: { scale: 0.15, padding: { bottom: -6 } },
                    },
                },
                parts: [
                    {
                        Text: {
                            key: 'help_bonus-trigger-desc',
                            value: 'Land 4 or more {image} SCATTER symbols anywhere on the screen to trigger the FREE SPINS feature.\nYou\'ll start with 10 free spins.\nDuring the bonus round, hitting 3 or more SCATTER symbols awards 5 extra free spins.',
                        },
                    },
                ]
            }
        }
    ]
};

const multiplierGameContent: ContentSection = {
    Content: [
        {
            Image: {
                opts: {
                    padding: { top: 6 },
                    align: 0.5,
                    anchor: { x: 0.5, y: 0 },
                    size: 'fitToWidth',
                },
                key: 'multiplierGame' 
            }
        },
        {
            Header: {
                opts: {
                    padding: { top: 40, bottom: 20 },
                },
                key: 'help_multiplier-title',
                value: 'Multiplier',
            },
        },
        {
            RichText: {
                opts: {
                    padding: { top: 15, bottom: 15 },
                },
                placeholderImages: {
                    image: {
                        key: 'help_multiplier_symbol',
                        opts: { scale: 1.2, padding: { bottom: -6 } },
                    },
                },
                parts: [
                    {
                        Text: {
                            key: 'help_multiplier-desc',
                            value: 'The {image} Multiplier symbol appears only during the FREE SPINS round and remains on the screen until the tumbling sequence ends.\nEach time a {image} lands, it randomly takes a multiplier value: 2x, 3x, 4x, 5x, 6x, 8x, 10x, 12x, 15x, 20x, 25x, 50x, or even 100x!\n\nOnce all tumbles are finished, the total of all {image} multipliers is added and applied to the total win of that sequence.\nSpecial reels are used during the FREE SPINS round.',
                        },
                    },
                ],
            }
        }
    ]
};

export const freeSpinContent: ContentSection = {
    Header: {
        key: 'help_freespin-rules-title',
        value: 'Free Spin Rules',
    },
    Border: {
        opts: { 
            margin: { top: 12, bottom: 12 }, 
            padding: 20,
        },
    },
    Content: [
        { 
            Image: {
                opts: {
                    padding: { top: 20, bottom: 40, left: -15 },
                    align: 0.5,
                    anchor: { x: 0.5, y: 0 },
                    size: 'fitToWidth',
                },
                key: 'scatterGame' 
            } 
        },
        { ChildSection: bonusTriggerContent },
        { LineBreak: { opts: { margin: { top: 50, bottom: 50 } } } },
        { ChildSection: multiplierGameContent },
    ],
};
