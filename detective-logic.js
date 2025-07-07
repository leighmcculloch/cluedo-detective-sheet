/**
 * Cluedo Detective Sheet Logic
 * 
 * This module contains the core logic for processing clues and determining
 * the state of the detective sheet. It uses conservative logic to avoid
 * making assumptions unless absolutely certain.
 */

// Game data constants
const GAME_DATA = {
    people: ['Miss Scarlet', 'Colonel Mustard', 'Mrs. White', 'Mr. Green', 'Mrs. Peacock', 'Professor Plum'],
    weapons: ['Candlestick', 'Knife', 'Lead Pipe', 'Revolver', 'Rope', 'Wrench'],
    rooms: ['Kitchen', 'Ballroom', 'Conservatory', 'Dining Room', 'Billiard Room', 'Library', 'Lounge', 'Hall', 'Study']
};

// State constants
const CARD_STATES = {
    UNKNOWN: 0,
    HAS: 1,
    DOESNT_HAVE: -1,
    MAYBE: 2
};

/**
 * Process all inputs and return the complete sheet state
 * @param {Object} inputs - The inputs object containing players, suggestions, and manual overrides
 * @returns {Object} - The complete sheet state
 */
function processDetectiveSheet(inputs) {
    const { players, suggestions, manualOverrides = {} } = inputs;
    
    // Initialize grid - grid[card][player] = state
    const grid = {};
    const maybeSets = {};
    
    // Initialize all cards for all players as unknown
    const allCards = [...GAME_DATA.people, ...GAME_DATA.weapons, ...GAME_DATA.rooms];
    allCards.forEach(card => {
        grid[card] = {};
        players.forEach(player => {
            grid[card][player] = CARD_STATES.UNKNOWN;
        });
    });
    
    // Apply manual overrides first (these are definitive)
    Object.entries(manualOverrides).forEach(([card, playerStates]) => {
        Object.entries(playerStates).forEach(([player, state]) => {
            if (players.includes(player)) {
                grid[card][player] = state;
            }
        });
    });
    
    // Process suggestions
    suggestions.forEach(suggestion => {
        processSuggestion(suggestion, grid, maybeSets, players);
    });
    
    // Run conservative elimination logic
    runConservativeEliminationLogic(grid, maybeSets, players, suggestions);
    
    return {
        grid,
        maybeSets,
        solution: determineSolution(grid, players)
    };
}

/**
 * Process a single suggestion and update the grid
 * @param {Object} suggestion - The suggestion object
 * @param {Object} grid - The current grid state
 * @param {Object} maybeSets - The maybe sets for tracking card possibilities
 * @param {Array} players - List of all players
 */
function processSuggestion(suggestion, grid, maybeSets, players) {
    const { suggester, cards, revealer, revealedCard, passers = [] } = suggestion;
    
    // Mark passers as not having any of the suggested cards
    passers.forEach(passer => {
        cards.forEach(card => {
            if (grid[card][passer] === CARD_STATES.UNKNOWN) {
                grid[card][passer] = CARD_STATES.DOESNT_HAVE;
            }
        });
    });
    
    if (revealer === 'pass') {
        // Everyone passed - all players (except suggester) don't have any of these cards
        cards.forEach(card => {
            players.forEach(player => {
                if (player !== suggester && grid[card][player] === CARD_STATES.UNKNOWN) {
                    grid[card][player] = CARD_STATES.DOESNT_HAVE;
                }
            });
        });
        
        // If everyone passes, and we have a small number of players, 
        // and all cards are accounted for, then these cards are likely in the solution
        // But we'll let the solution detection logic handle this
        
        // For now, we'll be conservative and not mark the suggester as having or not having
        // the cards, letting the solution detection handle it
    } else if (revealedCard) {
        // We know exactly which card was revealed
        grid[revealedCard][revealer] = CARD_STATES.HAS;
        // The revealer doesn't have the other suggested cards
        cards.forEach(card => {
            if (card !== revealedCard && grid[card][revealer] === CARD_STATES.UNKNOWN) {
                grid[card][revealer] = CARD_STATES.DOESNT_HAVE;
            }
        });
    } else {
        // We don't know which card, but they have at least one
        // Create a maybe set to track this constraint
        const eligibleCards = cards.filter(card => 
            grid[card][revealer] !== CARD_STATES.DOESNT_HAVE && 
            grid[card][revealer] !== CARD_STATES.HAS
        );
        
        if (eligibleCards.length > 0) {
            // Create a new maybe set
            const setId = Date.now() + Math.random();
            const newSet = {
                id: setId,
                cards: eligibleCards,
                suggestion: suggestion
            };
            
            // Add to player's maybe sets
            if (!maybeSets[revealer]) {
                maybeSets[revealer] = [];
            }
            maybeSets[revealer].push(newSet);
            
            // Mark eligible cards as maybe
            eligibleCards.forEach(card => {
                if (grid[card][revealer] === CARD_STATES.UNKNOWN) {
                    grid[card][revealer] = CARD_STATES.MAYBE;
                }
            });
        }
    }
}

