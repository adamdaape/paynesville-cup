// 📊 Paynesville Cup Frontend Application Logic

// Global State
let cupData = null;
let currentTab = 'lifetime';
let selectedYear = 2025;
let selectedTournament = '3-CLUB CHALLENGE';
let searchQuery = '';

// Rivalry selections
let rivalryPlayerA = '';
let rivalryPlayerB = '';

// Sorting State
let sortKey = 'LifetimeCupPoints'; // Default sort key for lifetime
let sortAscending = false; // Default: Descending (highest points first)

let yearlySortKey = 'Cup Points'; // Default sort key for yearly
let yearlySortAscending = false; // Default: Descending

// Initialize dashboard
document.addEventListener('DOMContentLoaded', () => {
    fetchCupData();
});

// Fetch data from cup_data.json
async function fetchCupData() {
    try {
        const response = await fetch('cup_data.json');
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        cupData = await response.json();
        
        // Populate search lists and metadata
        populateMetadata();
        
        // Initialize with default tab
        switchTab('lifetime');
    } catch (e) {
        console.error("Failed to load cup data: ", e);
        document.getElementById('main-data-table').innerHTML = `
            <tr>
                <td colspan="10" style="text-align: center; color: var(--accent-red); font-weight: 600; padding: 3rem;">
                    ⚠️ Error loading database: Please ensure 'compile_to_json.py' has been run and 'cup_data.json' exists.
                </td>
            </tr>
        `;
    }
}

// Populate stats widget
function populateMetadata() {
    if (!cupData) return;
    
    const uniquePlayers = cupData.lifetime.length;
    document.getElementById('stat-total-players').textContent = uniquePlayers;
    
    const uniqueEntries = cupData.granular.length;
    document.getElementById('stat-total-entries').textContent = uniqueEntries.toLocaleString();
    
    if (uniquePlayers >= 2) {
        const names = cupData.lifetime.map(p => p.PlayerName);
        rivalryPlayerA = names.includes("Adam Murphy") ? "Adam Murphy" : names[0];
        rivalryPlayerB = names.includes("Zach Leahy") ? "Zach Leahy" : names[1];
    }
    
    const tourneySelect = document.getElementById('tournament-select');
    if (tourneySelect && tourneySelect.children.length === 0) {
        MAIN_TOURNAMENTS.forEach(t => {
            const opt = document.createElement('option');
            opt.value = t;
            opt.textContent = t;
            tourneySelect.appendChild(opt);
        });
    }
    
    generateFacebookRecap();
}

// Switch dashboard tabs
function switchTab(tabName) {
    currentTab = tabName;
    
    // Update desktop sidebar nav
    document.querySelectorAll('.nav-item').forEach(btn => btn.classList.remove('active'));
    const sidebarBtn = document.getElementById(`btn-${tabName}`);
    if (sidebarBtn) sidebarBtn.classList.add('active');

    // Update mobile bottom nav
    document.querySelectorAll('.mobile-nav-btn').forEach(btn => btn.classList.remove('active'));
    const mobileBtn = document.getElementById(`mobile-btn-${tabName}`);
    if (mobileBtn) mobileBtn.classList.add('active');
    
    const searchBar = document.getElementById('search-input');
    searchBar.value = '';
    searchQuery = '';
    
    const pageTitle = document.getElementById('page-title');
    const pageSubtitle = document.getElementById('page-subtitle');
    const filterContainer = document.getElementById('yearly-filter-container');
    const tournamentFilterContainer = document.getElementById('tournament-filter-container');
    const highlightsContainer = document.getElementById('tournament-highlights-container');
    const tableCardTitle = document.getElementById('table-card-title');
    
    searchBar.style.display = 'block';
    if (filterContainer) filterContainer.style.display = 'none';
    if (tournamentFilterContainer) tournamentFilterContainer.style.display = 'none';
    if (highlightsContainer) highlightsContainer.style.display = 'none';
    
    // Restore the main data table structure if coming from the rivalry tab
    const tableContainer = document.getElementById('leaderboard-table-container');
    if (tabName !== 'rivalry' && !document.getElementById('main-data-table')) {
        tableContainer.innerHTML = '<table class="data-table" id="main-data-table"></table>';
    }
    
    if (tabName === 'lifetime') {
        pageTitle.textContent = "Paynesville Cup Master Leaderboard";
        pageSubtitle.textContent = "Cumulative statistics, years competed, and active point streaks across 2022-2025.";
        tableCardTitle.textContent = "Lifetime Standings";
        sortKey = 'LifetimeCupPoints';
        sortAscending = false;
        renderLifetimeTable();
    } else if (tabName === 'yearly') {
        pageTitle.textContent = "Yearly Historical Standings";
        pageSubtitle.textContent = "Overall placements and average scores for individual years.";
        tableCardTitle.textContent = `Yearly Leaderboard`;
        if (filterContainer) filterContainer.style.display = 'flex';
        yearlySortKey = 'Cup Points';
        yearlySortAscending = false;
        renderYearlyTable();
    } else if (tabName === 'tournaments') {
        pageTitle.textContent = "🏆 Tournament Histories";
        pageSubtitle.textContent = "Detailed historical statistics and medals per individual tournament.";
        tableCardTitle.textContent = "Tournament Leaderboard";
        if (tournamentFilterContainer) tournamentFilterContainer.style.display = 'flex';
        if (highlightsContainer) highlightsContainer.style.display = 'block';
        renderTournamentTable();
    } else if (tabName === 'odds') {
        pageTitle.textContent = "🎲 2026 Vegas Live Odds Board";
        pageSubtitle.textContent = "Vegas-style betting odds and simulated win probabilities calculated from 10,000 Monte Carlo runs.";
        tableCardTitle.textContent = "2026 Championship Predictions";
        renderOddsTable();
    } else if (tabName === 'bubble') {
        pageTitle.textContent = "🎈 The Top-4 Bubble Watch (2025)";
        pageSubtitle.textContent = "Standing stabilization trackers showing who has a chance to discard their lowest score in the next event.";
        tableCardTitle.textContent = "Active Standings Bubble List";
        renderBubbleTable();
    } else if (tabName === 'rivalry') {
        pageTitle.textContent = "🥊 Cousin Rivalry Head-to-Head";
        pageSubtitle.textContent = "Direct statistical comparisons, event averages, and head-to-head records.";
        tableCardTitle.textContent = "Interactive Rivalry Comparison";
        searchBar.style.display = 'none';
        renderRivalryComparison();
    }
}

// ----------------- PARSING HELPER FOR PLACE STRINGS (Handles "T2", "N/A" etc) -----------------
function parsePlace(placeVal) {
    if (placeVal === null || placeVal === undefined) return Infinity;
    const str = String(placeVal).trim();
    if (str === 'N/A' || str === '' || str === 'None') return Infinity;
    const match = str.match(/\d+/);
    return match ? parseInt(match[0], 10) : Infinity;
}

// Handle column sorting click for Lifetime
function setLifetimeSort(key) {
    if (sortKey === key) {
        sortAscending = !sortAscending;
    } else {
        sortKey = key;
        // Default to descending (highest points/values first) unless sorting by Name or Rank
        sortAscending = (key === 'PlayerName');
    }
    renderLifetimeTable();
}

// Handle column sorting click for Yearly
function setYearlySort(key) {
    if (yearlySortKey === key) {
        yearlySortAscending = !yearlySortAscending;
    } else {
        yearlySortKey = key;
        // Default to descending unless sorting by Name or Place
        yearlySortAscending = (key === 'Name' || key === 'Place');
    }
    renderYearlyTable();
}

// Get sort indicator icon
function getSortIndicator(currentKey, activeKey, isAsc) {
    if (currentKey !== activeKey) return '<span class="sort-arrow">⇅</span>';
    return isAsc ? '<span class="sort-arrow active">▲</span>' : '<span class="sort-arrow active">▼</span>';
}

