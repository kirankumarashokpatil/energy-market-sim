// ─── LEADERBOARD ENGINE ───
// Builds multi-dimensional leaderboard from player scores.
// Supports: overall ranking, role winners, system steward, most consistent.

// ─── Build Full Leaderboard ───
// players: array of { id, name, role, roleScore, systemScore, overallScore, roleDetail, cash }
// Returns: { overall: [...sorted], roleWinners: {}, systemSteward, mostConsistent }
export function buildLeaderboard(players) {
    if (!players || players.length === 0) {
        return { overall: [], roleWinners: {}, systemSteward: null, mostConsistent: null };
    }

    // Overall ranking: sort by overallScore descending, tie-break by roleScore, then cash
    const overall = [...players].sort((a, b) => {
        if ((b.overallScore || 0) !== (a.overallScore || 0)) return (b.overallScore || 0) - (a.overallScore || 0);
        if ((b.roleScore || 0) !== (a.roleScore || 0)) return (b.roleScore || 0) - (a.roleScore || 0);
        return (b.cash || 0) - (a.cash || 0);
    }).map((p, i) => ({ ...p, rank: i + 1 }));

    // Role winners: best roleScore within each role
    const roleWinners = {};
    const byRole = {};
    for (const p of players) {
        const r = p.role || 'GENERATOR';
        if (!byRole[r]) byRole[r] = [];
        byRole[r].push(p);
    }
    for (const [role, rolePlayers] of Object.entries(byRole)) {
        const best = rolePlayers.reduce((a, b) => (b.roleScore || 0) > (a.roleScore || 0) ? b : a, rolePlayers[0]);
        if (best && (best.roleScore || 0) > 0) {
            roleWinners[role] = { id: best.id, name: best.name, roleScore: best.roleScore };
        }
    }

    // System steward: highest systemScore
    const systemSteward = players.reduce((a, b) => (b.systemScore || 0) > (a.systemScore || 0) ? b : a, players[0]);

    // Most consistent: lowest variance in overallScore history (if available)
    // For now, use the player closest to their mean overallScore (least extreme)
    const mostConsistent = players.reduce((a, b) => {
        const aVar = Math.abs((a.overallScore || 50) - 50);
        const bVar = Math.abs((b.overallScore || 50) - 50);
        return aVar < bVar ? a : b;
    }, players[0]);

    return { overall, roleWinners, systemSteward, mostConsistent };
}

// ─── Rank Label ───
export function getRankLabel(rank) {
    if (rank === 1) return '🥇';
    if (rank === 2) return '🥈';
    if (rank === 3) return '🥉';
    return `#${rank}`;
}

// ─── Score Color ───
export function getScoreColor(score) {
    if (score >= 80) return '#1de98b';
    if (score >= 60) return '#38c0fc';
    if (score >= 40) return '#f5b222';
    if (score >= 20) return '#f0855a';
    return '#f0455a';
}

// ─── Generate Player Narrative ───
// One-sentence summary of what drove this player's score
export function generatePlayerNarrative(player) {
    if (!player) return '';

    const { role, roleScore, systemScore, overallScore, roleDetail, cash } = player;
    const rs = roleScore || 0;
    const ss = systemScore || 0;

    // Primary KPI description
    const primaryName = roleDetail?.primary?.name || 'Performance';
    const primaryVal = roleDetail?.primary?.value ?? '—';

    // Determine performance tier
    let tier = 'solid';
    if (rs >= 85) tier = 'exceptional';
    else if (rs >= 70) tier = 'strong';
    else if (rs >= 50) tier = 'decent';
    else if (rs >= 30) tier = 'struggling';
    else tier = 'poor';

    // System behavior
    let systemNote = '';
    if (ss >= 80) systemNote = ' — excellent system citizen';
    else if (ss >= 60) systemNote = ' — helpful to the grid';
    else if (ss <= 30) systemNote = ' — often destabilising';

    const roleName = role || 'Player';
    return `${roleName}: ${tier} ${primaryName} (${primaryVal})${systemNote}. P&L: £${Math.round(cash || 0)}.`;
}

// ─── Build Round Debrief Data ───
// Returns structured data for the round debrief overlay
export function buildRoundDebrief(leaderboardData, systemState) {
    const { overall, roleWinners, systemSteward } = leaderboardData;

    return {
        podium: overall.slice(0, 3),
        roleWinners,
        systemSteward: systemSteward ? {
            id: systemSteward.id,
            name: systemSteward.name,
            systemScore: systemSteward.systemScore,
        } : null,
        systemMetrics: {
            avgAbsNIV: systemState.nivHistory.length > 0
                ? (systemState.nivHistory.reduce((s, e) => s + e.absNiv, 0) / systemState.nivHistory.length).toFixed(0)
                : 0,
            totalBalancingCost: Math.round(systemState.totalBalancingCost || 0),
            stressEvents: systemState.stressEvents || 0,
            blackouts: systemState.blackouts || 0,
            totalSPs: systemState.totalSPs || 0,
        },
        narratives: overall.slice(0, 5).map(p => ({
            id: p.id,
            name: p.name,
            narrative: generatePlayerNarrative(p),
        })),
    };
}