/**
 * Run conservative elimination logic
 * This version is more conservative and only makes deductions when absolutely certain
 * @param {Object} grid - The current grid state
 * @param {Object} maybeSets - The maybe sets for tracking card possibilities
 * @param {Array} players - List of all players
 * @param {Array} suggestions - List of all suggestions
 */
function runConservativeEliminationLogic(grid, maybeSets, players, suggestions) {
    let changed = true;
    let iterations = 0;
    const maxIterations = 100; // Prevent infinite loops
    
    while (changed && iterations < maxIterations) {
        changed = false;
        iterations++;
        
        // Rule 1: If a player definitely has a card, mark all other players as not having it
        Object.keys(grid).forEach(card => {
            const playersWithCard = players.filter(player => grid[card][player] === CARD_STATES.HAS);
            
            if (playersWithCard.length === 1) {
                // One player has the card, so all others don't have it
                players.forEach(player => {
                    if (player !== playersWithCard[0] && grid[card][player] !== CARD_STATES.DOESNT_HAVE) {
                        grid[card][player] = CARD_STATES.DOESNT_HAVE;
                        changed = true;
                        // Update maybe sets
                        removeMaybeCardFromSets(card, player, maybeSets);
                    }
                });
            }
        });
        
        // Rule 2: If a player has a definite card from a suggestion, they don't have the others
        suggestions.forEach(suggestion => {
            if (suggestion.revealedCard) return; // Skip if we know the exact card
            
            const { cards, revealer } = suggestion;
            const hasCards = cards.filter(card => grid[card] && grid[card][revealer] === CARD_STATES.HAS);
            
            if (hasCards.length === 1) {
                // They have exactly one of the suggested cards, so they don't have the others
                cards.forEach(card => {
                    if (card !== hasCards[0] && grid[card] && grid[card][revealer] === CARD_STATES.MAYBE) {
                        grid[card][revealer] = CARD_STATES.DOESNT_HAVE;
                        changed = true;
                        removeMaybeCardFromSets(card, revealer, maybeSets);
                    }
                });
            }
        });
        
        // Rule 3: Set-based elimination - if only one card left in a set, they must have it
        players.forEach(player => {
            if (!maybeSets[player]) return;
            
            maybeSets[player].forEach(set => {
                const possibleCards = set.cards.filter(card => 
                    grid[card] && grid[card][player] === CARD_STATES.MAYBE
                );
                
                if (possibleCards.length === 1) {
                    // Only one card left in the set, so they must have it
                    grid[possibleCards[0]][player] = CARD_STATES.HAS;
                    changed = true;
                    cleanupSetsForPlayer(player, possibleCards[0], maybeSets, grid);
                }
            });
        });
        
        // Rule 4: VERY CONSERVATIVE - Only mark as "has" if absolutely certain
        // This should only happen when we have definitive proof, not just process of elimination
        // We'll be very conservative here and NOT make assumptions based on elimination alone
        Object.keys(grid).forEach(card => {
            const definitelyHas = players.filter(player => grid[card][player] === CARD_STATES.HAS);
            const definitelyDoesntHave = players.filter(player => grid[card][player] === CARD_STATES.DOESNT_HAVE);
            const maybeHas = players.filter(player => grid[card][player] === CARD_STATES.MAYBE);
            const unknown = players.filter(player => grid[card][player] === CARD_STATES.UNKNOWN);
            
            // Only make this deduction if there's literally no other possibility
            // AND we have some evidence that the card is held by players (not in solution)
            // We'll be very conservative and require that we've seen evidence of the card being held
            if (definitelyHas.length === 0 && maybeHas.length === 0 && unknown.length === 1) {
                // Check if we have evidence that this card is held by players
                // (e.g., someone revealed it or we have manual override)
                const hasEvidence = suggestions.some(s => 
                    s.revealedCard === card || 
                    (s.cards.includes(card) && s.revealer !== 'pass')
                );
                
                if (hasEvidence) {
                    // Only one player could possibly have it, so they must have it
                    grid[card][unknown[0]] = CARD_STATES.HAS;
                    changed = true;
                    cleanupSetsForPlayer(unknown[0], card, maybeSets, grid);
                }
            }
        });
    }
    
    // Clean up empty maybe sets
    Object.keys(maybeSets).forEach(player => {
        maybeSets[player] = maybeSets[player].filter(set => set.cards.length > 0);
    });
}