// ----------------- RENDER LIFETIME LEADERBOARD -----------------
function renderLifetimeTable() {
    if (!cupData) return;
    
    // Calculate historic Paynesville Cup Champions
    const champions = new Set();
    const years = [...new Set(cupData.yearly.map(y => y.Year))];
    years.forEach(year => {
        const yearData = cupData.yearly.filter(y => y.Year === year);
        yearData.sort((a,b) => b['Cup Points'] - a['Cup Points']);
        if (yearData.length > 0) {
            champions.add(yearData[0].Name);
        }
    });
    
    const table = document.getElementById('main-data-table');
    
    // Sort logic
    let sortedData = [...cupData.lifetime];
    sortedData.sort((a, b) => {
        let valA = a[sortKey];
        let valB = b[sortKey];
        
        // Handle Null values
        if (valA === null || valA === undefined) return sortAscending ? -1 : 1;
        if (valB === null || valB === undefined) return sortAscending ? 1 : -1;
        
        if (typeof valA === 'string') {
            return sortAscending ? valA.localeCompare(valB) : valB.localeCompare(valA);
        } else {
            return sortAscending ? valA - valB : valB - valA;
        }
    });
    
    // Apply search filter
    const filtered = sortedData.filter(p => 
        p.PlayerName.toLowerCase().includes(searchQuery.toLowerCase())
    );
    
    let html = `
        <thead>
            <tr>
                <th style="width: 52px; cursor: pointer;" onclick="setLifetimeSort('LifetimeCupPoints')" title="Rank">Rank</th>
                <th style="cursor: pointer; min-width: 120px;" onclick="setLifetimeSort('PlayerName')" title="Player Name">Player ${getSortIndicator('PlayerName', sortKey, sortAscending)}</th>
                <th style="text-align: right; cursor: pointer; white-space: nowrap;" onclick="setLifetimeSort('LifetimeCupPoints')" title="Lifetime Cup Points">Pts ${getSortIndicator('LifetimeCupPoints', sortKey, sortAscending)}</th>
                <th style="text-align: right; cursor: pointer; white-space: nowrap;" onclick="setLifetimeSort('AverageCupScore')" title="Average Cup Score per year">Avg ${getSortIndicator('AverageCupScore', sortKey, sortAscending)}</th>
                <th style="text-align: right; cursor: pointer; white-space: nowrap;" onclick="setLifetimeSort('TotalTournamentsEntered')" title="Total Tournaments Entered"># Entries ${getSortIndicator('TotalTournamentsEntered', sortKey, sortAscending)}</th>
                <th style="text-align: center; cursor: pointer; white-space: nowrap;" onclick="setLifetimeSort('YearsCompeted')" title="Years Competed">Yrs ${getSortIndicator('YearsCompeted', sortKey, sortAscending)}</th>
                <th style="text-align: center; cursor: pointer;" onclick="setLifetimeSort('2022')" title="2022 Cup Score">2022 ${getSortIndicator('2022', sortKey, sortAscending)}</th>
                <th style="text-align: center; cursor: pointer;" onclick="setLifetimeSort('2023')" title="2023 Cup Score">2023 ${getSortIndicator('2023', sortKey, sortAscending)}</th>
                <th style="text-align: center; cursor: pointer;" onclick="setLifetimeSort('2024')" title="2024 Cup Score">2024 ${getSortIndicator('2024', sortKey, sortAscending)}</th>
                <th style="text-align: center; cursor: pointer;" onclick="setLifetimeSort('2025')" title="2025 Cup Score">2025 ${getSortIndicator('2025', sortKey, sortAscending)}</th>
            </tr>
        </thead>
        <tbody>
    `;
    
    if (filtered.length === 0) {
        html += `<tr><td colspan="10" style="text-align: center; color: var(--text-secondary); padding: 2rem;">No players found matching your search.</td></tr>`;
    } else {
        filtered.forEach((p, idx) => {
            // Find absolute rank based on overall standings list order
            const originalRank = cupData.lifetime.findIndex(x => x.PlayerName === p.PlayerName) + 1;
            
            const badgeClass = originalRank === 1 ? 'rank-1' : originalRank === 2 ? 'rank-2' : originalRank === 3 ? 'rank-3' : 'rank-other';
            const trophyIcon = champions.has(p.PlayerName) ? ' <span title="Historic Paynesville Cup Champion" style="margin-left: 0.25rem; font-size: 1.1rem;">🏆</span>' : '';
            
            const cell2022 = p['2022'] !== null ? `${p['2022'].toFixed(1)}` : '-';
            const cell2023 = p['2023'] !== null ? `${p['2023'].toFixed(1)}` : '-';
            const cell2024 = p['2024'] !== null ? `${p['2024'].toFixed(1)}` : '-';
            const cell2025 = p['2025'] !== null ? `${p['2025'].toFixed(1)}` : '-';
            
            html += `
                <tr>
                    <td style="text-align: center;"><span class="rank-badge ${badgeClass}">${originalRank}</span></td>
                    <td style="font-weight: 600; color: var(--text-primary); cursor: pointer;" onclick="showPlayerCard('${p.PlayerName}')">${p.PlayerName}${trophyIcon}</td>
                    <td style="text-align: right; font-weight: 700; color: var(--accent-gold);">${p.LifetimeCupPoints.toFixed(1)}</td>
                    <td style="text-align: right;">${p.TotalTournamentsEntered}</td>
                    <td style="text-align: center;">${p.YearsCompeted}</td>
                    <td style="text-align: right; color: var(--accent-cyan); font-weight: 600;">${p.AverageCupScore.toFixed(1)}</td>
                    <td style="text-align: center; opacity: ${p['2022'] !== null ? 1 : 0.4};">${cell2022}</td>
                    <td style="text-align: center; opacity: ${p['2023'] !== null ? 1 : 0.4};">${cell2023}</td>
                    <td style="text-align: center; opacity: ${p['2024'] !== null ? 1 : 0.4};">${cell2024}</td>
                    <td style="text-align: center; opacity: ${p['2025'] !== null ? 1 : 0.4};">${cell2025}</td>
                </tr>
            `;
        });
    }
    
    html += `</tbody>`;
    table.innerHTML = html;
}

// ----------------- RENDER YEARLY STANDINGS -----------------
function filterYear(year) {
    selectedYear = year;
    document.querySelectorAll('.filter-btn').forEach(btn => {
        if (btn.textContent == year) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });
    renderYearlyTable();
}

function renderYearlyTable() {
    if (!cupData) return;
    
    const table = document.getElementById('main-data-table');
    
    // Yearly data filtering by active year
    let yearlyData = cupData.yearly.filter(p => p.Year === selectedYear);
    
    // Sort logic
    yearlyData.sort((a, b) => {
        let valA = a[yearlySortKey];
        let valB = b[yearlySortKey];
        
        // Handle custom numerical sorting for Place column (e.g. "T2" ➔ 2, "10" ➔ 10)
        if (yearlySortKey === 'Place') {
            const numA = parsePlace(valA);
            const numB = parsePlace(valB);
            return yearlySortAscending ? numA - numB : numB - numA;
        }
        
        if (valA === null || valA === undefined) return yearlySortAscending ? -1 : 1;
        if (valB === null || valB === undefined) return yearlySortAscending ? 1 : -1;
        
        if (typeof valA === 'string') {
            return yearlySortAscending ? valA.localeCompare(valB) : valB.localeCompare(valA);
        } else {
            return yearlySortAscending ? valA - valB : valB - valA;
        }
    });
    
    // Apply search filter
    const filtered = yearlyData.filter(p => 
        p.Name.toLowerCase().includes(searchQuery.toLowerCase())
    );
    
    let html = `
        <thead>
            <tr>
                <th style="width: 52px; cursor: pointer;" onclick="setYearlySort('Place')" title="Overall placement rank.">Place ${getSortIndicator('Place', yearlySortKey, yearlySortAscending)}</th>
                <th style="cursor: pointer; min-width: 120px;" onclick="setYearlySort('Name')" title="Competitor Name.">Player ${getSortIndicator('Name', yearlySortKey, yearlySortAscending)}</th>
                <th style="text-align: right; cursor: pointer; white-space: nowrap;" onclick="setYearlySort('Cup Points')" title="Top-4 tournament Cup Points.">Pts (Top 4) ${getSortIndicator('Cup Points', yearlySortKey, yearlySortAscending)}</th>
                <th style="text-align: right; cursor: pointer; white-space: nowrap;" onclick="setYearlySort('Average Score')" title="Average points per tournament.">Avg ${getSortIndicator('Average Score', yearlySortKey, yearlySortAscending)}</th>
                <th style="text-align: right; cursor: pointer; white-space: nowrap;" onclick="setYearlySort('Tournaments Entered')" title="Total tournaments played.">Entries ${getSortIndicator('Tournaments Entered', yearlySortKey, yearlySortAscending)}</th>
                <th style="text-align: right; cursor: pointer; white-space: nowrap;" onclick="setYearlySort('Total Score')" title="Total uncapped score.">Total ${getSortIndicator('Total Score', yearlySortKey, yearlySortAscending)}</th>
            </tr>
        </thead>
        <tbody>
    `;
    
    if (filtered.length === 0) {
        html += `<tr><td colspan="6" style="text-align: center; color: var(--text-secondary); padding: 2rem;">No players found matching your search.</td></tr>`;
    } else {
        filtered.forEach(p => {
            const place = p.Place;
            const parsedNum = parsePlace(place);
            
            let badgeClass = 'rank-other';
            if (parsedNum === 1) badgeClass = 'rank-1';
            else if (parsedNum === 2) badgeClass = 'rank-2';
            else if (parsedNum === 3) badgeClass = 'rank-3';
            
            html += `
                <tr>
                    <td style="text-align: center;"><span class="rank-badge ${badgeClass}">${place}</span></td>
                    <td style="font-weight: 600; color: var(--text-primary);" onclick="showPlayerCard('${p.Name}')">${p.Name}</td>
                    <td style="text-align: right; font-weight: 700; color: var(--accent-gold);">${p['Cup Points'].toFixed(1)}</td>
                    <td style="text-align: right;">${p['Tournaments Entered']}</td>
                    <td style="text-align: right;">${p['Total Score'].toFixed(1)}</td>
                    <td style="text-align: right; color: var(--accent-cyan); font-weight: 600;">${p['Average Score'].toFixed(1)}</td>
                </tr>
            `;
        });
    }
    
    html += `</tbody>`;
    table.innerHTML = html;
}

