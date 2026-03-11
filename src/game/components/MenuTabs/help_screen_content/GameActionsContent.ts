import type { ContentSection } from '../ContentSection';
import {
    COMMON_SPIN,
    COMMON_TURBO,
    HELP_AMPLIFY_DESC,
    HELP_AMPLIFY_LABEL,
    HELP_AUTOPLAY_DESC,
    HELP_AUTOPLAY_LABEL,
    HELP_BUY_DESC,
    HELP_BUY_LABEL,
    HELP_GAME_ACTIONS_TITLE,
    HELP_SPIN_DESC,
    HELP_TURBO_DESC,
} from '../../../../backend/LocalizationData';

/** Shared border opts for Game Actions item boxes (spin, amplify bet, autoplay, turbo). */
const gameActionsBorderOpts = {
    margin: 16,
    padding: 16,
    style: { fillColor: 0xffffff, strokeColor: 0xffffff, fillAlpha: 0.1, strokeAlpha: 0.0 },
} as const;

const spinSection: ContentSection = {
    Border: {
        opts: gameActionsBorderOpts,
    },
    Content: [
        {
            RichText: {
                opts: {
                    padding: { bottom: 20 },
                },
                parts: [
                    {
                        TextImage: {
                            key: 'spin_button',
                            opts: {
                                padding: { right: 20},
                            },
                        }
                    },
                    {
                        Text: {
                            key: COMMON_SPIN,
                            value: 'Spin',
                            fitToSingleLine: true,
                            minFontSize: 16,
                            style: {
                                fontSize: '24px',
                            },
                        }
                    }
                ]
            }
        },
        {
            Text: {
                key: HELP_SPIN_DESC,
                value: 'Starts the game round.',
            }
        }
    ]
};

const buyFeatureSection: ContentSection = {
    Border: {
        opts: { ...gameActionsBorderOpts },
    },
    Content: [
        {
            RichText: {
                opts: {
                    padding: { top: -20, left: -28, right: 12  },
                },
                parts: [
                    {
                        TextImage: {
                            key: 'feature',
                            text: {
                                value: 'BUY FEATURE\nCURRENCY:10000',
                                align: 'center',
                                style: {
                                    fontSize: '13px',
                                    color: '#000000',
                                },
                            },
                        }
                    },
                    {
                        Text: {
                            key: HELP_BUY_LABEL,
                            value: 'Buy Feature',
                            fitToSingleLine: true,
                            minFontSize: 16,
                            style: {
                                fontSize: '24px',
                            },
                        }
                    }
                ]
            }
        },
        {
            Text: {
                key: HELP_BUY_DESC,
                value: 'Lets you buy the free spins round for 100x your total bet.',
            }
        }
    ]
};

const amplifyBetSection: ContentSection = {
    Border: {
        opts: gameActionsBorderOpts,
    },
    Content: [
        {
            RichText: {
                opts: {
                    padding: { bottom: 20 },
                },
                parts: [
                    {
                        TextImage: {
                            key: 'amplify_bet_button',
                            opts: {
                                padding: { right: 20},
                            },
                        }
                    },
                    {
                        Text: {
                            key: HELP_AMPLIFY_LABEL,
                            value: 'Amplify Bet',
                            fitToSingleLine: true,
                            minFontSize: 16,
                            style: {
                                fontSize: '24px',
                            },
                        }
                    }
                ]
            }
        },
        {
            Text: {
                key: HELP_AMPLIFY_DESC,
                value: 'You\'re wagering 25% more per spin, but you also have better chances at hitting big features.',
            }
        }
    ]
};

const autoplaySection: ContentSection = {
    Border: {
        opts: gameActionsBorderOpts,
    },
    Content: [
        {
            RichText: {
                opts: {
                    padding: { bottom: 20 },
                },
                parts: [
                    {
                        TextImage: {
                            key: 'autoplay_button',
                            opts: {
                                padding: { right: 20},
                            },
                        }
                    },
                    {
                        Text: {
                            key: HELP_AUTOPLAY_LABEL,
                            value: 'Auto Play',
                            fitToSingleLine: true,
                            minFontSize: 16,
                            style: {
                                fontSize: '24px',
                            },
                        }
                    }
                ]
            }
        },
        {
            Text: {
                key: HELP_AUTOPLAY_DESC,
                value: 'Opens the autoplay menu. Tap again to stop autoplay.',
            }
        }
    ]
};

const turboSection: ContentSection = {
    Border: {
        opts: gameActionsBorderOpts,
    },
    Content: [
        {
            RichText: {
                opts: {
                    padding: { bottom: 20 },
                },
                parts: [
                    {
                        TextImage: {
                            key: 'turbo_button',
                            opts: {
                                padding: { right: 20},
                            },
                        }
                    },
                    {
                        Text: {
                            key: COMMON_TURBO,
                            value: 'Turbo',
                            fitToSingleLine: true,
                            minFontSize: 16,
                            style: {
                                fontSize: '24px',
                            },
                        }
                    }
                ]
            }
        },
        {
            Text: {
                key: HELP_TURBO_DESC,
                value: 'Speeds up the game.',
            }
        }
    ]
};

export const gameActionsSection: ContentSection = {
    Header: {
        key: HELP_GAME_ACTIONS_TITLE,
        value: 'Game Actions',
        opts: {
            padding: { top: 24 },
        },
    },
    Content: [
        { ChildSection: spinSection },
        { ChildSection: buyFeatureSection },
        { ChildSection: amplifyBetSection },
        { ChildSection: autoplaySection },
        { ChildSection: turboSection },
    ]
};