/**
 * Remove a card from all maybe sets for a player
 * @param {string} card - The card to remove
 * @param {string} player - The player
 * @param {Object} maybeSets - The maybe sets
 */
function removeMaybeCardFromSets(card, player, maybeSets) {
    if (!maybeSets[player]) return;
    
    maybeSets[player].forEach(set => {
        const cardIndex = set.cards.indexOf(card);
        if (cardIndex !== -1) {
            set.cards.splice(cardIndex, 1);
        }
    });
}

/**
 * Clean up sets when a player definitely has a card
 * @param {string} player - The player
 * @param {string} definiteCard - The card they definitely have
 * @param {Object} maybeSets - The maybe sets
 * @param {Object} grid - The current grid state
 */
function cleanupSetsForPlayer(player, definiteCard, maybeSets, grid) {
    if (!maybeSets[player]) return;
    
    // Find sets containing this card and remove other cards from those sets
    const setsToUpdate = maybeSets[player].filter(set => set.cards.includes(definiteCard));
    
    setsToUpdate.forEach(set => {
        set.cards.forEach(card => {
            if (card !== definiteCard && grid[card] && grid[card][player] === CARD_STATES.MAYBE) {
                grid[card][player] = CARD_STATES.DOESNT_HAVE;
            }
        });
    });
    
    // Remove sets that contained this card
    maybeSets[player] = maybeSets[player].filter(set => !set.cards.includes(definiteCard));
}

/**
 * Determine the solution based on the current grid state
 * @param {Object} grid - The current grid state
 * @param {Array} players - List of all players
 * @returns {Object} - The solution object with person, weapon, room (or null if unknown)
 */
function determineSolution(grid, players) {
    const solution = {
        person: null,
        weapon: null,
        room: null
    };
    
    // Check if we can determine the solution
    ['people', 'weapons', 'rooms'].forEach(category => {
        let categoryKey;
        switch(category) {
            case 'people': categoryKey = 'person'; break;
            case 'weapons': categoryKey = 'weapon'; break;
            case 'rooms': categoryKey = 'room'; break;
        }
        
        GAME_DATA[category].forEach(card => {
            const playersWhoHaveCard = players.filter(player => 
                grid[card] && grid[card][player] === CARD_STATES.HAS
            );
            
            const playersWhoMightHaveCard = players.filter(player => 
                grid[card] && (grid[card][player] === CARD_STATES.MAYBE || grid[card][player] === CARD_STATES.UNKNOWN)
            );
            
            // Only mark as solution if we're absolutely certain no player has it
            if (playersWhoHaveCard.length === 0 && playersWhoMightHaveCard.length === 0) {
                // No player has or might have this card, so it's in the solution
                solution[categoryKey] = card;
            }
        });
    });
    
    return solution;
}

// Export functions for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    // Node.js environment
    module.exports = {
        processDetectiveSheet,
        GAME_DATA,
        CARD_STATES
    };
} else {
    // Browser environment
    window.DetectiveLogic = {
        processDetectiveSheet,
        GAME_DATA,
        CARD_STATES
    };
}