// ----------------- RENDER TOURNAMENTS STANDINGS -----------------
let tournamentSortKey = 'Average Score';
let tournamentSortAscending = false;
let selectedHistoricalYear = 'All';

function filterTournament(tourney) {
    selectedTournament = tourney;
    selectedHistoricalYear = 'All';
    renderTournamentTable();
}

function filterTournamentYear(year) {
    selectedHistoricalYear = year;
    renderTournamentTable();
}

function setTournamentSort(key) {
    if (tournamentSortKey === key) {
        tournamentSortAscending = !tournamentSortAscending;
    } else {
        tournamentSortKey = key;
        tournamentSortAscending = (key === 'Name');
    }
    renderTournamentTable();
}

function renderTournamentTable() {
    if (!cupData) return;
    
    const table = document.getElementById('main-data-table');
    
    const allTourneyData = cupData.granular.filter(g => g.Tournament === selectedTournament);
    const availableYears = [...new Set(allTourneyData.map(g => g.Year))].sort((a, b) => b - a);
    
    const tourneyData = selectedHistoricalYear === 'All' ? allTourneyData : allTourneyData.filter(g => g.Year === selectedHistoricalYear);
    
    const playerStats = {};
    tourneyData.forEach(g => {
        const name = g['Player Name'];
        if (!playerStats[name]) {
            playerStats[name] = { Name: name, totalPoints: 0, entries: 0, gold: 0, silver: 0, bronze: 0 };
        }
        playerStats[name].totalPoints += g['PC Points'];
        playerStats[name].entries += 1;
        
        const parsedPlace = parsePlace(g.Place);
        if (parsedPlace === 1) playerStats[name].gold += 1;
        else if (parsedPlace === 2) playerStats[name].silver += 1;
        else if (parsedPlace === 3) playerStats[name].bronze += 1;
    });
    
    let aggregatedData = Object.values(playerStats).map(p => ({
        Name: p.Name,
        'Entries': p.entries,
        'Total Points': p.totalPoints,
        'Average Score': p.totalPoints / p.entries,
        'Gold': p.gold,
        'Silver': p.silver,
        'Bronze': p.bronze
    }));
    
    aggregatedData.sort((a, b) => {
        let valA = a[tournamentSortKey];
        let valB = b[tournamentSortKey];
        
        if (valA === null || valA === undefined) return tournamentSortAscending ? -1 : 1;
        if (valB === null || valB === undefined) return tournamentSortAscending ? 1 : -1;
        
        if (typeof valA === 'string') {
            return tournamentSortAscending ? valA.localeCompare(valB) : valB.localeCompare(valA);
        } else {
            return tournamentSortAscending ? valA - valB : valB - valA;
        }
    });
    
    const filtered = aggregatedData.filter(p => 
        p.Name.toLowerCase().includes(searchQuery.toLowerCase())
    );
    
    const highlightsContainer = document.getElementById('tournament-highlights-container');
    if (highlightsContainer) {
        let lastWinner = 'N/A';
        let latestYear = 0;
        if (allTourneyData.length > 0) {
            latestYear = Math.max(...allTourneyData.map(g => g.Year));
            const winners = allTourneyData.filter(g => g.Year === latestYear && parsePlace(g.Place) === 1).map(g => g['Player Name']);
            if (winners.length > 0) {
                lastWinner = winners.join(' & ');
            }
        }
        
        let favorite = 'N/A';
        const overallPlayerStats = {};
        allTourneyData.forEach(g => {
            const name = g['Player Name'];
            if (!overallPlayerStats[name]) {
                overallPlayerStats[name] = { Name: name, totalPoints: 0, entries: 0, gold: 0 };
            }
            overallPlayerStats[name].totalPoints += g['PC Points'];
            overallPlayerStats[name].entries += 1;
            if (parsePlace(g.Place) === 1) overallPlayerStats[name].gold += 1;
        });
        
        const overallAggregated = Object.values(overallPlayerStats).map(p => ({
            Name: p.Name,
            'Average Score': p.totalPoints / p.entries,
            'Gold': p.gold,
            'Entries': p.entries
        }));

        if (overallAggregated.length > 0) {
            const predictionCandidates = overallAggregated.map(p => {
                let score = p['Average Score'] + (p.Gold * 5) + (p.Entries * 2) + (Math.random() * 15);
                return { Name: p.Name, score: score };
            });
            predictionCandidates.sort((a,b) => b.score - a.score);
            favorite = predictionCandidates[0].Name;
        }
        
        let historicalLinksHTML = availableYears.map(year => {
            if (year === selectedHistoricalYear) {
                return `<span style="color: var(--text-primary); font-weight: 700;">${year}</span>`;
            } else {
                return `<span style="color: var(--accent-cyan); font-weight: 600; cursor: pointer; text-decoration: underline;" onclick="filterTournamentYear(${year})">${year}</span>`;
            }
        }).join(', ');
        
        let allLink = selectedHistoricalYear === 'All' ? `<span style="color: var(--text-primary); font-weight: 700;">All-Time</span>` : `<span style="color: var(--accent-cyan); font-weight: 600; cursor: pointer; text-decoration: underline;" onclick="filterTournamentYear('All')">All-Time</span>`;
        
        let historyRow = availableYears.length > 0 ? `
            <div style="display: flex; align-items: center; gap: 1rem; font-size: 1.1rem;">
                <span style="color: var(--text-secondary); font-weight: 600; width: 140px;">Historical Stats:</span>
                <span style="font-size: 1rem;">${allLink}, ${historicalLinksHTML}</span>
            </div>
        ` : '';

        highlightsContainer.innerHTML = `
            <div style="display: flex; flex-direction: column; gap: 0.75rem; padding-top: 1rem;">
                <div style="display: flex; align-items: center; gap: 1rem; font-size: 1.1rem;">
                    <span style="color: var(--text-secondary); font-weight: 600; width: 140px;">${latestYear > 0 ? latestYear : 'Past'} Winner:</span>
                    <span style="color: var(--accent-gold); font-weight: 800; font-family: 'Outfit', sans-serif; font-size: 1.25rem;">🏆 ${lastWinner}</span>
                </div>
                <div style="display: flex; align-items: center; gap: 1rem; font-size: 1.1rem;">
                    <span style="color: var(--text-secondary); font-weight: 600; width: 140px;">2026 Favorite:</span>
                    <span style="color: var(--accent-cyan); font-weight: 800; font-family: 'Outfit', sans-serif; font-size: 1.25rem;">🔮 ${favorite}</span>
                </div>
                ${historyRow}
            </div>
        `;
    }
    
    let html = `
        <thead>
            <tr>
                <th style="width: 52px;">Rank</th>
                <th style="cursor: pointer; min-width: 120px;" onclick="setTournamentSort('Name')">Player ${getSortIndicator('Name', tournamentSortKey, tournamentSortAscending)}</th>
                <th style="text-align: right; cursor: pointer; white-space: nowrap;" onclick="setTournamentSort('Average Score')">Avg Pts ${getSortIndicator('Average Score', tournamentSortKey, tournamentSortAscending)}</th>
                <th style="text-align: right; cursor: pointer; white-space: nowrap;" onclick="setTournamentSort('Total Points')">Total ${getSortIndicator('Total Points', tournamentSortKey, tournamentSortAscending)}</th>
                <th style="text-align: right; cursor: pointer;" onclick="setTournamentSort('Entries')">Entries ${getSortIndicator('Entries', tournamentSortKey, tournamentSortAscending)}</th>
                <th style="text-align: center; cursor: pointer;" onclick="setTournamentSort('Gold')">🥇 ${getSortIndicator('Gold', tournamentSortKey, tournamentSortAscending)}</th>
                <th style="text-align: center; cursor: pointer;" onclick="setTournamentSort('Silver')">🥈 ${getSortIndicator('Silver', tournamentSortKey, tournamentSortAscending)}</th>
                <th style="text-align: center; cursor: pointer;" onclick="setTournamentSort('Bronze')">🥉 ${getSortIndicator('Bronze', tournamentSortKey, tournamentSortAscending)}</th>
            </tr>
        </thead>
        <tbody>
    `;
    
    if (filtered.length === 0) {
        html += `<tr><td colspan="8" style="text-align: center; color: var(--text-secondary); padding: 2rem;">No entries found for this tournament.</td></tr>`;
    } else {
        filtered.forEach((p, idx) => {
            let rankDisplay = '';
            let badgeClass = 'rank-other';
            
            if (selectedHistoricalYear !== 'All') {
                const playerEntry = tourneyData.find(g => g['Player Name'] === p.Name);
                if (playerEntry) {
                    const placeNum = parsePlace(playerEntry.Place);
                    const count = tourneyData.filter(g => parsePlace(g.Place) === placeNum).length;
                    rankDisplay = count > 1 ? `T${placeNum}` : `${placeNum}`;
                    badgeClass = placeNum === 1 ? 'rank-1' : placeNum === 2 ? 'rank-2' : placeNum === 3 ? 'rank-3' : 'rank-other';
                } else {
                    rankDisplay = '-';
                }
            } else {
                const originalRank = aggregatedData.findIndex(x => x.Name === p.Name) + 1;
                rankDisplay = originalRank;
                badgeClass = originalRank === 1 ? 'rank-1' : originalRank === 2 ? 'rank-2' : originalRank === 3 ? 'rank-3' : 'rank-other';
            }
            
            const goldDisplay = p.Gold > 0 ? `<span class="medal-icon gold" onclick="showMedalDetails('${p.Name.replace(/'/g, "\\'")}', '${selectedTournament}', 1)">🥇 ${p.Gold}</span>` : '-';
            const silverDisplay = p.Silver > 0 ? `<span class="medal-icon silver" onclick="showMedalDetails('${p.Name.replace(/'/g, "\\'")}', '${selectedTournament}', 2)">🥈 ${p.Silver}</span>` : '-';
            const bronzeDisplay = p.Bronze > 0 ? `<span class="medal-icon bronze" onclick="showMedalDetails('${p.Name.replace(/'/g, "\\'")}', '${selectedTournament}', 3)">🥉 ${p.Bronze}</span>` : '-';
            
            html += `
                <tr>
                    <td style="text-align: center;"><span class="rank-badge ${badgeClass}">${rankDisplay}</span></td>
                    <td style="font-weight: 600; color: var(--text-primary);" onclick="showPlayerCard('${p.Name}')">${p.Name}</td>
                    <td style="text-align: right; color: var(--accent-cyan); font-weight: 700;">${p['Average Score'].toFixed(1)}</td>
                    <td style="text-align: right; color: var(--text-primary); font-weight: 600;">${p['Total Points'].toFixed(1)}</td>
                    <td style="text-align: right;">${p['Entries']}</td>
                    <td style="text-align: center; font-weight: 700;">${goldDisplay}</td>
                    <td style="text-align: center; font-weight: 700;">${silverDisplay}</td>
                    <td style="text-align: center; font-weight: 700;">${bronzeDisplay}</td>
                </tr>
            `;
        });
    }
    
    html += `</tbody>`;
    table.innerHTML = html;
}

// ----------------- RENDER VEGAS ODDS BOARD -----------------
function renderOddsTable() {
    if (!cupData) return;
    
    const table = document.getElementById('main-data-table');
    
    let html = `
        <thead>
            <tr>
                <th style="width: 52px;">Rank</th>
                <th style="min-width: 120px;">Player</th>
                <th style="white-space: nowrap;">Win %</th>
                <th style="text-align: right; white-space: nowrap;">Odds</th>
                <th class="desktop-only">Scouting Report</th>
            </tr>
        </thead>
        <tbody>
    `;
    
    const filtered = cupData.odds.filter(o => 
        o.Player.toLowerCase().includes(searchQuery.toLowerCase())
    );
    
    if (filtered.length === 0) {
        html += `<tr><td colspan="5" style="text-align: center; color: var(--text-secondary); padding: 2rem;">No odds profiles found.</td></tr>`;
    } else {
        filtered.forEach((o, idx) => {
            const rank = idx + 1;
            const badgeClass = rank === 1 ? 'rank-1' : rank === 2 ? 'rank-2' : rank === 3 ? 'rank-3' : 'rank-other';
            
            let report = "Defends well across card and lawn games. High ceiling.";
            if (o.Player === "Kevin Horner") report = "🥇 Beanbag sniper. Highly dangerous when short-game accuracy counts.";
            else if (o.Player === "Adam Murphy") report = "🚀 The Volume King. Unbeatable in Pickleball (20.0 avg). Heavy schedule.";
            else if (o.Player === "Ben Aeshliman") report = "🏆 Defending champion. Defends boards with huge consistent volume.";
            else if (o.Player === "Patrick Irwin") report = "🎯 Sleeper threat. Shows massive variance, capable of high sweeps.";
            else if (o.Player === "Patty Murphy") report = "♠️ Card expert. Elite placement in Euchre and Texas Hold Em.";
            else if (o.Player === "Jason Lindseth") report = "🎯 Pound-for-pound efficiency master. Averages a lethal 11.6 pts/entry.";
            
            html += `
                <tr>
                    <td style="text-align: center;"><span class="rank-badge ${badgeClass}">${rank}</span></td>
                    <td style="font-weight: 600; color: var(--text-primary);" onclick="showPlayerCard('${o.Player}')">${o.Player}</td>
                    <td>
                        <div class="odds-info">
                            <span class="odds-value">${o.Prob.toFixed(1)}%</span>
                        </div>
                        <div class="progress-bar-bg">
                            <div class="progress-bar-fill" style="width: ${o.Prob * 4}%;"></div>
                        </div>
                    </td>
                    <td style="text-align: right; font-weight: 700; color: var(--accent-magenta); font-size: 1.1rem;">${o.OddsStr}</td>
                    <td style="font-size: 0.85rem; color: var(--text-secondary); font-style: italic;">${report}</td>
                </tr>
            `;
        });
    }
    
    html += `</tbody>`;
    table.innerHTML = html;
}

// ----------------- RENDER BUBBLE WATCH WIDGET -----------------
function renderBubbleTable() {
    if (!cupData) return;
    
    const table = document.getElementById('main-data-table');
    
    let html = `
        <tbody>
            <tr>
                <td style="text-align: center; padding: 4rem 2rem; border-bottom: none;">
                    <div style="font-size: 3rem; margin-bottom: 1rem;">🎈</div>
                    <h3 style="font-size: 1.5rem; color: var(--text-primary); margin-bottom: 0.5rem; font-family: 'Outfit', sans-serif;">Bubble Watch is Inactive</h3>
                    <p style="color: var(--text-secondary); font-size: 1.1rem; max-width: 500px; margin: 0 auto; line-height: 1.5;">
                        The 2025 Paynesville Cup has officially concluded! There are no active bubble watches. 
                        <br><br>
                        Check back when the <strong>2026</strong> tournaments begin to see live Top-4 standing stabilization trackers.
                    </p>
                </td>
            </tr>
        </tbody>
    `;
    table.innerHTML = html;
}

// ----------------- RENDER COUSIN RIVALRY COMPARISON -----------------
function renderRivalryComparison() {
    if (!cupData) return;
    
    const container = document.getElementById('leaderboard-table-container');
    const names = cupData.lifetime.map(p => p.PlayerName);
    
    let optionsA = '';
    let optionsB = '';
    
    names.forEach(name => {
        const selA = name === rivalryPlayerA ? 'selected' : '';
        const selB = name === rivalryPlayerB ? 'selected' : '';
        optionsA += `<option value="${name}" ${selA}>${name}</option>`;
        optionsB += `<option value="${name}" ${selB}>${name}</option>`;
    });
    
    const p1 = cupData.lifetime.find(p => p.PlayerName === rivalryPlayerA);
    const p2 = cupData.lifetime.find(p => p.PlayerName === rivalryPlayerB);
    
    if (!p1 || !p2) return;
    
    let p1Wins = 0;
    let p2Wins = 0;
    let ties = 0;
    
    const p1Gran = cupData.granular.filter(g => g['Player Name'] === rivalryPlayerA);
    const p2Gran = cupData.granular.filter(g => g['Player Name'] === rivalryPlayerB);
    
    p1Gran.forEach(g1 => {
        const g2 = p2Gran.find(g => g.Tournament === g1.Tournament && g.Year === g1.Year);
        if (g2) {
            if (g1['PC Points'] > g2['PC Points']) {
                p1Wins++;
            } else if (g2['PC Points'] > g1['PC Points']) {
                p2Wins++;
            } else {
                ties++;
            }
        }
    });
    
    let recordsHtml = '';
    if (p1Gran.length === 0 || p2Gran.length === 0) {
        recordsHtml = `<p style="text-align: center; color: var(--text-secondary);">No mutual events recorded.</p>`;
    } else {
        const mutuals = [];
        p1Gran.forEach(g1 => {
            const match = p2Gran.find(g2 => g2.Tournament === g1.Tournament && g2.Year === g1.Year);
            if (match) {
                mutuals.push({
                    year: g1.Year,
                    tourney: g1.Tournament,
                    scoreA: g1['PC Points'],
                    scoreB: match['PC Points']
                });
            }
        });
        
        if (mutuals.length === 0) {
            recordsHtml = `<p style="text-align: center; color: var(--text-secondary); padding: 1rem;">No head-to-head matches found.</p>`;
        } else {
            mutuals.sort((a,b) => b.year - a.year || a.tourney.localeCompare(b.tourney));
            mutuals.forEach(m => {
                let winnerText = 'Tie';
                if (m.scoreA > m.scoreB) {
                    winnerText = `${rivalryPlayerA} Wins`;
                } else if (m.scoreB > m.scoreA) {
                    winnerText = `${rivalryPlayerB} Wins`;
                }
                
                recordsHtml += `
                    <div class="rivalry-record-item">
                        <span>📅 <strong>${m.year}</strong> — ${m.tourney}</span>
                        <span>${m.scoreA.toFixed(1)} vs ${m.scoreB.toFixed(1)}</span>
                        <span class="rivalry-winner">${winnerText}</span>
                    </div>
                `;
            });
        }
    }
    
    const highlightA = p1.LifetimeCupPoints > p2.LifetimeCupPoints ? 'val-highlight' : '';
    const highlightB = p2.LifetimeCupPoints > p1.LifetimeCupPoints ? 'val-highlight' : '';
    
    const countA = p1.TotalTournamentsEntered > p2.TotalTournamentsEntered ? 'val-highlight' : '';
    const countB = p2.TotalTournamentsEntered > p1.TotalTournamentsEntered ? 'val-highlight' : '';
    
    const efficiencyA = p1.AverageCupScore > p2.AverageCupScore ? 'val-highlight' : '';
    const efficiencyB = p2.AverageCupScore > p1.AverageCupScore ? 'val-highlight' : '';
    
    const avgTourneyA = p1.TotalTournamentsEntered > 0 ? (p1.LifetimeCupPoints / p1.TotalTournamentsEntered) : 0;
    const avgTourneyB = p2.TotalTournamentsEntered > 0 ? (p2.LifetimeCupPoints / p2.TotalTournamentsEntered) : 0;
    
    const tourneyEffA = avgTourneyA > avgTourneyB ? 'val-highlight' : '';
    const tourneyEffB = avgTourneyB > avgTourneyA ? 'val-highlight' : '';
    
    container.innerHTML = `
        <div class="rivalry-container">
            <div class="rivalry-selectors">
                <select class="dropdown-select" id="select-rival-a" onchange="handleRivalChange('A', this.value)">
                    ${optionsA}
                </select>
                <span class="rivalry-vs">VS</span>
                <select class="dropdown-select" id="select-rival-b" onchange="handleRivalChange('B', this.value)">
                    ${optionsB}
                </select>
            </div>
            
            <div class="rivalry-stats-grid">
                <div class="rivalry-player-val ${highlightA}">${p1.LifetimeCupPoints.toFixed(1)}</div>
                <div class="rivalry-row-metric" title="Lifetime Cup points.">🏆 Lifetime Points</div>
                <div class="rivalry-player-val ${highlightB}">${p2.LifetimeCupPoints.toFixed(1)}</div>
                
                <div class="rivalry-player-val ${countA}">${p1.TotalTournamentsEntered}</div>
                <div class="rivalry-row-metric" title="Total Tournaments Entered.">⛳ Total Tourneys</div>
                <div class="rivalry-player-val ${countB}">${p2.TotalTournamentsEntered}</div>
                
                <div class="rivalry-player-val ${efficiencyA}">${p1.AverageCupScore.toFixed(1)}</div>
                <div class="rivalry-row-metric" title="Average Cup Score per year.">⚡ Avg Cup Score</div>
                <div class="rivalry-player-val ${efficiencyB}">${p2.AverageCupScore.toFixed(1)}</div>
                
                <div class="rivalry-player-val ${tourneyEffA}">${avgTourneyA.toFixed(1)}</div>
                <div class="rivalry-row-metric" title="Average points earned per tournament entered.">🎯 Avg Tourney Score</div>
                <div class="rivalry-player-val ${tourneyEffB}">${avgTourneyB.toFixed(1)}</div>
                
                <div class="rivalry-player-val val-highlight" style="color: var(--accent-magenta);">${p1Wins}</div>
                <div class="rivalry-row-metric" title="Number of head-to-head matchup wins in matching years and tournaments.">🥊 Head-to-Head Wins</div>
                <div class="rivalry-player-val val-highlight" style="color: var(--accent-magenta);">${p2Wins}</div>
            </div>
            
            <div class="rivalry-records-list">
                <h3 style="font-family: 'Outfit', sans-serif; font-size: 1.25rem; font-weight: 600; margin-bottom: 0.5rem;">📜 Historical Matchups Summary</h3>
                ${recordsHtml}
            </div>
        </div>
    `;
}

// Handle rivalry dropdown modifications
function handleRivalChange(target, value) {
    if (target === 'A') {
        rivalryPlayerA = value;
    } else {
        rivalryPlayerB = value;
    }
    renderRivalryComparison();
    generateFacebookRecap();
}

// ----------------- SEARCH & FILTER LOGIC -----------------
function handleSearch() {
    const input = document.getElementById('search-input');
    searchQuery = input.value;
    
    if (currentTab === 'lifetime') {
        renderLifetimeTable();
    } else if (currentTab === 'yearly') {
        renderYearlyTable();
    } else if (currentTab === 'tournaments') {
        renderTournamentTable();
    } else if (currentTab === 'odds') {
        renderOddsTable();
    } else if (currentTab === 'bubble') {
        renderBubbleTable();
    }
}

// ----------------- FACEBOOK STATUS GENERATOR -----------------
function generateFacebookRecap() {
    if (!cupData) return;
    
    const quotes = [
        "Adam Murphy is still leading the pack with Pickleball dominance! Max Murphy has a NEGATIVE Cribbage average. Yes, negative! Maximum effort, right?",
        "Standings are heating up! Defending champ Ben Aeshliman has a 10.3% repeat chance, but Kevin Horner is leading the simulation board at 15.0%! Zach Leahy currently holds a beautiful ZERO average in Euchre. Truly an artist.",
        "Rivalry Watch! We simulated Adam Murphy vs. Zach Leahy. Adam holds a brutal 3-0 record on the Bocce courts, but Zach holds a 25.0 perfect score in Golf Cards! Tragic.",
        "Recap Alert! Jason Lindseth remains the pound-for-pound efficiency king at 11.6 pts/entry. Donna Weineke's 18.5 points in 2024 have officially been restored. Boom! Standings updated."
    ];
    
    const randomQuote = quotes[Math.floor(Math.random() * quotes.length)];
    
    const text = `📢 PAYNESVILLE CUP LIVE STANDINGS UPDATE! 

${randomQuote}

Follow along with the live stands, bubble watch calculators, and cousin rivalries on our Paynesville Cup dashboard!
🔗 http://paynesvillecup.com`;
    
    document.getElementById('fb-recap-text').value = text;
}

// Copy facebook recaps to clipboard
function copyRecapToClipboard() {
    const textarea = document.getElementById('fb-recap-text');
    textarea.select();
    textarea.setSelectionRange(0, 99999);
    
    navigator.clipboard.writeText(textarea.value).then(() => {
        const btn = document.getElementById('btn-copy-fb');
        const origText = btn.textContent;
        btn.textContent = "✅ Copied to Clipboard!";
        btn.classList.add('copy-success');
        
        setTimeout(() => {
            btn.textContent = origText;
            btn.classList.remove('copy-success');
        }, 2000);
    }).catch(err => {
        console.error("Clipboard copy failed: ", err);
    });
}

// ----------------- PLAYER CARD SPORTS MODAL -----------------

// Custom Nicknames
const CUSTOM_NICKNAMES = {
    "Adam Murphy": "The Pickleball Phenom (The Roster King)",
    "Patty Murphy": "The Lawn Bowls Maestro (2024 Champ)",
    "Kevin Horner": "The Bag-Sliding Wizard (2023 Champ)",
    "Ben Aeshliman": "The Defending Titan (2025 Champ)",
    "Shane Fitzpatrick": "The Cribbage Shark",
    "Bridget Leahy": "The Texas Hold 'Em Queen",
    "John Murphy": "The Fairway General",
    "Max Murphy": "The Links Master",
    "Ryan Fitzpatrick": "The Bocce Boss (Mr. Perfect)",
    "Kelly Lindseth": "The Bocce Anchor",
    "Cindy Irwin": "The Golfing Matriarch",
    "Mackenzie Leahy": "The Turf Royalty",
    "Brian Horner": "The Founding Father (2022 Champ)",
    "Timmy Leahy": "The Link-Slayer (Scratch Golfer)",
    "Robbie Murphy": "The Greens Keeper",
    "Heather Fitzpatrick": "The Bocce Ace",
    "Will Modrow": "The Card Dealer",
    "Zach Leahy": "The Net Sentinel",
    "Shawn Murphy": "The Bocce Baron",
    "Kate Breviu": "The Spike Queen",
    "Jason Lindseth": "The Pound-for-Pound Sniper",
    "Seyha Saumweber": "The Boardroom Tactician",
    "Zack Schirmers": "The Court Whist Wizard",
    "Larry Aeshliman": "The Trick-Taking Guru",
    "Nora Modrow": "The Lawn Bowler Jr.",
    "Dave (Sr.) Modrow": "The Kubb Demolisher",
    "David Modrow": "The Silver Bullet",
    "Samantha Pettit": "The Block-Throwing Legend",
    "Michelle Pettit": "The Cribbage Countess",
    "Daniel Horner": "The Euchre Baron"
};

// Custom Scouting Bios
const CUSTOM_BIOS = {
    "Adam Murphy": "The undisputed Roster King of the Paynesville Cup. Adam is a high-volume workhorse who dominates Pickleball with a legendary 20.0 points average. Holds absolute control of the Bocce courts but remains mathematically suspect at the Cribbage card table.",
    "Zach Leahy": "A tactical master of the net and the greens keeper of the family circle. Zach has some of the cleanest court positioning in modern tournaments. Excels in high-stakes Golf Cards and represents a massive simulated threat for 2026.",
    "Ben Aeshliman": "The reigning 2025 Paynesville Cup Champion. Ben defended the homeland with stellar point volume and unmatched consistency. A calm, calculated board game general who thrives under high pressure.",
    "Kevin Horner": "The 2023 Cup Champion and a legendary beanbag-sliding wizard. Kevin's short-game accuracy is feared across all divisions. He remains a top contender in simulated odds due to his lethal consistency in lawn events.",
    "Brian Horner": "The Founding Father and the inaugural 2022 Cup Champion. Brian's strategic insight set the standard for Paynesville Cup excellence. A legendary board specialist who can sweep any card category.",
    "Patty Murphy": "The 2024 Cup Champion and a true lawn bowls maestro. Patty excels under the pressure of tight court angles and holds a legendary tournament IQ. Elite card placements make her a threat in any format.",
    "Max Murphy": "A links legend and general sports enthusiast. Max has a highly active schedule and a beautiful average in golf tournaments. Famously struggles with positive cribbage math but makes up for it in pure driving distance.",
    "Shane Fitzpatrick": "The ultimate Cribbage Shark. Shane is a calculating math prodigy who knows the cards inside and out. Famously dangerous in any trick-taking card format.",
    "Bridget Leahy": "The undisputed Texas Hold 'Em Queen. Bridget is a fearless card general with a legendary poker face. A high-variance threat who can sweep the entire leaderboard on any given Saturday.",
    "Jason Lindseth": "The pound-for-pound efficiency sniper. Jason averages a lethal 11.6 points per entry. He plays fewer tournaments but ranks as the most mathematically dangerous competitor per start in Cup history.",
    "Timmy Leahy": "The scratch golfer and fairway specialist. Timmy handles the 3-Club Challenge with complete ease. Highly lethal in lawn events, but can occasionally be coaxed into high-card-table disasters."
};

// List of the 15 official Paynesville Cup tournaments in order
const MAIN_TOURNAMENTS = [
    "3-CLUB CHALLENGE",
    "BACKGAMMON",
    "BEANBAG",
    "BOCCE",
    "BOCCE2",
    "BUCKET GOLF",
    "COURT WHIST",
    "CRIBBAGE",
    "EUCHRE",
    "GOLF",
    "GOLF CARDS",
    "KUBB",
    "PICKLEBALL",
    "TEXAS HOLD EM",
    "VOLLEYBALL"
];

// Helper to calculate scouting bio, gold mine, and kryptonite details
function getPlayerScoutingDetails(name, p) {
    // Determine Nickname
    let nickname = CUSTOM_NICKNAMES[name];
    if (!nickname) {
        // Generate nickname dynamically
        const parts = name.split(" ");
        const lastName = parts[parts.length - 1] || "Warrior";
        // Get their top event
        const playerGranular = cupData.granular.filter(g => g['Player Name'] === name);
        const tCount = {};
        playerGranular.forEach(g => {
            tCount[g.Tournament] = (tCount[g.Tournament] || 0) + g['PC Points'];
        });
        let topEvent = "Family";
        let maxPts = -Infinity;
        for (const [t, pts] of Object.entries(tCount)) {
            if (pts > maxPts) {
                maxPts = pts;
                topEvent = t;
            }
        }
        
        // titlecase topEvent
        topEvent = topEvent.split(" ").map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(" ");
        
        if (["Murphy", "Horner", "Leahy", "Lindseth", "Modrow", "Fitzpatrick"].includes(lastName)) {
            nickname = `The ${lastName} ${topEvent} Legend`;
        } else {
            nickname = `The ${topEvent} Specialist`;
        }
    }
    
    // Determine Scouting Bio
    let bio = CUSTOM_BIOS[name];
    if (!bio) {
        if (p.YearsCompeted >= 3) {
            if (p.AverageCupScore >= 12) {
                bio = `A veteran elite performer. Averages a stellar ${p.AverageCupScore.toFixed(1)} points per year and is feared in multiple tournament classifications.`;
            } else {
                bio = `A dedicated Paynesville Cup veteran. With ${p.YearsCompeted} active campaigns under their belt, their deep experience makes them a highly respected threat.`;
            }
        } else if (p.TotalTournamentsEntered >= 8) {
            bio = `A true tournament workhorse. Possesses a deep resume of ${p.TotalTournamentsEntered} entries, showing great endurance across both card tables and lawn bowls.`;
        } else if (p.TotalTournamentsEntered <= 2) {
            bio = `A rising star and surgical guest competitor. With a small sample size of just ${p.TotalTournamentsEntered} entry, they remain an unpredictable wildcard in future standings.`;
        } else {
            bio = `A competitive generalist who plays with high passion. Capable of sudden sweeps in their preferred events and a fan favorite in the standings.`;
        }
    }
    
    // Group granular results to find Gold Mine & Kryptonite
    const playerGranular = cupData.granular.filter(g => g['Player Name'] === name);
    
    const tournamentStats = {};
    playerGranular.forEach(g => {
        const t = g.Tournament;
        const pts = g['PC Points'];
        if (!tournamentStats[t]) {
            tournamentStats[t] = { totalPoints: 0, count: 0 };
        }
        tournamentStats[t].totalPoints += pts;
        tournamentStats[t].count += 1;
    });
    
    const tList = [];
    for (const [tName, s] of Object.entries(tournamentStats)) {
        tList.push({
            name: tName.split(" ").map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(" "),
            avg: s.totalPoints / s.count,
            count: s.count
        });
    }
    
    let goldMine = { name: "None", details: "No active entries found." };
    let kryptonite = { name: "None", label: "Kryptonite", icon: "💀", details: "No active entries found.", style: "" };
    
    if (tList.length > 0) {
        // Preferred filter: >= 2 entries to find patterns
        const stableList = tList.filter(t => t.count >= 2);
        
        // Gold Mine (Strengths)
        let goldSource = stableList.length > 0 ? stableList : tList;
        goldSource.sort((a, b) => b.avg - a.avg);
        const best = goldSource[0];
        goldMine = {
            name: best.name,
            details: `Averages a lethal ${best.avg.toFixed(1)} points over ${best.count} entries.`
        };
        
        // Kryptonite (Weaknesses)
        let kryptSource = stableList.length > 0 ? stableList : tList;
        kryptSource.sort((a, b) => a.avg - b.avg);
        const worst = kryptSource[0];
        
        if (worst.count === 1) {
            kryptonite = {
                name: worst.name,
                label: "Event Specialty",
                icon: "⚠️",
                details: `Small Sample Size (1 Entry: scored ${worst.avg.toFixed(1)} pts). Too early to analyze patterns!`,
                style: "color: var(--text-secondary); opacity: 0.8; font-style: italic;"
            };
        } else {
            kryptonite = {
                name: worst.name,
                label: "Kryptonite",
                icon: "💀",
                details: `Averages ${worst.avg.toFixed(1)} points over ${worst.count} entries. Target area for coaching.`,
                style: ""
            };
        }
    }
    
    return { nickname, bio, goldMine, kryptonite };
}

// Generate HTML string for Scouting Report Tab
function getScoutingContentHtml(bio, goldMine, kryptonite) {
    return `
        <div class="scouting-block">
            <span class="scouting-lbl">Scouting Bio</span>
            <p class="scouting-text">"${bio}"</p>
        </div>
        
        <div class="profile-events" style="margin-top: auto;">
            <div class="profile-event-row">
                <span class="profile-event-icon">🌟</span>
                <div class="profile-event-details">
                    <span class="profile-event-title">Gold Mine: ${goldMine.name}</span>
                    <span class="profile-event-sub">${goldMine.details}</span>
                </div>
            </div>
            <div class="profile-event-row">
                <span class="profile-event-icon">${kryptonite.icon}</span>
                <div class="profile-event-details">
                    <span class="profile-event-title">${kryptonite.label}: ${kryptonite.name}</span>
                    <span class="profile-event-sub" style="${kryptonite.style}">${kryptonite.details}</span>
                </div>
            </div>
        </div>
    `;
}

// Generate HTML string for Tournament Grades Tab
function getGradesContentHtml(name) {
    const playerGranular = cupData.granular.filter(g => g['Player Name'] === name);
    
    let html = `<div class="grades-container">`;
    let tournamentGrades = [];
    
    MAIN_TOURNAMENTS.forEach(tName => {
        const tournamentEntries = playerGranular.filter(g => g.Tournament.toUpperCase() === tName.toUpperCase());
        
        let grade = 'N/A';
        let gradeClass = 'grade-na';
        let subText = 'Never Entered';
        let sortScore = -1;
        
        if (tournamentEntries.length > 0) {
            let totalPts = 0;
            tournamentEntries.forEach(g => {
                totalPts += g['PC Points'];
            });
            const avgPts = totalPts / tournamentEntries.length;
            sortScore = avgPts;
            
            subText = `${avgPts.toFixed(1)} avg (${tournamentEntries.length} ${tournamentEntries.length === 1 ? 'entry' : 'entries'})`;
            
            // Traditional school grading scale mapped to tournament PC point averages
            if (avgPts >= 20.0) { grade = 'A+'; gradeClass = 'grade-a'; }
            else if (avgPts >= 16.0) { grade = 'A'; gradeClass = 'grade-a'; }
            else if (avgPts >= 13.0) { grade = 'A-'; gradeClass = 'grade-a'; }
            else if (avgPts >= 10.5) { grade = 'B+'; gradeClass = 'grade-b'; }
            else if (avgPts >= 8.5) { grade = 'B'; gradeClass = 'grade-b'; }
            else if (avgPts >= 7.0) { grade = 'B-'; gradeClass = 'grade-b'; }
            else if (avgPts >= 5.5) { grade = 'C+'; gradeClass = 'grade-c'; }
            else if (avgPts >= 4.5) { grade = 'C'; gradeClass = 'grade-c'; }
            else if (avgPts >= 3.5) { grade = 'C-'; gradeClass = 'grade-c'; }
            else if (avgPts >= 2.5) { grade = 'D+'; gradeClass = 'grade-d'; }
            else if (avgPts >= 1.5) { grade = 'D'; gradeClass = 'grade-d'; }
            else if (avgPts >= 0.5) { grade = 'D-'; gradeClass = 'grade-d'; }
            else { grade = 'F'; gradeClass = 'grade-f'; }
        }
        
        const prettyName = tName.split(" ").map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(" ");
        
        tournamentGrades.push({
            prettyName,
            subText,
            grade,
            gradeClass,
            sortScore
        });
    });
    
    // Sort descending by sortScore (Average Points)
    tournamentGrades.sort((a, b) => b.sortScore - a.sortScore);
    
    tournamentGrades.forEach(item => {
        html += `
            <div class="grade-row">
                <div>
                    <span class="grade-row-title">${item.prettyName}</span>
                    <span class="grade-row-sub">${item.subText}</span>
                </div>
                <span class="grade-badge ${item.gradeClass}">${item.grade}</span>
            </div>
        `;
    });
    
    html += `</div>`;
    return html;
}

// Generate HTML string for Best Finishes Tab
function getBestFinishesContentHtml(name) {
    const playerYears = cupData.yearly.filter(y => y.Name === name);
    if (playerYears.length === 0) return `<p style="text-align: center; color: var(--text-secondary); margin-top: 2rem;">No yearly data available.</p>`;
    
    playerYears.sort((a,b) => parsePlace(a.Place) - parsePlace(b.Place));
    
    const bestYearRecord = playerYears[0];
    const top3Records = playerYears.filter(y => parsePlace(y.Place) <= 3 && y.Year !== bestYearRecord.Year);
    
    top3Records.sort((a,b) => b.Year - a.Year);
    
    const recordsToShow = [
        { label: "🏆 Best Finish", record: bestYearRecord },
        ...top3Records.map(r => ({ label: "🏅 Top 3 Finish", record: r }))
    ];
    
    let html = `
        <div class="grades-container">
            <p style="text-align: center; color: var(--text-secondary); font-size: 0.9rem; margin-bottom: 1rem; font-style: italic;">
                This is your best OVERALL Paynesville Cup placement
            </p>
    `;
    
    recordsToShow.forEach(item => {
        const placeNum = parsePlace(item.record.Place);
        let badgeClass = placeNum === 1 ? 'rank-1' : placeNum === 2 ? 'rank-2' : placeNum === 3 ? 'rank-3' : 'rank-other';
        
        html += `
            <div class="grade-row" style="flex-direction: column; align-items: flex-start; padding: 1rem; height: auto;">
                <div style="display: flex; justify-content: space-between; align-items: center; width: 100%; margin-bottom: 0.75rem;">
                    <div>
                        <span style="color: var(--accent-gold); font-weight: 700; font-size: 1.1rem; margin-right: 0.5rem;">${item.label}</span>
                        <span style="color: var(--text-secondary); font-weight: 600;">(${item.record.Year})</span>
                    </div>
                    <span class="rank-badge ${badgeClass}" style="position: relative; width: 40px; height: 40px; font-size: 1.2rem;">${item.record.Place}</span>
                </div>
                <div style="display: flex; gap: 1.5rem; color: var(--text-primary); font-size: 0.95rem; width: 100%; border-top: 1px solid var(--border-color); padding-top: 0.75rem;">
                    <div style="display: flex; flex-direction: column;">
                        <span style="color: var(--text-secondary); font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.5px;">Entries</span>
                        <span style="font-weight: 600;">${item.record['Tournaments Entered']}</span>
                    </div>
                    <div style="display: flex; flex-direction: column;">
                        <span style="color: var(--text-secondary); font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.5px;">Cup Pts</span>
                        <span style="font-weight: 600; color: var(--accent-cyan);">${item.record['Cup Points'].toFixed(1)}</span>
                    </div>
                    <div style="display: flex; flex-direction: column;">
                        <span style="color: var(--text-secondary); font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.5px;">Avg Pts</span>
                        <span style="font-weight: 600;">${item.record['Average Score'].toFixed(1)}</span>
                    </div>
                </div>
            </div>
        `;
    });
    
    html += `</div>`;
    return html;
}

// Toggle between player card inner tabs
function switchCardTab(tabName, name) {
    const btnScouting = document.getElementById('card-btn-scouting');
    const btnGrades = document.getElementById('card-btn-grades');
    const btnFinishes = document.getElementById('card-btn-finishes');
    const contentArea = document.getElementById('card-tab-content');
    
    if (!btnScouting || !btnGrades || !contentArea) return;
    
    btnScouting.classList.remove('active');
    btnGrades.classList.remove('active');
    if (btnFinishes) btnFinishes.classList.remove('active');
    
    if (tabName === 'scouting') {
        btnScouting.classList.add('active');
        const p = cupData.lifetime.find(x => x.PlayerName === name);
        if (!p) return;
        const details = getPlayerScoutingDetails(name, p);
        contentArea.innerHTML = getScoutingContentHtml(details.bio, details.goldMine, details.kryptonite);
    } else if (tabName === 'grades') {
        btnGrades.classList.add('active');
        contentArea.innerHTML = getGradesContentHtml(name);
    } else if (tabName === 'finishes') {
        if (btnFinishes) btnFinishes.classList.add('active');
        contentArea.innerHTML = getBestFinishesContentHtml(name);
    }
}

// Main function to display player collectible card modal
function showPlayerCard(name) {
    if (!cupData) return;
    
    // Find player in lifetime standings
    const p = cupData.lifetime.find(x => x.PlayerName === name);
    if (!p) return;
    
    const details = getPlayerScoutingDetails(name, p);
    
    // Champions: Brian Horner, Kevin Horner, Patty Murphy, Ben Aeshliman
    const champions = ["Brian Horner", "Kevin Horner", "Patty Murphy", "Ben Aeshliman"];
    const isChamp = champions.includes(name);
    
    const container = document.getElementById('player-card-container');
    if (isChamp) {
        container.classList.add('gold-border');
    } else {
        container.classList.remove('gold-border');
    }
    
    const inner = document.getElementById('player-card-inner');
    inner.innerHTML = `
        <div class="card-header-block">
            <div class="card-name">${name}</div>
            <div class="card-nickname">${details.nickname}</div>
            ${isChamp ? '<div class="card-badge">🏆 CUP CHAMPION</div>' : ''}
        </div>
        
        <div class="sports-stats-grid">
            <div class="sports-stat-col">
                <span class="sports-stat-lbl">PTS</span>
                <span class="sports-stat-val">${p.LifetimeCupPoints.toFixed(1)}</span>
            </div>
            <div class="sports-stat-col">
                <span class="sports-stat-lbl">ENT</span>
                <span class="sports-stat-val">${p.TotalTournamentsEntered}</span>
            </div>
            <div class="sports-stat-col">
                <span class="sports-stat-lbl">YRS</span>
                <span class="sports-stat-val">${p.YearsCompeted}</span>
            </div>
            <div class="sports-stat-col">
                <span class="sports-stat-lbl">AVG</span>
                <span class="sports-stat-val">${p.AverageCupScore.toFixed(1)}</span>
            </div>
        </div>
        
        <div class="card-action-row" style="flex-wrap: wrap; justify-content: center; gap: 0.5rem;">
            <button class="card-tab-btn active" id="card-btn-scouting" onclick="switchCardTab('scouting', '${name.replace(/'/g, "\\'")}')">📜 Scouting Report</button>
            <button class="card-tab-btn" id="card-btn-grades" onclick="switchCardTab('grades', '${name.replace(/'/g, "\\'")}')">📊 Tournament Grades</button>
            <button class="card-tab-btn" id="card-btn-finishes" onclick="switchCardTab('finishes', '${name.replace(/'/g, "\\'")}')">🏆 Best Finishes</button>
        </div>
        
        <div id="card-tab-content" style="flex-grow: 1; display: flex; flex-direction: column; justify-content: space-between; min-height: 310px;">
            ${getScoutingContentHtml(details.bio, details.goldMine, details.kryptonite)}
        </div>
    `;
    
    const modal = document.getElementById('player-card-modal');
    modal.classList.add('active');
}

function closePlayerCard(event) {
    if (event) {
        event.stopPropagation();
    }
    const modal = document.getElementById('player-card-modal');
    modal.classList.remove('active');
}

// ----------------- MEDAL DETAILS MODAL -----------------
function showMedalDetails(playerName, tournament, placeNum) {
    if (!cupData) return;
    
    // Find years the player won this medal in this tournament
    const playerEntries = cupData.granular.filter(g => 
        g['Player Name'] === playerName && 
        g.Tournament === tournament && 
        parsePlace(g.Place) === placeNum
    );
    
    const yearsWon = playerEntries.map(g => g.Year).sort((a,b) => b - a);
    
    let medalName = placeNum === 1 ? '🥇 Gold' : placeNum === 2 ? '🥈 Silver' : '🥉 Bronze';
    let titleClass = placeNum === 1 ? 'color: var(--accent-gold);' : placeNum === 2 ? 'color: hsl(210, 15%, 80%);' : 'color: hsl(30, 60%, 50%);';
    
    let html = `
        <div class="medal-details-header">
            <div class="medal-details-title">${playerName}</div>
            <div class="medal-details-subtitle" style="${titleClass}">${tournament} — ${medalName}</div>
        </div>
        <div style="overflow-y: auto; max-height: 400px; padding-right: 0.5rem;">
    `;
    
    if (yearsWon.length === 0) {
        html += `<p style="text-align: center; color: var(--text-secondary);">No historical records found for this medal.</p>`;
    } else {
        yearsWon.forEach(year => {
            // Find all OTHER players who got this exact same place in this year and tournament
            const allYearEntries = cupData.granular.filter(g => 
                g.Tournament === tournament && 
                g.Year === year && 
                parsePlace(g.Place) === placeNum
            );
            
            const teammates = allYearEntries
                .filter(g => g['Player Name'] !== playerName)
                .map(g => g['Player Name']);
                
            html += `
                <div class="medal-year-block">
                    <div class="medal-year-title" style="${titleClass}">📅 ${year}</div>
                    <div style="font-size: 0.9rem; color: var(--text-secondary); margin-bottom: 0.5rem;">Teammates / Co-Winners:</div>
                    <div class="teammate-list">
            `;
            
            if (teammates.length === 0) {
                html += `
                    <div class="teammate-item" style="color: var(--text-secondary); font-style: italic;">
                        None (Individual Effort / Solo Winner)
                    </div>
                `;
            } else {
                teammates.forEach(tm => {
                    html += `
                        <div class="teammate-item">
                            <span class="teammate-icon">👤</span> 
                            <span style="font-weight: 600; cursor: pointer; color: var(--text-primary); text-decoration: underline; text-decoration-color: var(--border-color); text-underline-offset: 4px;" onclick="closeMedalDetails(); showPlayerCard('${tm.replace(/'/g, "\\'")}')">${tm}</span>
                        </div>
                    `;
                });
            }
            
            html += `
                    </div>
                </div>
            `;
        });
    }
    
    html += `</div>`;
    
    document.getElementById('medal-details-inner').innerHTML = html;
    document.getElementById('medal-details-modal').classList.add('active');
}

function closeMedalDetails(event) {
    if (event) event.stopPropagation();
    const modal = document.getElementById('medal-details-modal');
    if (modal) modal.classList.remove('active');
}

// Add Escape key handler for modal
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        closePlayerCard();
        closeMedalDetails();
    }
});
