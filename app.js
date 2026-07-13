// 📊 Paynesville Cup Frontend Application Logic

// Google Sheets Live Data Configuration
const GOOGLE_SPREADSHEET_ID = '10isAN7DcOODriMVYVY1s0hQaVmsZbR-nK5TZWbavYJ0';
let googleSheetsCache = {};

// Global State
let cupData = null;
let currentTab = 'lifetime';
let selectedYear = 2026; // Default to the active 2026 season
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

// Check-In global variables
let checkInSessionsData = [];
let checkInPlayersData = [];
let activeCheckInSession = null;

// Initialize dashboard
document.addEventListener('DOMContentLoaded', () => {
    fetchCupData();
});

// Fetch Google Sheet tab as CSV
async function fetchGoogleSheetCSV(sheetName) {
    if (googleSheetsCache[sheetName]) {
        return googleSheetsCache[sheetName];
    }
    const url = `https://docs.google.com/spreadsheets/d/${GOOGLE_SPREADSHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(sheetName)}`;
    try {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const text = await response.text();
        const parsed = parseCSV(text);
        googleSheetsCache[sheetName] = parsed;
        return parsed;
    } catch (e) {
        console.error(`Failed to fetch sheet ${sheetName}: `, e);
        return null;
    }
}

// RFC-4180 compliant CSV parser
function parseCSV(text) {
    const lines = [];
    let row = [""];
    let inQuotes = false;
    for (let i = 0; i < text.length; i++) {
        const c = text[i];
        const next = text[i+1];
        if (c === '"') {
            if (inQuotes && next === '"') {
                row[row.length - 1] += '"';
                i++;
            } else {
                inQuotes = !inQuotes;
            }
        } else if (c === ',' && !inQuotes) {
            row.push("");
        } else if ((c === '\r' || c === '\n') && !inQuotes) {
            if (c === '\r' && next === '\n') {
                i++;
            }
            lines.push(row.map(cell => cell.trim()));
            row = [""];
        } else {
            row[row.length - 1] += c;
        }
    }
    if (row.length > 1 || row[0] !== "") {
        lines.push(row.map(cell => cell.trim()));
    }
    return lines;
}

const NAME_MAPPINGS = {
    "Katie Bonicatto": "Katie Breviu",
    "Kate Breviu": "Katie Breviu",
    "Brodie": "Brody",
    "Sawyer Sherer": "Sawyer Scherer",
    "Sawyer Scherer": "Sawyer Scherer",
    "Donna Wieneke": "Donna Weineke",
    "Donna Bonicatto": "Donna Weineke",
    "Dave Modrow": "Dave (Sr.) Modrow",
    "Angi Willette": "Angie Willette",
    "Cinci Rob": "(Cincy) Rob Murphy",
    "Cinci Rob Murphy": "(Cincy) Rob Murphy",
    "Uncle Rob Murphy": "(Cincy) Rob Murphy",
    "Rob Murphy": "(Cincy) Rob Murphy",
    "Kelli Lindseth": "Kelly Lindseth",
    "Kylina": "Kilayna",
    "Luke Weineke": "Luke Wieneke",
    "Matt Stahlman": "Matt Stahlmann",
    "Tricia Stahlman": "Tricia Stahlmann",
    "Samanatha Pettit": "Samantha Pettit",
    "Zach Schirmers": "Zack Schirmers",
    "Ben Aeshhilman": "Ben Aeshliman",
    "Ben Aeshilman": "Ben Aeshliman",
    "Patrick Iriwn": "Patrick Irwin",
    "Shaun irwin": "Shaun Irwin",
    "Mel Murphy": "Melanie Murphy",
    "Max": "Max Murphy"
};

const BLACKLIST_NAMES = new Set([
    'KEY', 'Active Score', 'Inactive Score', 'No Participation', 'Booby Prize', 'nan', '', 'None', 'undefined', 'null'
]);

function cleanPlayerName(name) {
    if (!name || typeof name !== 'string') return "";
    const cleaned = name.replace(/\s+/g, ' ').trim();
    if (NAME_MAPPINGS[cleaned]) {
        return NAME_MAPPINGS[cleaned];
    }
    return cleaned;
}

function isValidPlayer(name) {
    if (!name || BLACKLIST_NAMES.has(name)) return false;
    if (name.toLowerCase().startsWith('note')) return false;
    return true;
}

// Fetch and merge 2026 google sheets standings into the app state
async function merge2026LiveData() {
    const csvRows = await fetchGoogleSheetCSV('STANDINGS');
    if (!csvRows || csvRows.length <= 1) {
        console.warn("Could not retrieve 2026 Standings data from Google Sheets.");
        return;
    }
    
    const headers = csvRows[0].map(h => h.trim());
    const dataRows = csvRows.slice(1);
    
    const nameIdx = headers.indexOf('Name');
    const placeIdx = headers.indexOf('Place');
    const pointsIdx = headers.indexOf('Points');
    const tourneysIdx = headers.indexOf('Tournaments Entered');
    const totalScoreIdx = headers.indexOf('Total Score');
    const avgScoreIdx = headers.indexOf('Average Score');
    
    if (nameIdx === -1) {
        console.error("Name column not found in 2026 STANDINGS sheet.");
        return;
    }
    
    const standings2026 = [];
    dataRows.forEach(row => {
        const rawName = row[nameIdx];
        const name = cleanPlayerName(rawName);
        if (!isValidPlayer(name)) return;
        
        const ptsVal = parseFloat(row[pointsIdx]) || 0.0;
        const tourneysVal = parseInt(row[tourneysIdx]) || 0;
        const totalScoreVal = parseFloat(row[totalScoreIdx]) || 0.0;
        const avgScoreVal = parseFloat(row[avgScoreIdx]) || 0.0;
        
        standings2026.push({
            'Year': 2026,
            'Place': row[placeIdx] || 'N/A',
            'Name': name,
            'Cup Points': ptsVal,
            'Tournaments Entered': tourneysVal,
            'Total Score': totalScoreVal,
            'Average Score': avgScoreVal
        });
    });
    
    // Merge into cupData.yearly (filter out existing 2026 entries first)
    cupData.yearly = cupData.yearly.filter(y => y.Year !== 2026);
    cupData.yearly = cupData.yearly.concat(standings2026);
    
    // Merge 2026 standings into lifetime records
    const lifetimeMap = {};
    cupData.lifetime.forEach(p => {
        p['2026'] = null; // Default to null for 2026
        lifetimeMap[p.PlayerName] = p;
    });
    
    standings2026.forEach(st => {
        const name = st.Name;
        const pts2026 = st['Cup Points'];
        const tourneys2026 = st['Tournaments Entered'];
        
        // We only count them as participating in 2026 if they have entries or points
        const hasParticipated = tourneys2026 > 0 || pts2026 > 0;
        
        if (lifetimeMap[name]) {
            const p = lifetimeMap[name];
            p['2026'] = hasParticipated ? pts2026 : null;
            
            // Recalculate lifetime stats
            const activeScores = [];
            ['2022', '2023', '2024', '2025', '2026'].forEach(yr => {
                const score = p[yr];
                if (score !== null && score !== undefined && !isNaN(score)) {
                    activeScores.push(score);
                }
            });
            
            p.LifetimeCupPoints = activeScores.reduce((sum, val) => sum + val, 0);
            p.YearsCompeted = activeScores.length;
            p.AverageCupScore = p.YearsCompeted > 0 ? (p.LifetimeCupPoints / p.YearsCompeted) : 0.0;
            p.TotalTournamentsEntered = (p.TotalTournamentsEntered || 0) + (hasParticipated ? tourneys2026 : 0);
        } else {
            // New player
            const newPlayer = {
                'PlayerName': name,
                'LifetimeCupPoints': pts2026,
                'TotalTournamentsEntered': hasParticipated ? tourneys2026 : 0,
                'YearsCompeted': hasParticipated ? 1 : 0,
                'AverageCupScore': hasParticipated ? pts2026 : 0.0,
                '2022': null,
                '2023': null,
                '2024': null,
                '2025': null,
                '2026': hasParticipated ? pts2026 : null
            };
            cupData.lifetime.push(newPlayer);
            lifetimeMap[name] = newPlayer;
        }
    });
    
    // Sort lifetime data
    cupData.lifetime.sort((a, b) => b.LifetimeCupPoints - a.LifetimeCupPoints);
}

// Fetch and merge 2026 granular tournament events
async function ensure2026EventDataLoaded(tournamentName) {
    const cacheKey = `EVENT_${tournamentName}`;
    if (googleSheetsCache[cacheKey]) {
        return;
    }
    
    const csvRows = await fetchGoogleSheetCSV(tournamentName);
    if (!csvRows || csvRows.length <= 1) {
        googleSheetsCache[cacheKey] = [];
        return;
    }
    
    const headers = csvRows[0].map(h => h.trim());
    const dataRows = csvRows.slice(1);
    
    const nameIdx = headers.indexOf('Name');
    const placeIdx = headers.indexOf('Place');
    
    let ptsIdx = -1;
    for (let c of ['PC Points', 'PC POINTS', 'Points', 'POINTS', 'PC Pt', 'PC Pts']) {
        ptsIdx = headers.indexOf(c);
        if (ptsIdx !== -1) break;
    }
    
    let scoreIdx = -1;
    for (let c of ['Score', 'Games Won', 'Games', 'Result', 'Points Won', 'Wins']) {
        scoreIdx = headers.indexOf(c);
        if (scoreIdx !== -1) break;
    }
    
    const entries2026 = [];
    dataRows.forEach(row => {
        const rawName = row[nameIdx];
        const name = cleanPlayerName(rawName);
        if (!isValidPlayer(name)) return;
        
        const ptsVal = ptsIdx !== -1 ? parseFloat(row[ptsIdx]) : 0.0;
        const scoreVal = scoreIdx !== -1 ? row[scoreIdx] : 'N/A';
        
        // Money columns (new for 2026+)
        let entryFeeIdx = -1;
        for (let c of ['Entry Fee', 'ENTRY FEE', 'Entry', 'Fee']) {
            entryFeeIdx = headers.indexOf(c);
            if (entryFeeIdx !== -1) break;
        }
        let winningsIdx = -1;
        for (let c of ['Winnings', 'WINNINGS', 'Prize', 'Payout']) {
            winningsIdx = headers.indexOf(c);
            if (winningsIdx !== -1) break;
        }
        let bountyIdx = -1;
        for (let c of ['Bounty', 'BOUNTY', 'Bounty Won', 'BOUNTY WON']) {
            bountyIdx = headers.indexOf(c);
            if (bountyIdx !== -1) break;
        }

        const entryFee = entryFeeIdx !== -1 ? (parseFloat(row[entryFeeIdx]) || 0.0) : 0.0;
        const winnings  = winningsIdx  !== -1 ? (parseFloat(row[winningsIdx])  || 0.0) : 0.0;
        const bounty    = bountyIdx    !== -1 ? (parseFloat(row[bountyIdx])    || 0.0) : 0.0;
        const netMoney  = Math.round((winnings + bounty - entryFee) * 100) / 100;

        entries2026.push({
            'Year': 2026,
            'Tournament': tournamentName.toUpperCase(),
            'Player Name': name,
            'Place': row[placeIdx] || 'N/A',
            'Score': scoreVal || 'N/A',
            'PC Points': isNaN(ptsVal) ? 0.0 : ptsVal,
            'EntryFee': entryFee,
            'Winnings': winnings,
            'Bounty': bounty,
            'NetMoney': netMoney
        });
    });
    
    googleSheetsCache[cacheKey] = entries2026;
    
    // Clear and merge into granular event database
    cupData.granular = cupData.granular.filter(g => !(g.Year === 2026 && g.Tournament === tournamentName.toUpperCase()));
    cupData.granular = cupData.granular.concat(entries2026);

    // Recalculate per-player money totals from all 2026 granular entries
    const granular2026 = cupData.granular.filter(g => g.Year === 2026);
    cupData.lifetime.forEach(p => {
        const playerEntries = granular2026.filter(g => g['Player Name'] === p.PlayerName);
        p.TourneyMoneyNet          = Math.round(playerEntries.reduce((s, g) => s + (g.NetMoney  || 0), 0) * 100) / 100;
        p.TourneyEntryFeesPaid     = Math.round(playerEntries.reduce((s, g) => s + (g.EntryFee  || 0), 0) * 100) / 100;
        p.TourneyWinnings          = Math.round(playerEntries.reduce((s, g) => s + (g.Winnings  || 0), 0) * 100) / 100;
        p.TourneyBountyEarnings    = Math.round(playerEntries.reduce((s, g) => s + (g.Bounty    || 0), 0) * 100) / 100;
    });
}

async function ensureAll2026EventMoneyDataLoaded() {
    await Promise.all(MAIN_TOURNAMENTS.map(async (tournamentName) => {
        try {
            await ensure2026EventDataLoaded(tournamentName);
        } catch (e) {
            console.warn(`Could not load 2026 money data for ${tournamentName}:`, e);
        }
    }));
}

// Fetch data from cup_data.json
async function fetchCupData() {
    try {
        const response = await fetch('cup_data.json');
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        cupData = await response.json();
        
        // Merge Google Sheets live data for 2026
        try {
            await merge2026LiveData();
        } catch (sheetError) {
            console.error("Could not load 2026 live data from Google Sheets, showing cached standings:", sheetError);
        }
        
        // Populate search lists and metadata
        populateMetadata();
        
        // Initialize with default tab
        switchTab('lifetime');
    } catch (e) {
        console.error("Failed to load cup data: ", e);
        document.getElementById('main-data-table').innerHTML = `
            <tr>
                <td colspan="11" style="text-align: center; color: var(--accent-red); font-weight: 600; padding: 3rem;">
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
    
    // Toggle check-in widget & default widgets
    const defaultWidgets = document.getElementById('default-widgets');
    const checkinWidget = document.getElementById('checkin-widget-container');
    if (tabName === 'tournaments') {
        if (defaultWidgets) defaultWidgets.style.display = 'none';
        if (checkinWidget) {
            checkinWidget.style.display = 'block';
            renderCheckInWidget();
        }
        activeCheckInSession = null;
        loadCheckInSessions();
    } else {
        if (defaultWidgets) defaultWidgets.style.display = 'block';
        if (checkinWidget) checkinWidget.style.display = 'none';
    }
    
    // Restore the main data table structure if coming from the rivalry or bets tab
    const tableContainer = document.getElementById('leaderboard-table-container');
    if (tabName !== 'rivalry' && tabName !== 'bets' && !document.getElementById('main-data-table')) {
        tableContainer.innerHTML = '<table class="data-table" id="main-data-table"></table>';
    }
    
    if (tabName === 'lifetime') {
        pageTitle.textContent = "Paynesville Cup Master Leaderboard";
        pageSubtitle.textContent = "Cumulative statistics, years competed, and active point streaks across 2022-2026.";
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
        pageTitle.textContent = "🎈 The Top-4 Bubble Watch (2026)";
        pageSubtitle.textContent = "Standing stabilization trackers showing who has a chance to discard their lowest score in the next event.";
        tableCardTitle.textContent = "Active Standings Bubble List";
        renderBubbleTable();
    } else if (tabName === 'rivalry') {
        pageTitle.textContent = "🥊 Cousin Rivalry Head-to-Head";
        pageSubtitle.textContent = "Direct statistical comparisons, event averages, and head-to-head records.";
        tableCardTitle.textContent = "Interactive Rivalry Comparison";
        searchBar.style.display = 'none';
        renderRivalryComparison();
    } else if (tabName === 'bets') {
        pageTitle.textContent = "🎰 Side Bets Sportsbook";
        pageSubtitle.textContent = "Create, track, and resolve wagers for the tournament and informal games.";
        tableCardTitle.textContent = "Live Side Bets Ledger";
        searchBar.style.display = 'none';
        renderSideBetsBoard();
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
                <th style="text-align: center; cursor: pointer;" onclick="setLifetimeSort('2026')" title="2026 Cup Score">2026 ${getSortIndicator('2026', sortKey, sortAscending)}</th>
                <th style="text-align: right; cursor: pointer; white-space: nowrap; color: var(--accent-gold);" onclick="setLifetimeSort('TourneyMoneyNet')" title="Tournament Net Money (2026+)">💰 $ Net ${getSortIndicator('TourneyMoneyNet', sortKey, sortAscending)}</th>
            </tr>
        </thead>
        <tbody>
    `;
    
    if (filtered.length === 0) {
        html += `<tr><td colspan="12" style="text-align: center; color: var(--text-secondary); padding: 2rem;">No players found matching your search.</td></tr>`;
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
            const cell2026 = p['2026'] !== null && p['2026'] !== undefined ? `${p['2026'].toFixed(1)}` : '-';
            
            // Money cell: show +$X / -$X / — depending on data
            const moneyNet = p.TourneyMoneyNet;
            let cellMoney = '—';
            let moneyStyle = 'color: var(--text-secondary); opacity: 0.5;';
            if (moneyNet !== null && moneyNet !== undefined && p.TourneyEntryFeesPaid > 0) {
                const sign = moneyNet >= 0 ? '+' : '';
                cellMoney = `${sign}$${moneyNet.toFixed(2)}`;
                moneyStyle = moneyNet >= 0
                    ? 'color: hsl(145, 70%, 55%); font-weight: 700;'
                    : 'color: var(--accent-red); font-weight: 700;';
            }

            html += `
                <tr>
                    <td style="text-align: center;"><span class="rank-badge ${badgeClass}">${originalRank}</span></td>
                    <td style="font-weight: 600; color: var(--text-primary); cursor: pointer;" onclick="showPlayerCard('${p.PlayerName}')">${p.PlayerName}${trophyIcon}</td>
                    <td style="text-align: right; font-weight: 700; color: var(--accent-gold);">${p.LifetimeCupPoints.toFixed(1)}</td>
                    <td style="text-align: right; color: var(--accent-cyan); font-weight: 600;">${p.AverageCupScore.toFixed(1)}</td>
                    <td style="text-align: right;">${p.TotalTournamentsEntered}</td>
                    <td style="text-align: center;">${p.YearsCompeted}</td>
                    <td style="text-align: center; opacity: ${p['2022'] !== null ? 1 : 0.4};">${cell2022}</td>
                    <td style="text-align: center; opacity: ${p['2023'] !== null ? 1 : 0.4};">${cell2023}</td>
                    <td style="text-align: center; opacity: ${p['2024'] !== null ? 1 : 0.4};">${cell2024}</td>
                    <td style="text-align: center; opacity: ${p['2025'] !== null ? 1 : 0.4};">${cell2025}</td>
                    <td style="text-align: center; opacity: ${p['2026'] !== null && p['2026'] !== undefined ? 1 : 0.4};">${cell2026}</td>
                    <td style="text-align: right; ${moneyStyle}">${cellMoney}</td>
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
                    <td style="text-align: right; color: var(--accent-cyan); font-weight: 600;">${p['Average Score'].toFixed(1)}</td>
                    <td style="text-align: right;">${p['Tournaments Entered']}</td>
                    <td style="text-align: right;">${p['Total Score'].toFixed(1)}</td>
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

async function renderTournamentTable() {
    if (!cupData) return;
    
    const table = document.getElementById('main-data-table');
    
    // Check if we need to load 2026 live data for this tournament
    const cacheKey = `EVENT_${selectedTournament}`;
    if (!googleSheetsCache[cacheKey]) {
        table.innerHTML = `
            <tbody>
                <tr>
                    <td colspan="8" style="text-align: center; color: var(--text-secondary); padding: 3rem;">
                        <span class="loading-spinner">⏳</span> Loading live 2026 results from Google Sheets...
                    </td>
                </tr>
            </tbody>
        `;
        try {
            await ensure2026EventDataLoaded(selectedTournament);
        } catch (e) {
            console.error("Failed to load live 2026 event data", e);
        }
    }
    
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
    
    // Render winnings leaderboard at the bottom of the tournament standings
    await renderWinningsLeaderboard();
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
    
    // Check if there are any 2026 granular event entries with scores
    const entries2026 = cupData.granular.filter(g => g.Year === 2026 && g['PC Points'] > 0);
    
    if (entries2026.length === 0) {
        let html = `
            <tbody>
                <tr>
                    <td style="text-align: center; padding: 4rem 2rem; border-bottom: none;">
                        <div style="font-size: 3rem; margin-bottom: 1rem;">🎈</div>
                        <h3 style="font-size: 1.5rem; color: var(--text-primary); margin-bottom: 0.5rem; font-family: 'Outfit', sans-serif;">2026 Bubble Watch is Pending</h3>
                        <p style="color: var(--text-secondary); font-size: 1.1rem; max-width: 500px; margin: 0 auto; line-height: 1.5;">
                            The 2026 Paynesville Cup starts this weekend! 
                            <br><br>
                            Once tournament scores begin to be entered starting Monday, the live standings and Top-4 Bubble Watch tracker will activate here.
                        </p>
                    </td>
                </tr>
            </tbody>
        `;
        table.innerHTML = html;
        return;
    }
    
    // Compute Bubble Watch list dynamically
    const bubbleList = [];
    const playerNames = [...new Set(entries2026.map(e => e['Player Name']))];
    
    playerNames.forEach(player => {
        const playerEvents = entries2026.filter(e => e['Player Name'] === player);
        const playedCount = playerEvents.length;
        if (playedCount === 0) return;
        
        const scores = playerEvents.map(e => e['PC Points']).sort((a, b) => b - a);
        
        let bubbleStatus = "";
        let bubbleScore = null;
        let targetScore = 0.5;
        let details = "";
        
        if (playedCount < 4) {
            bubbleStatus = "Incomplete";
            details = `Needs ${4 - playedCount} more event(s) to stabilize standings.`;
        } else {
            bubbleStatus = "Active";
            bubbleScore = scores[3]; // 4th score
            targetScore = bubbleScore + 0.5;
            details = `Playing event #${playedCount + 1}. Scoring > ${bubbleScore.toFixed(1)} pts will discard it and boost standings!`;
        }
        
        bubbleList.push({
            Player: player,
            EventsPlayed: playedCount,
            Status: bubbleStatus,
            BubbleScore: bubbleScore,
            TargetScore: targetScore,
            Details: details,
            TopScores: scores
        });
    });
    
    // Sort: Active status first, then by events played descending
    bubbleList.sort((a, b) => {
        if (a.Status === b.Status) {
            return b.EventsPlayed - a.EventsPlayed;
        }
        return a.Status === 'Active' ? -1 : 1;
    });
    
    let html = `
        <thead>
            <tr>
                <th style="width: 52px;">Rank</th>
                <th style="min-width: 150px;">Player</th>
                <th style="text-align: center;">Events Played</th>
                <th style="text-align: center;">Status</th>
                <th style="text-align: right;">Current Bubble Score</th>
                <th style="text-align: right;">Target to Improve</th>
                <th>Tracker Details</th>
            </tr>
        </thead>
        <tbody>
    `;
    
    bubbleList.forEach((b, idx) => {
        const rank = idx + 1;
        const bubbleDisplay = b.BubbleScore !== null ? b.BubbleScore.toFixed(1) : '-';
        const targetDisplay = b.TargetScore.toFixed(1);
        
        // Custom styling for badge
        const badgeStyle = b.Status === 'Active' 
            ? 'background: hsla(145, 80%, 45%, 0.15); color: var(--accent-green); border: 1px solid hsla(145, 80%, 45%, 0.3); padding: 0.25rem 0.6rem; border-radius: 20px; font-size: 0.8rem; font-weight: 600; text-transform: uppercase;' 
            : 'background: hsla(45, 100%, 55%, 0.15); color: var(--accent-gold); border: 1px solid hsla(45, 100%, 55%, 0.3); padding: 0.25rem 0.6rem; border-radius: 20px; font-size: 0.8rem; font-weight: 600; text-transform: uppercase;';
            
        html += `
            <tr>
                <td style="text-align: center;"><span class="rank-badge rank-other">${rank}</span></td>
                <td style="font-weight: 600; color: var(--text-primary); cursor: pointer;" onclick="showPlayerCard('${b.Player}')">${b.Player}</td>
                <td style="text-align: center; font-weight: 600;">${b.EventsPlayed}</td>
                <td style="text-align: center;">
                    <span style="${badgeStyle}">
                        ${b.Status}
                    </span>
                </td>
                <td style="text-align: right; color: var(--accent-cyan); font-weight: 700;">${bubbleDisplay}</td>
                <td style="text-align: right; color: var(--accent-magenta); font-weight: 700;">&gt; ${targetDisplay}</td>
                <td style="font-size: 0.85rem; color: var(--text-secondary); font-style: italic;">${b.Details}</td>
            </tr>
        `;
    });
    
    html += `</tbody>`;
    table.innerHTML = html;
}

// ----------------- RENDER COUSIN RIVALRY COMPARISON -----------------
async function renderRivalryComparison() {
    if (!cupData) return;
    
    // Ensure side bets are loaded
    await loadSideBets();
    
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
    
    // Compute Direct Wagers Stats
    let p1NetWinningsVsP2 = 0;
    let p1WagerWins = 0;
    let p2WagerWins = 0;
    let activeWagersCount = 0;
    let directWagersListHtml = '';
    
    const mutualWagers = sideBetsData.filter(b => {
        const sideA = b.playerA.split(',').map(n => n.trim());
        const sideB = b.playerB.split(',').map(n => n.trim());
        const hasP1 = sideA.includes(rivalryPlayerA) || sideB.includes(rivalryPlayerA);
        const hasP2 = sideA.includes(rivalryPlayerB) || sideB.includes(rivalryPlayerB);
        const hasP1A = sideA.includes(rivalryPlayerA);
        const hasP2A = sideA.includes(rivalryPlayerB);
        return hasP1 && hasP2 && (hasP1A !== hasP2A);
    });
    
    mutualWagers.forEach(b => {
        const sideA = b.playerA.split(',').map(n => n.trim());
        const sideB = b.playerB.split(',').map(n => n.trim());
        const isSplit = b.type.endsWith('(Split)');
        const amount = b.amount;
        const winnerStr = b.winner.trim();
        
        const p1IsSideA = sideA.includes(rivalryPlayerA);
        
        if (winnerStr === 'Pending') {
            activeWagersCount++;
            return;
        }
        if (winnerStr === 'Tie') return;
        
        const sideAWins = (winnerStr === b.playerA.trim() || sideA.includes(winnerStr));
        const sideBWins = (winnerStr === b.playerB.trim() || sideB.includes(winnerStr));
        
        let p1Earned = 0;
        if (sideAWins) {
            if (p1IsSideA) {
                p1Earned = isSplit ? (amount / sideA.length) : amount;
                p1WagerWins++;
            } else {
                p1Earned = isSplit ? -(amount / sideA.length) : -amount;
                p2WagerWins++;
            }
        } else if (sideBWins) {
            if (!p1IsSideA) {
                p1Earned = isSplit ? (amount / sideB.length) : amount;
                p1WagerWins++;
            } else {
                p1Earned = isSplit ? -(amount / sideA.length) : -amount;
                p2WagerWins++;
            }
        }
        p1NetWinningsVsP2 += p1Earned;
    });
    
    if (mutualWagers.length === 0) {
        directWagersListHtml = `<p style="text-align: center; color: var(--text-secondary); padding: 1rem; font-style: italic;">No direct wagers logged between them yet.</p>`;
    } else {
        mutualWagers.forEach(b => {
            let modeLabel = b.type.endsWith('(Split)') ? 'Split' : 'Per Person';
            let dateStr = formatBetDate(b.timestamp);
            let wagerStatus = '';
            let statusClass = '';
            
            if (b.paid === 'Yes') {
                wagerStatus = `🏆 Won by ${b.winner} (Paid)`;
                statusClass = 'settled-paid';
            } else if (b.winner !== 'Pending') {
                wagerStatus = `🎯 Won by ${b.winner} (Awaiting Cash)`;
                statusClass = 'resolved-unpaid';
            } else {
                wagerStatus = `⏳ Active Wager`;
                statusClass = 'active';
            }
            
            directWagersListHtml += `
                <div class="rivalry-wager-item ${statusClass}" onclick="showBetDetails('${b.id}')" style="cursor: pointer; display: flex; flex-direction: column; gap: 0.25rem; padding: 0.75rem; border: 1px solid var(--border-color); border-radius: 12px; background: hsla(222, 20%, 15%, 0.3); margin-bottom: 0.5rem; transition: border-color 0.2s; text-align: left;">
                    <div style="display: flex; justify-content: space-between; font-size: 0.85rem; font-weight: 700; color: var(--text-secondary);">
                        <span>${b.event}</span>
                        <span style="color: var(--accent-gold); font-size: 0.9rem;">$${b.amount.toFixed(0)} (${modeLabel})</span>
                    </div>
                    <div style="font-size: 0.95rem; font-weight: 700; color: var(--text-primary); margin: 0.15rem 0;">
                        ${b.playerA} <span style="color: var(--text-secondary); font-weight: 500; font-size: 0.8rem;">VS</span> ${b.playerB}
                    </div>
                    <div style="display: flex; justify-content: space-between; align-items: center; font-size: 0.8rem; border-top: 1px solid var(--border-color); padding-top: 0.4rem; margin-top: 0.25rem;">
                        <span style="color: var(--accent-cyan); font-weight: 600;">${wagerStatus}</span>
                        ${dateStr ? `<span style="opacity: 0.6;">📅 ${dateStr}</span>` : ''}
                    </div>
                </div>
            `;
        });
    }

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
            
            <!-- Direct Head-to-Head Side Wagers -->
            <div style="margin-top: 1.5rem; background: hsla(222, 20%, 25%, 0.15); padding: 1.25rem; border-radius: 16px; border: 1px solid var(--border-color); text-align: left;">
                <h3 style="font-family: 'Outfit', sans-serif; font-size: 1.25rem; font-weight: 600; margin-bottom: 1rem; color: var(--text-primary); display: flex; align-items: center; gap: 0.5rem;">🎰 Head-to-Head Side Wagers</h3>
                
                <div style="display: grid; grid-template-columns: 1fr 1.2fr 1fr; text-align: center; align-items: center; margin-bottom: 1.25rem; gap: 0.5rem;">
                    <div style="font-size: 1.5rem; font-weight: 800; color: ${p1NetWinningsVsP2 > 0 ? 'var(--accent-green)' : p1NetWinningsVsP2 < 0 ? 'var(--accent-red)' : 'var(--text-secondary)'};">
                        ${p1NetWinningsVsP2 > 0 ? '+' : ''}$${p1NetWinningsVsP2.toFixed(0)}
                    </div>
                    <div style="font-size: 0.75rem; font-weight: 700; text-transform: uppercase; color: var(--text-secondary); letter-spacing: 0.5px;">
                        💰 Net Cash Flow
                    </div>
                    <div style="font-size: 1.5rem; font-weight: 800; color: ${-p1NetWinningsVsP2 > 0 ? 'var(--accent-green)' : -p1NetWinningsVsP2 < 0 ? 'var(--accent-red)' : 'var(--text-secondary)'};">
                        ${-p1NetWinningsVsP2 > 0 ? '+' : ''}$${(-p1NetWinningsVsP2).toFixed(0)}
                    </div>
                    
                    <div style="font-size: 1.25rem; font-weight: 700; color: var(--text-primary);">${p1WagerWins}</div>
                    <div style="font-size: 0.75rem; font-weight: 700; text-transform: uppercase; color: var(--text-secondary); letter-spacing: 0.5px;">
                        🥊 Wagers Won
                    </div>
                    <div style="font-size: 1.25rem; font-weight: 700; color: var(--text-primary);">${p2WagerWins}</div>
                </div>
                
                <div style="border-top: 1px solid var(--border-color); padding-top: 1rem;">
                    <h4 style="font-family: 'Outfit', sans-serif; font-size: 1rem; font-weight: 600; margin-bottom: 0.75rem; color: var(--text-secondary);">Direct Wager Logs</h4>
                    ${directWagersListHtml}
                </div>
            </div>
            
            <div class="rivalry-records-list" style="margin-top: 1.5rem;">
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
    
    const moneyNet = p.TourneyMoneyNet;
    const hasMoney  = (p.TourneyEntryFeesPaid || 0) > 0;
    const moneySign = hasMoney ? (moneyNet >= 0 ? '+' : '') : '';
    const moneyVal  = hasMoney ? `${moneySign}$${moneyNet.toFixed(2)}` : '—';
    const moneyColor = !hasMoney ? 'var(--text-secondary)' : moneyNet >= 0 ? 'hsl(145, 70%, 55%)' : 'var(--accent-red)';

    const inner = document.getElementById('player-card-inner');
    inner.innerHTML = `
        <div class="card-header-block">
            <div class="card-name">${name}</div>
            <div class="card-nickname">${details.nickname}</div>
            ${isChamp ? '<div class="card-badge">🏆 CUP CHAMPION</div>' : ''}
        </div>
        
        <div class="sports-stats-grid" style="grid-template-columns: repeat(5, 1fr);">
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
            <div class="sports-stat-col">
                <span class="sports-stat-lbl">TOURNEY $</span>
                <span class="sports-stat-val" style="font-size: 0.95rem; color: ${moneyColor};">${moneyVal}</span>
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
        closeBetDetails();
    }
});

// ----------------- 🎰 GAMBLING PROBLEM SOUNDBOARD -----------------
const GAMBLING_PROBLEM_LINES = [
    "Congratulations. Gamblers Anonymous meets Tuesdays.",
    "A wise man once said: don't bet. You are not a wise man.",
    "Your wallet just filed a restraining order.",
    "At this rate, you'll be accepting Venmo requests from your dog.",
    "Fun fact: the house always wins. You are not the house.",
    "This bet has been auto-enrolled in the twelve step program.",
    "Sir, this is a Wendy's. And also an intervention.",
    "Your future self just winced.",
    "Bold strategy. Statistically speaking, terrible strategy.",
    "Are you okay? Blink twice if you need help.",
    "The person who invented gambling is laughing right now. At you.",
    "Bet placed. Dignity: pending.",
    "This message is sponsored by your children's college fund.",
    "I believe in you. I also believe pigs will fly. Same odds.",
    "Another one? Your liver AND your wallet are scared.",
    "You are what economists call a net negative.",
    "Have you considered literally any other hobby?",
    "Bet confirmed. Therapy hotline: 1-800-not-again.",
    "Somewhere, a casino executive just smiled and didn't know why.",
    "If losing were an Olympic sport, you'd finally medal.",
    "You heard 'side bet' and physically could not stop yourself. Iconic.",
];

function playGamblingProblemLine() {
    if (!window.speechSynthesis) return;
    const line = GAMBLING_PROBLEM_LINES[Math.floor(Math.random() * GAMBLING_PROBLEM_LINES.length)];
    const utterance = new SpeechSynthesisUtterance(line);
    utterance.rate = 0.95;
    utterance.pitch = 1.0;
    utterance.volume = 1.0;

    // Prefer a voice that sounds punchy — pick a local English voice if available
    const voices = window.speechSynthesis.getVoices();
    const preferred = voices.find(v =>
        v.lang.startsWith('en') && (v.name.includes('Google') || v.name.includes('Samantha') || v.name.includes('Alex') || v.name.includes('Daniel'))
    ) || voices.find(v => v.lang.startsWith('en')) || null;
    if (preferred) utterance.voice = preferred;

    window.speechSynthesis.cancel(); // stop anything already playing
    window.speechSynthesis.speak(utterance);
}

// Ensure voices are loaded (some browsers are async about this)
if (window.speechSynthesis && window.speechSynthesis.onvoiceschanged !== undefined) {
    window.speechSynthesis.onvoiceschanged = () => window.speechSynthesis.getVoices();
}

// ----------------- 🎰 SIDE BETS WIDGET & DATABASE INTEGRATION -----------------
const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbzCOCWd5tb3ojo7gnwkjZOvvTIxruajGo_Z_PIAJ5_3iyeibFF-DnJm2TpdGraTU2ppGg/exec';
let currentBetsSubTab = 'active';
let sideBetsData = [];
let oddsEnabled = false;
let wagerMode = 'single'; // 'single' | 'bulk' | 'group'

// Fetch and parse Side Bets database from Google Sheets
async function loadSideBets() {
    const csvRows = await fetchGoogleSheetCSV('SIDE_BETS');
    if (!csvRows || csvRows.length <= 1) {
        sideBetsData = [];
        return;
    }
    const headers = csvRows[0].map(h => h.trim());
    const dataRows = csvRows.slice(1);
    
    const idIdx = headers.indexOf('ID');
    const pAIdx = headers.indexOf('PlayerA');
    const pBIdx = headers.indexOf('PlayerB');
    const typeIdx = headers.indexOf('Type');
    const eventIdx = headers.indexOf('Event');
    const amountIdx = headers.indexOf('Amount');
    const quoteIdx = headers.indexOf('Quote');
    const winnerIdx = headers.indexOf('Winner');
    const paidIdx = headers.indexOf('Paid');
    const timeIdx = headers.indexOf('Timestamp');
    
    sideBetsData = dataRows.map(row => {
        let rawWinner = row[winnerIdx] || 'Pending';
        let cleanWinner = rawWinner;
        let paidPlayers = [];
        if (rawWinner.includes('|| PAID:')) {
            const parts = rawWinner.split('|| PAID:');
            cleanWinner = parts[0].trim();
            const paidPlayersStr = parts[1].trim();
            paidPlayers = paidPlayersStr ? paidPlayersStr.split(',').map(n => n.trim()) : [];
        }
        
        let rawType = row[typeIdx] || '';
        let cleanType = rawType;
        let oddsVal = 1.0;
        let oddsRatioStr = '1:1';
        if (rawType && rawType.includes('(')) {
            const match = rawType.match(/(.*?)\s*\((\d+(?:\.\d+)?):(\d+(?:\.\d+)?)\)/);
            if (match) {
                cleanType = match[1].trim();
                const num = parseFloat(match[2]);
                const den = parseFloat(match[3]);
                if (num > 0 && den > 0) {
                    oddsVal = num / den;
                    oddsRatioStr = num + ':' + den;
                }
            }
        }
        
        return {
            id: row[idIdx],
            playerA: row[pAIdx],
            playerB: row[pBIdx],
            type: cleanType,
            event: row[eventIdx],
            amount: parseFloat(row[amountIdx]) || 0.0,
            quote: row[quoteIdx],
            winner: cleanWinner,
            paid: row[paidIdx] || 'No',
            timestamp: row[timeIdx],
            odds: oddsVal,
            oddsRatio: oddsRatioStr,
            paidPlayers: paidPlayers,
            rawWinner: rawWinner
        };
    }).filter(b => b.id); // ignore empty rows
    
    // Auto-resolve any tournament bets in the background
    autoResolveTournamentBets();
}

// Background script to auto-resolve bets if tournament results have been input
function autoResolveTournamentBets() {
    const activeBets = sideBetsData.filter(b => b.winner === 'Pending');
    
    activeBets.forEach(async b => {
        if (b.type !== 'Cup') return;
        
        if (b.event === 'Overall Finish') {
            const standings2026 = cupData.yearly.filter(y => y.Year === 2026 && y.Place !== 'N/A' && y.Place !== '' && y.Place !== 'None');
            if (standings2026.length > 0) {
                const rA = standings2026.find(y => y.Name === b.playerA);
                const rB = standings2026.find(y => y.Name === b.playerB);
                if (rA && rB) {
                    const pA = parsePlace(rA.Place);
                    const pB = parsePlace(rB.Place);
                    if (pA !== Infinity && pB !== Infinity) {
                        let winner = 'Tie';
                        if (pA < pB) winner = b.playerA;
                        else if (pB < pA) winner = b.playerB;
                        
                        await executeBetActionInBackground({ action: 'resolve', id: b.id, winner: winner });
                    }
                }
            }
        } else {
            const tourneyName = b.event.toUpperCase();
            const tourneyEntries = cupData.granular.filter(g => g.Year === 2026 && g.Tournament === tourneyName);
            if (tourneyEntries.length > 0) {
                const rA = tourneyEntries.find(g => g['Player Name'] === b.playerA);
                const rB = tourneyEntries.find(g => g['Player Name'] === b.playerB);
                if (rA && rB) {
                    const pA = parsePlace(rA.Place);
                    const pB = parsePlace(rB.Place);
                    if (pA !== Infinity && pB !== Infinity) {
                        let winner = 'Tie';
                        if (pA < pB) winner = b.playerA;
                        else if (pB < pA) winner = b.playerB;
                        
                        await executeBetActionInBackground({ action: 'resolve', id: b.id, winner: winner });
                    }
                }
            }
        }
    });
}

async function executeBetActionInBackground(payload) {
    try {
        await fetch(APPS_SCRIPT_URL, {
            method: 'POST',
            mode: 'no-cors',
            headers: { 'Content-Type': 'text/plain' },
            body: JSON.stringify(payload)
        });
        delete googleSheetsCache['SIDE_BETS'];
    } catch (e) {
        console.error("Background bet resolution failed:", e);
    }
}

// Render the Side Bets Board
function renderSideBetsBoard() {
    const container = document.getElementById('leaderboard-table-container');
    if (!container) return;
    
    let activeClass = currentBetsSubTab === 'active' ? 'active' : '';
    let createClass = currentBetsSubTab === 'create' ? 'active' : '';
    let historyClass = currentBetsSubTab === 'history' ? 'active' : '';
    
    let navHtml = `
        <div class="bets-container">
            <div class="bets-nav">
                <button class="bets-pill ${activeClass}" onclick="switchBetsSubTab('active')">🔴 Active Bets</button>
                <button class="bets-pill ${createClass}" onclick="switchBetsSubTab('create')">➕ Create Bet</button>
                <button class="bets-pill ${historyClass}" onclick="switchBetsSubTab('history')">📜 History & Stats</button>
            </div>
            <div id="bets-sub-content">
                <!-- Inner sub-tab populated dynamically -->
            </div>
        </div>
    `;
    container.innerHTML = navHtml;
    
    const subContent = document.getElementById('bets-sub-content');
    if (currentBetsSubTab === 'active') {
        renderActiveBets(subContent);
    } else if (currentBetsSubTab === 'create') {
        renderCreateBetForm(subContent);
    } else if (currentBetsSubTab === 'history') {
        renderHistoryBets(subContent);
    }
}

function switchBetsSubTab(subTab) {
    currentBetsSubTab = subTab;
    renderSideBetsBoard();
}

// Format bet ISO timestamp into a beautiful readable date (e.g. "Jul 10, 11:20 AM")
function formatBetDate(isoString) {
    if (!isoString) return '';
    try {
        const d = new Date(isoString);
        if (isNaN(d.getTime())) return '';
        return d.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    } catch (e) {
        return '';
    }
}

// Render Active Bets Board
async function renderActiveBets(container) {
    container.innerHTML = `
        <div style="text-align: center; color: var(--text-secondary); padding: 3rem;">
            <span class="loading-spinner">⏳</span> Loading wagers from Google Sheets...
        </div>
    `;
    
    try {
        await loadSideBets();
    } catch (e) {
        console.error("Error loading bets:", e);
    }
    
    const activeBets = sideBetsData.filter(b => b.paid !== 'Yes');
    
    // Sort Active Bets: newest (most recently created) first
    activeBets.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    
    if (activeBets.length === 0) {
        container.innerHTML = `
            <div style="text-align: center; padding: 4rem 2rem; color: var(--text-secondary);">
                <div style="font-size: 3.5rem; margin-bottom: 1rem;">🎰</div>
                <h3 style="color: var(--text-primary); margin-bottom: 0.5rem; font-family: 'Outfit', sans-serif; font-size: 1.5rem;">No active bets right now</h3>
                <p style="font-size: 1.1rem; max-width: 450px; margin: 0 auto; line-height: 1.6;">
                    Have a friendly wager on pickleball, cards, lawn games, or overall finish? Click <strong>Create Bet</strong> above to track it!
                </p>
            </div>
        `;
        return;
    }
    
    let html = `<div class="bets-grid">`;
    activeBets.forEach(b => {
        const isGroup = b.type === 'Group Pot';
        const participants = isGroup ? b.playerA.split(',').map(n => n.trim()).filter(n => n) : [];
        
        let statusClass = b.winner === 'Pending' ? 'active-bet' : 'resolved-unpaid';
        let statusLabel = b.winner === 'Pending' ? 'Active' : 'Resolved — Awaiting Cash Payout';
        let badgeClass = b.winner === 'Pending' ? 'pending' : 'unpaid';
        
        let eventLabel = isGroup ? `🎮 ${b.event}` : (b.type === 'Cup' ? `🏆 ${b.event}` : `🎮 ${b.event}`);
        let dateStr = formatBetDate(b.timestamp);
        
        let actionHtml = '';
        if (isGroup) {
            if (b.winner === 'Pending') {
                actionHtml = `
                    <div class="bet-actions">
                        <button class="bet-btn resolve" onclick="event.stopPropagation(); showSettleGroupModal('${b.id}')">🎯 Settle Winner(s)</button>
                    </div>
                `;
            } else {
                actionHtml = `
                    <div class="bet-actions">
                        <button class="bet-btn paid-btn" onclick="event.stopPropagation(); showBetDetails('${b.id}')">💵 Collect Cash Checklist</button>
                    </div>
                `;
            }
        } else {
            if (b.winner === 'Pending') {
                actionHtml = `
                    <div class="bet-actions">
                        <button class="bet-btn resolve" onclick="event.stopPropagation(); triggerResolveBet('${b.id}', '${b.playerA.replace(/'/g, "\\'")}', '${b.playerB.replace(/'/g, "\\'")}')">🎯 Resolve Winner</button>
                    </div>
                `;
            } else {
                actionHtml = `
                    <div class="bet-actions">
                        <button class="bet-btn paid-btn" onclick="event.stopPropagation(); triggerMarkPaid('${b.id}')">💵 Mark Paid & Completed</button>
                    </div>
                `;
            }
        }
        
        let winnerText = b.winner === 'Pending' ? '' : `<div style="color: var(--accent-cyan); font-weight: 700; margin-top: 0.25rem;">Winner: ${b.winner}</div>`;
        
        // Checklist summary for Group Pots
        let checklistSummary = '';
        if (isGroup && b.winner !== 'Pending') {
            const paidCount = b.paidPlayers.length;
            const totalCount = participants.length;
            checklistSummary = `<div style="font-size: 0.8rem; color: var(--accent-gold); font-weight: 700; margin-top: 0.25rem; display: flex; align-items: center; gap: 0.25rem;">💵 Collected: ${paidCount} / ${totalCount} paid</div>`;
        }
        
        let oddsDisplay = '';
        if (b.odds && parseFloat(b.odds) !== 1.0) {
            oddsDisplay = `<span style="font-size: 0.75rem; color: var(--accent-cyan); font-weight: 700; margin-left: 0.4rem; padding: 0.15rem 0.35rem; background: hsla(180, 100%, 48%, 0.1); border-radius: 4px; border: 1px solid hsla(180, 100%, 48%, 0.2);">🎲 ${b.oddsRatio || (b.odds.toFixed(1) + ':1')}</span>`;
        }
        
        let matchupHtml = '';
        if (isGroup) {
            matchupHtml = `
                <div style="display: flex; flex-direction: column; width: 100%; text-align: left; margin: 0.5rem 0;">
                    <span style="font-weight: 700; color: var(--text-primary); font-size: 1.05rem;">👥 Group Pot</span>
                    <span style="font-size: 0.82rem; color: var(--text-secondary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-top: 0.2rem;" title="${b.playerA}">${b.playerA}</span>
                </div>
            `;
        } else {
            matchupHtml = `
                <div class="bet-matchup">
                    <span class="bet-player" title="${b.playerA}">${b.playerA}</span>
                    <span class="bet-vs">VS</span>
                    <span class="bet-player" style="text-align: right;" title="${b.playerB}">${b.playerB}</span>
                </div>
            `;
        }
        
        let amountValDisplay = isGroup ? `$${b.amount.toFixed(0)} buy-in (Pot: $${(b.amount * participants.length).toFixed(0)})` : `$${b.amount.toFixed(0)}`;
        
        html += `
            <div class="bet-card ${statusClass}" onclick="showBetDetails('${b.id}')" style="cursor: pointer;">
                <div class="bet-header">
                    <span>${isGroup ? 'Group' : b.type} Bet</span>
                    <span class="bet-status-badge ${badgeClass}">${statusLabel}</span>
                </div>
                ${matchupHtml}
                ${winnerText}
                ${checklistSummary}
                <div class="bet-details-row">
                    <span class="bet-event">${eventLabel}</span>
                    <span class="bet-amount">${amountValDisplay}${oddsDisplay}</span>
                </div>
                ${dateStr ? `<div style="font-size: 0.8rem; color: var(--text-secondary); opacity: 0.7; display: flex; align-items: center; gap: 0.25rem; margin-top: -0.5rem; margin-bottom: 0.25rem;">📅 Created: ${dateStr}</div>` : ''}
                ${b.quote ? `<div class="bet-quote-bubble">"${b.quote}"</div>` : ''}
                ${actionHtml}
            </div>
        `;
    });
    html += `</div>`;
    container.innerHTML = html;
}

// Render Create Bet Form
function renderCreateBetForm(container) {
    oddsEnabled = false; // reset when opening form
    wagerMode = 'single';
    const names = cupData.lifetime.map(p => p.PlayerName).sort((a,b) => a.localeCompare(b));
    
    let playerAOptions = '';
    names.forEach(n => {
        playerAOptions += `<option value="${n}">${n}</option>`;
    });
    
    let tourneyOptions = '';
    MAIN_TOURNAMENTS.forEach(t => {
        tourneyOptions += `<option value="${t}">${t}</option>`;
    });
    
    let sideACheckboxes = '';
    let sideBCheckboxes = '';
    let bulkOpponentCheckboxes = '';
    let groupPlayerCheckboxes = '';
    
    names.forEach((n, idx) => {
        sideACheckboxes += `
            <label style="display: flex; align-items: center; gap: 0.4rem; padding: 0.25rem; cursor: pointer;">
                <input type="checkbox" class="bet-side-a-check" value="${n}" onchange="evaluateTeamMode()"> ${n}
            </label>
        `;
        sideBCheckboxes += `
            <label style="display: flex; align-items: center; gap: 0.4rem; padding: 0.25rem; cursor: pointer;">
                <input type="checkbox" class="bet-side-b-check" value="${n}" onchange="evaluateTeamMode()"> ${n}
            </label>
        `;
        bulkOpponentCheckboxes += `
            <label style="display: flex; align-items: center; gap: 0.4rem; padding: 0.25rem; cursor: pointer;">
                <input type="checkbox" class="bet-bulk-opp-check" value="${n}" onchange="handleBulkOpponentChange()"> ${n}
            </label>
        `;
        groupPlayerCheckboxes += `
            <label style="display: flex; align-items: center; gap: 0.4rem; padding: 0.25rem; cursor: pointer;">
                <input type="checkbox" class="bet-group-player-check" value="${n}" onchange="updateGroupPotPreview()"> ${n}
            </label>
        `;
    });
    
    let html = `
        <div class="card bet-form-card">
            <h3 style="font-family: 'Outfit', sans-serif; font-size: 1.5rem; margin-bottom: 1.5rem; color: var(--text-primary); border-bottom: 1px solid var(--border-color); padding-bottom: 0.75rem;">🎰 Create a Side Bet</h3>
            
            <div class="wager-mode-select" style="display: flex; gap: 0.5rem; margin-bottom: 1.5rem; width: 100%;">
                <button type="button" class="wager-mode-btn" id="mode-btn-single" onclick="switchWagerMode('single')" style="flex: 1; padding: 0.6rem 0.8rem; border-radius: 12px; border: 1px solid var(--border-color); background: var(--bg-sidebar); color: var(--text-secondary); font-weight: 700; font-size: 0.82rem; cursor: pointer; transition: all 0.2s;">👤 Single / Team</button>
                <button type="button" class="wager-mode-btn" id="mode-btn-bulk" onclick="switchWagerMode('bulk')" style="flex: 1; padding: 0.6rem 0.8rem; border-radius: 12px; border: 1px solid var(--border-color); background: var(--bg-sidebar); color: var(--text-secondary); font-weight: 700; font-size: 0.82rem; cursor: pointer; transition: all 0.2s;">🎰 Bulk 1v1s</button>
                <button type="button" class="wager-mode-btn" id="mode-btn-group" onclick="switchWagerMode('group')" style="flex: 1; padding: 0.6rem 0.8rem; border-radius: 12px; border: 1px solid var(--border-color); background: var(--bg-sidebar); color: var(--text-secondary); font-weight: 700; font-size: 0.82rem; cursor: pointer; transition: all 0.2s;">👥 Group Pot</button>
            </div>
            
            <form id="create-bet-form" onsubmit="handleCreateBetSubmit(event)">
                
                <div id="normal-mode-fields">
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin-bottom: 1.25rem;">
                        <div class="form-group">
                            <label>Side A *</label>
                            <div style="max-height: 140px; overflow-y: auto; padding: 0.5rem; background: var(--bg-sidebar); border: 1px solid var(--border-color); border-radius: 8px; display: flex; flex-direction: column; gap: 0.25rem;">
                                ${sideACheckboxes}
                            </div>
                        </div>
                        <div class="form-group">
                            <label>Side B *</label>
                            <div style="max-height: 140px; overflow-y: auto; padding: 0.5rem; background: var(--bg-sidebar); border: 1px solid var(--border-color); border-radius: 8px; display: flex; flex-direction: column; gap: 0.25rem;">
                                ${sideBCheckboxes}
                            </div>
                        </div>
                    </div>
                    
                    <div class="form-group" id="split-mode-group" style="display: none; background: hsla(45, 100%, 55%, 0.05); padding: 0.75rem; border-radius: 8px; border: 1px dashed var(--border-color);">
                        <label style="color: var(--accent-gold); font-weight: 700;">👥 Team Wager Mode</label>
                        <div style="display: flex; gap: 1.5rem; margin-top: 0.4rem;">
                            <label style="display: flex; align-items: center; gap: 0.35rem; font-weight: 600; cursor: pointer;">
                                <input type="radio" name="wager-split" value="Per Person" onchange="updateOddsPreview()" checked> Per Person
                            </label>
                            <label style="display: flex; align-items: center; gap: 0.35rem; font-weight: 600; cursor: pointer;">
                                <input type="radio" name="wager-split" value="Split" onchange="updateOddsPreview()"> Total Pot Split
                            </label>
                        </div>
                        <span style="font-size: 0.78rem; color: var(--text-secondary); margin-top: 0.4rem; display: block; line-height: 1.3;">
                            * <strong>Per Person</strong>: Losers owe the wager amount to EACH winner.<br>
                            * <strong>Total Pot Split</strong>: The single wager amount is divided among winners/losers.
                        </span>
                    </div>
                </div>
                
                <div id="bulk-mode-fields" style="display: none; margin-bottom: 1.25rem;">
                    <div class="form-group" style="margin-bottom: 1.25rem;">
                        <label for="bet-player-a">Your Name (Player A) *</label>
                        <select class="form-select" id="bet-player-a" onchange="updateOddsPreview()">
                            ${playerAOptions}
                        </select>
                    </div>
                    
                    <div class="form-group" style="margin-bottom: 1.25rem;">
                        <label>Opponents (Select all that apply) *</label>
                        <div style="max-height: 140px; overflow-y: auto; padding: 0.5rem; background: var(--bg-sidebar); border: 1px solid var(--border-color); border-radius: 8px; display: flex; flex-direction: column; gap: 0.25rem;">
                            ${bulkOpponentCheckboxes}
                        </div>
                    </div>
                    
                    <div class="form-group" id="bulk-amounts-config" style="display: none; background: hsla(180, 100%, 48%, 0.05); padding: 0.75rem; border-radius: 8px; border: 1px dashed var(--border-color);">
                        <label style="color: var(--accent-cyan); font-weight: 700;">💰 Configure Wager Amounts</label>
                        <div id="bulk-amounts-inputs" style="display: flex; flex-direction: column; gap: 0.5rem; margin-top: 0.5rem; max-height: 180px; overflow-y: auto; padding-right: 0.25rem;">
                            <!-- Inputs generated dynamically -->
                        </div>
                    </div>
                </div>
                
                <div id="group-mode-fields" style="display: none; margin-bottom: 1.25rem;">
                    <div class="form-group">
                        <label>Group Participants (Select all playing) *</label>
                        <div style="max-height: 140px; overflow-y: auto; padding: 0.5rem; background: var(--bg-sidebar); border: 1px solid var(--border-color); border-radius: 8px; display: flex; flex-direction: column; gap: 0.25rem;">
                            ${groupPlayerCheckboxes}
                        </div>
                    </div>
                    <div id="group-pot-preview" style="font-size: 0.9rem; color: var(--accent-cyan); font-weight: 700; margin-top: -0.5rem; margin-bottom: 1rem;">
                        <!-- Calculated dynamically -->
                    </div>
                </div>
                
                <div class="form-group" style="margin-top: 1.25rem;">
                    <label for="bet-type">Wager Type *</label>
                    <select class="form-select" id="bet-type" onchange="toggleBetTypeFields(this.value)" required>
                        <option value="Cup">🏆 Paynesville Cup Event</option>
                        <option value="Custom">🎮 Custom / Informal Game</option>
                    </select>
                </div>
                
                <div class="form-group" id="group-cup-event">
                    <label for="bet-event-select">Select Cup Event *</label>
                    <select class="form-select" id="bet-event-select">
                        <option value="Overall Finish">Overall Championship Finish</option>
                        ${tourneyOptions}
                    </select>
                </div>
                
                <div class="form-group" id="group-custom-event" style="display: none;">
                    <label for="bet-event-input">Event / Game Name *</label>
                    <input type="text" class="form-input" id="bet-event-input" placeholder="e.g. Clash Royale, Cornhole, Mini-Golf">
                </div>
                
                <div class="form-group" id="group-normal-amount">
                    <div style="display: flex; justify-content: space-between; align-items: center; width: 100%;">
                        <label for="bet-amount" id="wager-amount-label">Wager Amount ($) *</label>
                        <button type="button" id="toggle-odds-btn" onclick="toggleOddsFields()" style="background: none; border: none; color: var(--accent-cyan); font-weight: 700; font-size: 0.85rem; cursor: pointer; padding: 0;">Need Odds? 🎲</button>
                    </div>
                    <input type="number" class="form-input" id="bet-amount" min="1" max="10000" placeholder="e.g. 5, 20, 100" oninput="updateOddsPreview(); updateGroupPotPreview()" required>
                </div>

                <div id="odds-fields-group" style="display: none; background: hsla(180, 100%, 48%, 0.05); padding: 0.75rem; border-radius: 8px; border: 1px dashed var(--border-color); margin-bottom: 1.25rem; flex-direction: column; gap: 0.5rem;">
                    <label style="color: var(--accent-cyan); font-weight: 700; display: flex; align-items: center; gap: 0.25rem;">
                        🎲 Asymmetric Odds Config
                    </label>
                    <div style="display: flex; align-items: center; gap: 0.5rem; margin-top: 0.25rem;">
                        <span>Side A gets</span>
                        <input type="number" id="odds-numerator" class="form-input" value="2" min="1" style="width: 60px; padding: 0.3rem; text-align: center;" oninput="updateOddsPreview()">
                        <span>to</span>
                        <input type="number" id="odds-denominator" class="form-input" value="1" min="1" style="width: 60px; padding: 0.3rem; text-align: center;" oninput="updateOddsPreview()">
                        <span>odds</span>
                    </div>
                    <div id="odds-math-preview" style="font-size: 0.8rem; color: var(--text-secondary); line-height: 1.4; margin-top: 0.25rem;">
                        <!-- Updated dynamically -->
                    </div>
                </div>
                
                <div class="form-group">
                    <label for="bet-quote">Trash Talk / Terms</label>
                    <textarea class="form-textarea" id="bet-quote" placeholder="Put your trash talk or bet details here..."></textarea>
                </div>
                
                <button type="submit" class="action-btn" id="btn-submit-bet" style="width: 100%; margin-top: 1rem;">🎰 Create Side Bet</button>
            </form>
            <div id="bet-submit-status" style="margin-top: 1.5rem; text-align: center; display: none;"></div>
        </div>
    `;
    container.innerHTML = html;
    switchWagerMode('single');
}

function toggleBulkMode(isBulk) {
    const normalFields = document.getElementById('normal-mode-fields');
    const bulkFields = document.getElementById('bulk-mode-fields');
    const normalAmount = document.getElementById('group-normal-amount');
    const amountInput = document.getElementById('bet-amount');
    
    if (isBulk) {
        if (normalFields) normalFields.style.display = 'none';
        if (bulkFields) bulkFields.style.display = 'block';
        if (normalAmount) normalAmount.style.display = 'none';
        if (amountInput) amountInput.removeAttribute('required');
        handleBulkOpponentChange();
    } else {
        if (normalFields) normalFields.style.display = 'block';
        if (bulkFields) bulkFields.style.display = 'none';
        if (normalAmount) normalAmount.style.display = 'flex';
        if (amountInput) amountInput.setAttribute('required', 'true');
        updateOddsPreview();
    }
}

function evaluateTeamMode() {
    const sideA = Array.from(document.querySelectorAll('.bet-side-a-check:checked')).map(c => c.value);
    const sideB = Array.from(document.querySelectorAll('.bet-side-b-check:checked')).map(c => c.value);
    
    const splitGroup = document.getElementById('split-mode-group');
    if (splitGroup) {
        if (sideA.length > 1 || sideB.length > 1) {
            splitGroup.style.display = 'block';
        } else {
            splitGroup.style.display = 'none';
        }
    }
    updateOddsPreview();
}

function handleBulkOpponentChange() {
    const checkedOpponents = Array.from(document.querySelectorAll('.bet-bulk-opp-check:checked')).map(c => c.value);
    const configGroup = document.getElementById('bulk-amounts-config');
    const inputsDiv = document.getElementById('bulk-amounts-inputs');
    
    if (!configGroup || !inputsDiv) return;
    
    if (checkedOpponents.length === 0) {
        configGroup.style.display = 'none';
        updateOddsPreview();
        return;
    }
    
    configGroup.style.display = 'block';
    
    const existingValues = {};
    document.querySelectorAll('.bulk-amount-override').forEach(inp => {
        existingValues[inp.getAttribute('data-player')] = inp.value;
    });
    
    let html = '';
    checkedOpponents.forEach(p => {
        let val = existingValues[p] || '1';
        html += `
            <div style="display: flex; justify-content: space-between; align-items: center; padding: 0.25rem 0; border-bottom: 1px solid var(--border-color);">
                <span style="font-weight: 600; font-size: 0.9rem;">${p}</span>
                <div style="display: flex; align-items: center; gap: 0.25rem;">
                    <span style="color: var(--text-secondary); font-size: 0.9rem;">$</span>
                    <input type="number" class="form-input bulk-amount-override" data-player="${p}" value="${val}" min="1" max="10000" style="width: 70px; padding: 0.3rem 0.5rem; text-align: center;" oninput="updateOddsPreview()">
                </div>
            </div>
        `;
    });
    inputsDiv.innerHTML = html;
    updateOddsPreview();
}

function toggleBetTypeFields(val) {
    const cupGroup = document.getElementById('group-cup-event');
    const customGroup = document.getElementById('group-custom-event');
    if (val === 'Cup') {
        if (cupGroup) cupGroup.style.display = 'flex';
        if (customGroup) customGroup.style.display = 'none';
    } else {
        if (cupGroup) cupGroup.style.display = 'none';
        if (customGroup) customGroup.style.display = 'flex';
    }
}

function toggleOddsFields() {
    const group = document.getElementById('odds-fields-group');
    const btn = document.getElementById('toggle-odds-btn');
    if (!group || !btn) return;
    
    oddsEnabled = !oddsEnabled;
    if (oddsEnabled) {
        group.style.display = 'flex';
        btn.textContent = 'Remove Odds ❌';
    } else {
        group.style.display = 'none';
        btn.textContent = 'Need Odds? 🎲';
    }
    updateOddsPreview();
}

function updateOddsPreview() {
    const isBulk = (wagerMode === 'bulk');
    const isGroup = (wagerMode === 'group');
    if (isGroup) {
        const previewDiv = document.getElementById('odds-math-preview');
        if (previewDiv) previewDiv.innerHTML = '';
        return;
    }
    
    const numVal = parseFloat(document.getElementById('odds-numerator')?.value) || 1;
    const denVal = parseFloat(document.getElementById('odds-denominator')?.value) || 1;
    
    const previewDiv = document.getElementById('odds-math-preview');
    if (!previewDiv) return;
    
    if (!oddsEnabled || numVal <= 0 || denVal <= 0) {
        previewDiv.innerHTML = '';
        return;
    }
    
    const multiplier = numVal / denVal;
    
    if (isBulk) {
        const playerA = document.getElementById('bet-player-a')?.value || 'Player A';
        const opponents = Array.from(document.querySelectorAll('.bet-bulk-opp-check:checked')).map(c => c.value);
        if (opponents.length === 0) {
            previewDiv.innerHTML = '💡 <em>Select opponents to see payout breakdown.</em>';
            return;
        }
        
        const overrides = {};
        document.querySelectorAll('.bulk-amount-override').forEach(inp => {
            overrides[inp.getAttribute('data-player')] = parseFloat(inp.value) || 1.0;
        });
        
        let previewHtml = `💡 <strong>Odds Ratio:</strong> ${numVal}:${denVal} (${multiplier.toFixed(2)}x payout)<br>`;
        opponents.forEach(opp => {
            const amount = overrides[opp] || 1.0;
            const winAmount = amount * multiplier;
            previewHtml += `
                • Against <strong>${opp}</strong> (stake: $${amount.toFixed(0)}): If ${playerA} wins &rarr; wins <strong>$${winAmount.toFixed(0)}</strong>. If ${opp} wins &rarr; wins <strong>$${amount.toFixed(0)}</strong>.<br>
            `;
        });
        previewDiv.innerHTML = previewHtml;
    } else {
        const amountVal = parseFloat(document.getElementById('bet-amount')?.value) || 0;
        if (amountVal <= 0) {
            previewDiv.innerHTML = '💡 <em>Enter a wager amount to see payout breakdown.</em>';
            return;
        }
        
        const sideA = Array.from(document.querySelectorAll('.bet-side-a-check:checked')).map(c => c.value);
        const sideB = Array.from(document.querySelectorAll('.bet-side-b-check:checked')).map(c => c.value);
        
        const sideALabel = sideA.length > 0 ? sideA.join(', ') : 'Side A';
        const sideBLabel = sideB.length > 0 ? sideB.join(', ') : 'Side B';
        
        const winAmount = amountVal * multiplier;
        const isSplit = document.querySelector('input[name="wager-split"]:checked')?.value === 'Split';
        
        let previewText = '';
        if (sideA.length > 1 || sideB.length > 1) {
            if (isSplit) {
                previewText = `
                    💡 <strong>Odds Ratio:</strong> ${numVal}:${denVal} (${multiplier.toFixed(2)}x payout)<br>
                    🟢 If <strong>${sideALabel}</strong> wins: They split a total payout of <strong>$${winAmount.toFixed(0)}</strong> (paid by ${sideBLabel}).<br>
                    🔴 If <strong>${sideBLabel}</strong> wins: They split a total payout of <strong>$${amountVal.toFixed(0)}</strong> (paid by ${sideALabel}).
                `;
            } else {
                const totalAWin = winAmount * sideB.length;
                const totalBWin = amountVal * sideA.length;
                previewText = `
                    💡 <strong>Odds Ratio:</strong> ${numVal}:${denVal} (${multiplier.toFixed(2)}x payout)<br>
                    🟢 If <strong>${sideALabel}</strong> wins: Each player on ${sideALabel} wins $${winAmount.toFixed(0)} from each player on ${sideBLabel} (total of <strong>$${totalAWin.toFixed(0)}</strong> collected).<br>
                    🔴 If <strong>${sideBLabel}</strong> wins: Each player on ${sideBLabel} wins $${amountVal.toFixed(0)} from each player on ${sideA} (total of <strong>$${totalBWin.toFixed(0)}</strong> collected).
                `;
            }
        } else {
            previewText = `
                💡 <strong>Odds Ratio:</strong> ${numVal}:${denVal} (${multiplier.toFixed(2)}x payout)<br>
                🟢 If <strong>${sideALabel}</strong> wins: <strong>${sideBLabel}</strong> pays them <strong>$${winAmount.toFixed(0)}</strong>.<br>
                🔴 If <strong>${sideBLabel}</strong> wins: <strong>${sideALabel}</strong> pays them <strong>$${amountVal.toFixed(0)}</strong>.
            `;
        }
        previewDiv.innerHTML = previewText;
    }
}

function switchWagerMode(mode) {
    wagerMode = mode;
    
    // Update active button styles
    document.querySelectorAll('.wager-mode-btn').forEach(btn => {
        btn.style.background = 'var(--bg-sidebar)';
        btn.style.borderColor = 'var(--border-color)';
        btn.style.color = 'var(--text-secondary)';
    });
    
    const activeBtn = document.getElementById(`mode-btn-${mode}`);
    if (activeBtn) {
        activeBtn.style.background = 'linear-gradient(135deg, hsla(180, 100%, 48%, 0.15), hsla(222, 20%, 25%, 0.3))';
        activeBtn.style.borderColor = 'var(--accent-cyan)';
        activeBtn.style.color = 'var(--text-primary)';
    }
    
    const normalFields = document.getElementById('normal-mode-fields');
    const bulkFields = document.getElementById('bulk-mode-fields');
    const groupFields = document.getElementById('group-mode-fields');
    const normalAmount = document.getElementById('group-normal-amount');
    const amountLabel = document.getElementById('wager-amount-label');
    const amountInput = document.getElementById('bet-amount');
    const oddsToggleBtn = document.getElementById('toggle-odds-btn');
    
    if (mode === 'single') {
        if (normalFields) normalFields.style.display = 'block';
        if (bulkFields) bulkFields.style.display = 'none';
        if (groupFields) groupFields.style.display = 'none';
        if (normalAmount) normalAmount.style.display = 'block';
        if (amountLabel) amountLabel.textContent = 'Wager Amount ($) *';
        if (amountInput) amountInput.setAttribute('required', 'true');
        if (oddsToggleBtn) oddsToggleBtn.style.display = 'block';
    } else if (mode === 'bulk') {
        if (normalFields) normalFields.style.display = 'none';
        if (bulkFields) bulkFields.style.display = 'block';
        if (groupFields) groupFields.style.display = 'none';
        if (normalAmount) normalAmount.style.display = 'none';
        if (amountInput) amountInput.removeAttribute('required');
        if (oddsToggleBtn) oddsToggleBtn.style.display = 'block';
        handleBulkOpponentChange();
    } else if (mode === 'group') {
        if (normalFields) normalFields.style.display = 'none';
        if (bulkFields) bulkFields.style.display = 'none';
        if (groupFields) groupFields.style.display = 'block';
        if (normalAmount) normalAmount.style.display = 'block';
        if (amountLabel) amountLabel.textContent = 'Entry Fee per Person ($) *';
        if (amountInput) amountInput.setAttribute('required', 'true');
        
        // Hide odds for group pot
        if (oddsToggleBtn) oddsToggleBtn.style.display = 'none';
        if (oddsEnabled) {
            toggleOddsFields();
        }
        
        updateGroupPotPreview();
    }
    
    updateOddsPreview();
}

function updateGroupPotPreview() {
    const checked = Array.from(document.querySelectorAll('.bet-group-player-check:checked')).map(c => c.value);
    const amountVal = parseFloat(document.getElementById('bet-amount')?.value) || 0;
    const previewDiv = document.getElementById('group-pot-preview');
    if (!previewDiv) return;
    
    if (wagerMode !== 'group') {
        previewDiv.innerHTML = '';
        return;
    }
    
    const count = checked.length;
    const totalPot = count * amountVal;
    
    if (count > 0) {
        previewDiv.innerHTML = `👥 Total Players: ${count} &middot; 💰 Total Pot: $${totalPot.toFixed(0)}`;
    } else {
        previewDiv.innerHTML = '👥 <em>Select players to calculate total pot.</em>';
    }
}

async function handleCreateBetSubmit(e) {
    e.preventDefault();
    const btn = document.getElementById('btn-submit-bet');
    const status = document.getElementById('bet-submit-status');
    
    const type = document.getElementById('bet-type').value;
    const quote = document.getElementById('bet-quote').value;
    
    let eventName = '';
    if (type === 'Cup') {
        eventName = document.getElementById('bet-event-select').value;
    } else {
        eventName = document.getElementById('bet-event-input').value;
        if (!eventName.trim()) {
            alert("Please enter a custom game name.");
            return;
        }
    }

    let oddsVal = 1.0;
    let oddsRatioStr = '1:1';
    if (oddsEnabled && wagerMode !== 'group') {
        const num = parseFloat(document.getElementById('odds-numerator').value) || 1;
        const den = parseFloat(document.getElementById('odds-denominator').value) || 1;
        if (num > 0 && den > 0) {
            oddsVal = num / den;
            oddsRatioStr = num + ':' + den;
        }
    }
    
    if (wagerMode === 'group') {
        const groupPlayers = Array.from(document.querySelectorAll('.bet-group-player-check:checked')).map(c => c.value);
        if (groupPlayers.length < 2) {
            alert("Please select at least 2 participants for the Group Pot.");
            return;
        }
        
        const amount = document.getElementById('bet-amount').value;
        if (!amount || parseFloat(amount) <= 0) {
            alert("Please enter a valid entry fee.");
            return;
        }
        
        btn.disabled = true;
        btn.innerHTML = '⏳ Submitting Group Pot...';
        status.style.display = 'block';
        status.innerHTML = '<span style="color: var(--text-secondary);">Sending group bet to Google Sheet...</span>';
        
        const payload = {
            action: 'create',
            playerA: groupPlayers.join(', '),
            playerB: 'Group Pot',
            type: 'Group Pot',
            event: eventName,
            amount: amount,
            quote: quote
        };
        
        try {
            await fetch(APPS_SCRIPT_URL, {
                method: 'POST',
                mode: 'no-cors',
                headers: { 'Content-Type': 'text/plain' },
                body: JSON.stringify(payload)
            });
            
            delete googleSheetsCache['SIDE_BETS'];
            
            status.innerHTML = '<span style="color: var(--accent-green); font-weight: 700;">✅ Group Pot Logged Successfully!</span>';
            playGamblingProblemLine();
            setTimeout(() => {
                switchBetsSubTab('active');
            }, 1200);
        } catch (err) {
            console.error("Error submitting group pot:", err);
            status.innerHTML = `<span style="color: var(--accent-red);">⚠️ Error: ${err.message}. Please check connection.</span>`;
            btn.disabled = false;
            btn.innerHTML = '🎰 Create Side Bet';
        }
        
    } else if (wagerMode === 'bulk') {
        const playerA = document.getElementById('bet-player-a').value;
        const opponents = Array.from(document.querySelectorAll('.bet-bulk-opp-check:checked')).map(c => c.value);
        
        if (opponents.length === 0) {
            alert("Please select at least one opponent.");
            return;
        }
        
        if (opponents.includes(playerA)) {
            alert("You cannot bet against yourself! Uncheck your own name from the opponents list.");
            return;
        }
        
        btn.disabled = true;
        status.style.display = 'block';
        
        const overrides = {};
        document.querySelectorAll('.bulk-amount-override').forEach(inp => {
            overrides[inp.getAttribute('data-player')] = parseFloat(inp.value) || 1.0;
        });
        
        let successCount = 0;
        for (let i = 0; i < opponents.length; i++) {
            const opp = opponents[i];
            const amount = overrides[opp] || 1.0;
            
            status.innerHTML = `<span style="color: var(--text-secondary);">⏳ Logging bet ${i+1} of ${opponents.length} against ${opp}...</span>`;
            
            const payload = {
                action: 'create',
                playerA: playerA,
                playerB: opp,
                type: oddsEnabled ? `${type} (${oddsRatioStr})` : type,
                event: eventName,
                amount: amount,
                quote: quote
            };
            
            try {
                await fetch(APPS_SCRIPT_URL, {
                    method: 'POST',
                    mode: 'no-cors',
                    headers: { 'Content-Type': 'text/plain' },
                    body: JSON.stringify(payload)
                });
                successCount++;
            } catch (err) {
                console.error(`Failed to submit bet against ${opp}:`, err);
            }
        }
        
        delete googleSheetsCache['SIDE_BETS'];
        
        if (successCount === opponents.length) {
            status.innerHTML = `<span style="color: var(--accent-green); font-weight: 700;">✅ All ${opponents.length} bets logged successfully!</span>`;
            playGamblingProblemLine();
        } else {
            status.innerHTML = `<span style="color: var(--accent-gold); font-weight: 700;">⚠️ Logged ${successCount} of ${opponents.length} bets. Some failed.</span>`;
        }
        
        setTimeout(() => {
            switchBetsSubTab('active');
        }, 1500);
        
    } else {
        const sideA = Array.from(document.querySelectorAll('.bet-side-a-check:checked')).map(c => c.value);
        const sideB = Array.from(document.querySelectorAll('.bet-side-b-check:checked')).map(c => c.value);
        const amount = document.getElementById('bet-amount').value;
        
        if (sideA.length === 0 || sideB.length === 0) {
            alert("Please select at least one player for Side A and Side B.");
            return;
        }
        
        const duplicates = sideA.filter(p => sideB.includes(p));
        if (duplicates.length > 0) {
            alert(`Player cannot be on both sides: ${duplicates.join(', ')}`);
            return;
        }
        
        btn.disabled = true;
        btn.innerHTML = '⏳ Submitting Team Bet...';
        status.style.display = 'block';
        status.innerHTML = '<span style="color: var(--text-secondary);">Sending bet to Google Sheet...</span>';
        
        let finalType = type;
        const isSplit = document.querySelector('input[name="wager-split"]:checked')?.value === 'Split';
        if (isSplit && (sideA.length > 1 || sideB.length > 1)) {
            finalType = `${type} (Split)`;
        }
        
        const payload = {
            action: 'create',
            playerA: sideA.join(', '),
            playerB: sideB.join(', '),
            type: oddsEnabled ? `${finalType} (${oddsRatioStr})` : finalType,
            event: eventName,
            amount: amount,
            quote: quote
        };
        
        try {
            await fetch(APPS_SCRIPT_URL, {
                method: 'POST',
                mode: 'no-cors',
                headers: { 'Content-Type': 'text/plain' },
                body: JSON.stringify(payload)
            });
            
            delete googleSheetsCache['SIDE_BETS'];
            
            status.innerHTML = '<span style="color: var(--accent-green); font-weight: 700;">✅ Team Bet Logged Successfully!</span>';
            playGamblingProblemLine();
            setTimeout(() => {
                switchBetsSubTab('active');
            }, 1200);
        } catch (err) {
            console.error("Error submitting team bet:", err);
            status.innerHTML = `<span style="color: var(--accent-red);">⚠️ Error: ${err.message}. Please check connection.</span>`;
            btn.disabled = false;
            btn.innerHTML = '🎰 Create Side Bet';
        }
    }
}

// Render Historical Bets and Money Board Leaderboard
async function renderHistoryBets(container) {
    container.innerHTML = `
        <div style="text-align: center; color: var(--text-secondary); padding: 3rem;">
            <span class="loading-spinner">⏳</span> Loading wagers history...
        </div>
    `;
    
    try {
        await loadSideBets();
    } catch (e) {
        console.error("Error loading stats:", e);
    }
    
    const completedBets = sideBetsData.filter(b => b.paid === 'Yes');
    
    // Sort Completed Bets: newest first
    completedBets.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    
    // Net Earnings calculator
    const netEarnings = {};
    cupData.lifetime.forEach(p => {
        netEarnings[p.PlayerName] = 0;
    });
    
    // Add up resolved bets earnings
    const resolvedBets = sideBetsData.filter(b => b.winner !== 'Pending');
    resolvedBets.forEach(b => {
        const sideA = b.playerA.split(',').map(n => n.trim()).filter(n => n);
        const sideB = b.playerB.split(',').map(n => n.trim()).filter(n => n);
        const amount = b.amount;
        const winnerStr = b.winner.trim();
        
        const isSplit = b.type.endsWith('(Split)');
        
        sideA.forEach(p => { if (p && p.trim().toLowerCase() !== 'group pot' && netEarnings[p] === undefined) netEarnings[p] = 0; });
        sideB.forEach(p => { if (p && p.trim().toLowerCase() !== 'group pot' && netEarnings[p] === undefined) netEarnings[p] = 0; });
        
        if (winnerStr === 'Tie') return;
        
        if (b.type === 'Group Pot') {
            const winners = winnerStr.split(',').map(n => n.trim()).filter(n => n);
            if (winners.length === 0 || winners.includes('Pending')) return;
            
            const totalPot = sideA.length * amount;
            const winShare = totalPot / winners.length;
            
            sideA.forEach(p => {
                if (winners.includes(p)) {
                    netEarnings[p] += (winShare - amount);
                } else {
                    netEarnings[p] -= amount;
                }
            });
            return;
        }
        
        const sideAWins = (winnerStr === b.playerA.trim() || sideA.includes(winnerStr));
        const sideBWins = (winnerStr === b.playerB.trim() || sideB.includes(winnerStr));
        
        const oddsVal = b.odds ? parseFloat(b.odds) : 1.0;
        
        if (sideAWins) {
            const payout = amount * oddsVal;
            if (isSplit) {
                const winShare = payout / sideA.length;
                const loseShare = payout / sideB.length;
                sideA.forEach(p => netEarnings[p] += winShare);
                sideB.forEach(p => netEarnings[p] -= loseShare);
            } else {
                sideA.forEach(p => netEarnings[p] += payout * sideB.length);
                sideB.forEach(p => netEarnings[p] -= payout * sideA.length);
            }
        } else if (sideBWins) {
            if (isSplit) {
                const winShare = amount / sideB.length;
                const loseShare = amount / sideA.length;
                sideB.forEach(p => netEarnings[p] += winShare);
                sideA.forEach(p => netEarnings[p] -= loseShare);
            } else {
                sideB.forEach(p => netEarnings[p] += amount * sideA.length);
                sideA.forEach(p => netEarnings[p] -= amount * sideB.length);
            }
        }
    });
    
    let leaderboard = Object.entries(netEarnings)
        .map(([name, val]) => ({ name, val }))
        .filter(item => {
            if (item.name && item.name.trim().toLowerCase() === 'group pot') return false;
            if (item.val !== 0) return true;
            return sideBetsData.some(b => {
                const sA = b.playerA.split(',').map(n => n.trim());
                const sB = b.playerB.split(',').map(n => n.trim());
                return sA.includes(item.name) || sB.includes(item.name);
            });
        });
        
    leaderboard.sort((a,b) => b.val - a.val);
    
    let statsHtml = `
        <div class="bet-stats-container">
            <div>
                <h3 style="font-family: 'Outfit', sans-serif; font-size: 1.3rem; margin-bottom: 1.25rem; color: var(--text-primary);">💰 Net Earnings Leaderboard</h3>
                <div class="bet-leaderboard-grid">
    `;
    
    if (leaderboard.length === 0) {
        statsHtml += `
            <div style="grid-column: 1 / -1; color: var(--text-secondary); font-style: italic;">
                No side wagers resolved yet. Standings will build once a bet is settled!
            </div>
        `;
    } else {
        leaderboard.forEach(item => {
            let earningsClass = item.val > 0 ? 'positive' : item.val < 0 ? 'negative' : 'neutral';
            let prefix = item.val > 0 ? '+$' : item.val < 0 ? '-$' : '$';
            let valDisplay = prefix + Math.abs(item.val).toFixed(0);
            
            statsHtml += `
                <div class="bet-leaderboard-card">
                    <span class="bet-leaderboard-name">${item.name}</span>
                    <span class="bet-leaderboard-value ${earningsClass}">${valDisplay}</span>
                </div>
            `;
        });
    }
    
    statsHtml += `
                </div>
            </div>
            
            <div style="margin-top: 1.5rem;">
                <h3 style="font-family: 'Outfit', sans-serif; font-size: 1.3rem; margin-bottom: 1.25rem; color: var(--text-primary);">📜 Completed & Settled Bets</h3>
    `;
    
    if (completedBets.length === 0) {
        statsHtml += `
            <p style="color: var(--text-secondary); font-style: italic; padding: 3rem; text-align: center; border: 1px dashed var(--border-color); border-radius: 16px;">
                No historical wagers marked settled yet.
            </p>
        `;
    } else {
        statsHtml += `<div class="bets-grid">`;
        completedBets.forEach(b => {
            const isGroup = b.type === 'Group Pot';
            const participants = isGroup ? b.playerA.split(',').map(n => n.trim()).filter(n => n) : [];
            
            let eventLabel = isGroup ? `🎮 ${b.event}` : (b.type === 'Cup' ? `🏆 ${b.event}` : `🎮 ${b.event}`);
            let dateStr = formatBetDate(b.timestamp);
            
            let oddsDisplay = '';
            if (b.odds && parseFloat(b.odds) !== 1.0) {
                oddsDisplay = `<span style="font-size: 0.75rem; color: var(--accent-cyan); font-weight: 700; margin-left: 0.4rem; padding: 0.15rem 0.35rem; background: hsla(180, 100%, 48%, 0.1); border-radius: 4px; border: 1px solid hsla(180, 100%, 48%, 0.2);">🎲 ${b.oddsRatio || (b.odds.toFixed(1) + ':1')}</span>`;
            }
            
            let matchupHtml = '';
            if (isGroup) {
                matchupHtml = `
                    <div style="display: flex; flex-direction: column; width: 100%; text-align: left; margin: 0.5rem 0;">
                        <span style="font-weight: 700; color: var(--text-primary); font-size: 1.05rem;">👥 Group Pot</span>
                        <span style="font-size: 0.82rem; color: var(--text-secondary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-top: 0.2rem;" title="${b.playerA}">${b.playerA}</span>
                    </div>
                `;
            } else {
                matchupHtml = `
                    <div class="bet-matchup">
                        <span class="bet-player" title="${b.playerA}">${b.playerA}</span>
                        <span class="bet-vs">VS</span>
                        <span class="bet-player" style="text-align: right;" title="${b.playerB}">${b.playerB}</span>
                    </div>
                `;
            }
            
            let amountValDisplay = isGroup ? `$${b.amount.toFixed(0)} buy-in (Pot: $${(b.amount * participants.length).toFixed(0)})` : `$${b.amount.toFixed(0)}`;
            
            statsHtml += `
                <div class="bet-card completed-bet" onclick="showBetDetails('${b.id}')" style="cursor: pointer;">
                    <div class="bet-header">
                        <span>${isGroup ? 'Group' : b.type} Bet</span>
                        <span class="bet-status-badge paid">Settled & Paid</span>
                    </div>
                    ${matchupHtml}
                    <div style="color: var(--accent-green); font-weight: 700; margin-top: 0.25rem;">🏆 Winner: ${b.winner}</div>
                    <div class="bet-details-row">
                        <span class="bet-event">${eventLabel}</span>
                        <span class="bet-amount" style="color: var(--text-secondary);">${amountValDisplay}${oddsDisplay}</span>
                    </div>
                    ${dateStr ? `<div style="font-size: 0.8rem; color: var(--text-secondary); opacity: 0.6; display: flex; align-items: center; gap: 0.25rem; margin-top: -0.5rem; margin-bottom: 0.25rem;">📅 Created: ${dateStr}</div>` : ''}
                    ${b.quote ? `<div class="bet-quote-bubble">"${b.quote}"</div>` : ''}
                </div>
            `;
        });
        statsHtml += `</div>`;
    }
    
    statsHtml += `
            </div>
        </div>
    `;
    container.innerHTML = statsHtml;
}

// Prompt winner dialog for manual wagers
function triggerResolveBet(betId, playerA, playerB) {
    const choice = prompt(`Choose the winner:\n1. ${playerA}\n2. ${playerB}\n3. Tie / Push\n\nEnter 1, 2, or 3:`);
    if (!choice) return;
    
    let winner = '';
    if (choice === '1') {
        winner = playerA;
    } else if (choice === '2') {
        winner = playerB;
    } else if (choice === '3') {
        winner = 'Tie';
    } else {
        alert("Invalid input! Wager not resolved.");
        return;
    }
    
    executeBetAction({
        action: 'resolve',
        id: betId,
        winner: winner
    });
}

function triggerMarkPaid(betId) {
    if (!confirm("Are you sure this bet has been paid in cash and is complete?")) return;
    executeBetAction({
        action: 'markPaid',
        id: betId
    });
}

// Background post updater for Google Sheets Web App
async function executeBetAction(payload) {
    const container = document.getElementById('bets-sub-content');
    container.innerHTML = `
        <div style="text-align: center; color: var(--text-secondary); padding: 3rem;">
            <span class="loading-spinner">⏳</span> Submitting changes to Google Sheets...
        </div>
    `;
    
    try {
        await fetch(APPS_SCRIPT_URL, {
            method: 'POST',
            mode: 'no-cors',
            headers: {
                'Content-Type': 'text/plain'
            },
            body: JSON.stringify(payload)
        });
        
        // Clear local cache for side bets
        delete googleSheetsCache['SIDE_BETS'];
        
        // Reload
        setTimeout(() => {
            renderSideBetsBoard();
        }, 1000);
    } catch (err) {
        console.error("Error executing bet action:", err);
        alert(`Error communicating with Sheets: ${err.message}`);
        renderSideBetsBoard();
    }
}

// Show Bet details modal overlay
function showBetDetails(id) {
    const b = sideBetsData.find(x => x.id === id);
    if (!b) return;
    
    const isGroup = b.type === 'Group Pot';
    const sideA = b.playerA.split(',').map(n => n.trim()).filter(n => n);
    const sideB = b.playerB.split(',').map(n => n.trim()).filter(n => n);
    
    let sideAHtml = '';
    let sideBHtml = '';
    let groupParticipantsHtml = '';
    
    if (isGroup) {
        groupParticipantsHtml = sideA.map(name => `
            <div style="font-weight: 700; font-size: 1.15rem; color: var(--text-primary); cursor: pointer; text-decoration: underline; text-decoration-color: var(--border-color); text-align: center; margin-bottom: 0.25rem;" onclick="closeBetDetails(); showPlayerCard('${name.replace(/'/g, "\\'")}')">👤 ${name}</div>
        `).join('');
    } else {
        sideAHtml = sideA.map(name => `
            <div style="font-weight: 700; font-size: 1.15rem; color: var(--text-primary); cursor: pointer; text-decoration: underline; text-decoration-color: var(--border-color);" onclick="closeBetDetails(); showPlayerCard('${name.replace(/'/g, "\\'")}')">👤 ${name}</div>
        `).join('');
        
        sideBHtml = sideB.map(name => `
            <div style="font-weight: 700; font-size: 1.15rem; color: var(--text-primary); cursor: pointer; text-decoration: underline; text-decoration-color: var(--border-color);" onclick="closeBetDetails(); showPlayerCard('${name.replace(/'/g, "\\'")}')">👤 ${name}</div>
        `).join('');
    }
    
    let isSplit = b.type.endsWith('(Split)');
    let modeLabel = isGroup ? 'Group Pot 👥' : (isSplit ? 'Total Pot Split 👥' : 'Per Person 💵');
    let statusLabel = b.paid === 'Yes' ? 'Settled & Paid' : b.winner !== 'Pending' ? 'Resolved — Awaiting Payout' : 'Active Wager';
    let dateStr = formatBetDate(b.timestamp);
    
    let actionHtml = '';
    if (b.paid !== 'Yes') {
        if (b.winner === 'Pending') {
            if (isGroup) {
                actionHtml = `
                    <button class="bet-btn resolve" style="padding: 0.8rem; font-size: 1rem; width: 100%; border-radius: 12px; margin-top: 1rem;" onclick="closeBetDetails(); showSettleGroupModal('${b.id}')">🎯 Settle Winner(s)</button>
                `;
            } else {
                actionHtml = `
                    <button class="bet-btn resolve" style="padding: 0.8rem; font-size: 1rem; width: 100%; border-radius: 12px; margin-top: 1rem;" onclick="closeBetDetails(); triggerResolveBet('${b.id}', '${b.playerA.replace(/'/g, "\\'")}', '${b.playerB.replace(/'/g, "\\'")}')">🎯 Resolve Winner</button>
                `;
            }
        } else {
            if (!isGroup) {
                actionHtml = `
                    <button class="bet-btn paid-btn" style="padding: 0.8rem; font-size: 1rem; width: 100%; border-radius: 12px; margin-top: 1rem;" onclick="closeBetDetails(); triggerMarkPaid('${b.id}')">💵 Mark Paid & Completed</button>
                `;
            }
        }
    }
    
    let winnerHtml = b.winner === 'Pending' ? '' : `
        <div style="background: hsla(145, 80%, 45%, 0.08); border: 1px solid var(--accent-green); padding: 0.75rem; border-radius: 12px; text-align: center; margin-top: 0.5rem; margin-bottom: 0.5rem;">
            <span style="color: var(--accent-green); font-weight: 800; font-size: 1.1rem;">🏆 Winner${b.winner.includes(',') ? 's' : ''}: ${b.winner}</span>
        </div>
    `;

    let oddsBlockHtml = '';
    if (b.odds && parseFloat(b.odds) !== 1.0 && !isGroup) {
        const winAmount = b.amount * parseFloat(b.odds);
        
        let sideALabel = sideA.length > 0 ? sideA.join(', ') : 'Side A';
        let sideBLabel = sideB.length > 0 ? sideB.join(', ') : 'Side B';
        
        let payoutDetails = '';
        if (sideA.length > 1 || sideB.length > 1) {
            if (isSplit) {
                payoutDetails = `
                    • If <strong>${sideALabel}</strong> wins: They split a total payout of <strong>$${winAmount.toFixed(0)}</strong> (paid by ${sideBLabel}).<br>
                    • If <strong>${sideBLabel}</strong> wins: They split a total payout of <strong>$${b.amount.toFixed(0)}</strong> (paid by ${sideALabel}).
                `;
            } else {
                const totalAWin = winAmount * sideB.length;
                const totalBWin = b.amount * sideA.length;
                payoutDetails = `
                    • If <strong>${sideALabel}</strong> wins: Each player on ${sideALabel} wins $${winAmount.toFixed(0)} from each player on ${sideBLabel} (total of <strong>$${totalAWin.toFixed(0)}</strong> collected).<br>
                    • If <strong>${sideBLabel}</strong> wins: Each player on ${sideBLabel} wins $${b.amount.toFixed(0)} from each player on ${sideA} (total of <strong>$${totalBWin.toFixed(0)}</strong> collected).
                `;
            }
        } else {
            payoutDetails = `
                • If <strong>${sideALabel}</strong> wins: <strong>${sideBLabel}</strong> pays them <strong>$${winAmount.toFixed(0)}</strong>.<br>
                • If <strong>${sideBLabel}</strong> wins: <strong>${sideALabel}</strong> pays them <strong>$${b.amount.toFixed(0)}</strong>.
            `;
        }
        
        oddsBlockHtml = `
            <div style="background: hsla(180, 100%, 48%, 0.05); border: 1px dashed var(--accent-cyan); padding: 0.75rem 0.9rem; border-radius: 12px; font-size: 0.85rem; line-height: 1.4; margin-bottom: 1rem;">
                <div style="font-weight: 700; color: var(--accent-cyan); margin-bottom: 0.35rem; display: flex; align-items: center; gap: 0.25rem;">🎲 Asymmetric Odds Terms (${b.oddsRatio || (b.odds.toFixed(1) + ':1')})</div>
                <div style="color: var(--text-secondary);">${payoutDetails}</div>
            </div>
        `;
    }

    // Matchup/participants card block
    let matchupCardHtml = '';
    if (isGroup) {
        matchupCardHtml = `
            <div style="background: hsla(222, 20%, 15%, 0.5); padding: 1.25rem; border-radius: 16px; border: 1px solid var(--border-color); display: flex; flex-direction: column; gap: 0.5rem; margin-bottom: 1rem;">
                <div style="font-size: 0.75rem; text-transform: uppercase; color: var(--text-secondary); letter-spacing: 0.5px; text-align: center;">Group Participants</div>
                ${groupParticipantsHtml}
            </div>
        `;
    } else {
        matchupCardHtml = `
            <div style="background: hsla(222, 20%, 15%, 0.5); padding: 1.25rem; border-radius: 16px; border: 1px solid var(--border-color); display: flex; flex-direction: column; gap: 0.75rem; margin-bottom: 1rem;">
                <div style="display: flex; flex-direction: column; gap: 0.4rem; text-align: center;">
                    <div style="font-size: 0.75rem; text-transform: uppercase; color: var(--text-secondary); letter-spacing: 0.5px;">Side A</div>
                    ${sideAHtml}
                </div>
                
                <div style="text-align: center; font-weight: 800; color: var(--text-secondary); font-size: 0.9rem; margin: 0.25rem 0;">⚡ VS ⚡</div>
                
                <div style="display: flex; flex-direction: column; gap: 0.4rem; text-align: center;">
                    <div style="font-size: 0.75rem; text-transform: uppercase; color: var(--text-secondary); letter-spacing: 0.5px;">Side B</div>
                    ${sideBHtml}
                </div>
            </div>
        `;
    }

    // Group payment checklist
    let groupChecklistHtml = '';
    if (isGroup && b.winner !== 'Pending' && b.paid !== 'Yes') {
        groupChecklistHtml = `
            <div style="margin-top: 0.5rem; border-top: 1px solid var(--border-color); padding-top: 1rem; margin-bottom: 1rem;">
                <div style="font-size: 0.8rem; text-transform: uppercase; color: var(--accent-gold); font-weight: 700; letter-spacing: 0.5px; margin-bottom: 0.5rem; text-align: center;">💵 Cash Payout Checklist</div>
                <div style="display: flex; flex-direction: column; gap: 0.4rem;">
        `;
        
        sideA.forEach(p => {
            const isWinner = b.winner.split(',').map(n => n.trim()).includes(p);
            const hasPaid = b.paidPlayers.includes(p);
            const labelSuffix = isWinner ? ' <span style="color: var(--accent-green); font-size: 0.75rem;">(Winner)</span>' : '';
            
            const checkedAttr = hasPaid ? 'checked' : '';
            
            groupChecklistHtml += `
                <div style="display: flex; align-items: center; padding: 0.6rem 0.8rem; background: hsla(222, 20%, 15%, 0.3); border: 1px solid var(--border-color); border-radius: 10px; transition: background 0.2s;">
                    <label style="display: flex; align-items: center; gap: 0.4rem; font-weight: 600; cursor: pointer; width: 100%;">
                        <input type="checkbox" class="group-payment-check" ${checkedAttr} value="${p.replace(/"/g, '&quot;')}" style="width: 16px; height: 16px; cursor: pointer;">
                        <span>${p}${labelSuffix}</span>
                    </label>
                </div>
            `;
        });
        
        groupChecklistHtml += `
                </div>
                <button class="action-btn" onclick="saveGroupPlayerPayments('${b.id}')" style="width: 100%; margin-top: 0.8rem; padding: 0.6rem; border-radius: 10px; font-weight: 700; font-size: 0.9rem;">💾 Save Payments</button>
                <span style="font-size: 0.73rem; color: var(--text-secondary); margin-top: 0.6rem; display: block; text-align: center; line-height: 1.3;">
                    * Check off players as they pay cash, then click Save. The bet settles automatically when everyone has paid.
                </span>
            </div>
        `;
    }
    
    let wagerLabel = isGroup ? 'BUY-IN' : 'WAGER';
    let amountValDisplay = `$${b.amount.toFixed(0)}`;
    
    const inner = document.getElementById('bet-details-inner');
    inner.innerHTML = `
        <div class="card-header-block" style="margin-bottom: 1.25rem;">
            <div class="card-name" style="font-size: 1.5rem;">🎰 Wager Details</div>
            <div class="card-nickname" style="color: var(--accent-cyan); font-weight: 700; margin-top: 0.25rem;">Status: ${statusLabel}</div>
        </div>
        
        ${matchupCardHtml}
        
        ${winnerHtml}
        
        <div class="sports-stats-grid" style="grid-template-columns: 1fr 1fr; margin-top: 0.5rem; margin-bottom: 1rem;">
            <div class="sports-stat-col" style="background: hsla(222, 20%, 15%, 0.4); padding: 0.75rem; border-radius: 12px; border: 1px solid var(--border-color);">
                <span class="sports-stat-lbl">${wagerLabel}</span>
                <span class="sports-stat-val" style="color: var(--accent-gold); font-size: 1.3rem;">${amountValDisplay}</span>
            </div>
            <div class="sports-stat-col" style="background: hsla(222, 20%, 15%, 0.4); padding: 0.75rem; border-radius: 12px; border: 1px solid var(--border-color);">
                <span class="sports-stat-lbl">MODE</span>
                <span class="sports-stat-val" style="font-size: 0.95rem; font-weight: 700; margin-top: 0.2rem; text-transform: none;">${modeLabel}</span>
            </div>
        </div>
        
        ${oddsBlockHtml}
        
        ${groupChecklistHtml}
        
        <div style="display: flex; flex-direction: column; gap: 0.5rem; font-size: 0.95rem; margin-bottom: 1rem; border-bottom: 1px solid var(--border-color); padding-bottom: 1rem;">
            <div><span style="color: var(--text-secondary); font-weight: 600;">Game/Event:</span> <span style="font-weight: 700; color: var(--text-primary);">${b.event}</span></div>
            ${dateStr ? `<div><span style="color: var(--text-secondary); font-weight: 600;">Logged:</span> <span style="color: var(--text-primary); font-weight: 700;">${dateStr}</span></div>` : ''}
        </div>
        
        ${b.quote ? `
            <div class="bet-quote-bubble" style="margin-top: 0.5rem; margin-bottom: 1rem; background: var(--bg-sidebar); border-left: 4px solid var(--accent-cyan);">
                <strong style="color: var(--text-secondary); font-size: 0.8rem; text-transform: uppercase;">Note / Terms:</strong><br>
                <span style="font-style: italic; color: var(--text-primary);">"${b.quote}"</span>
            </div>
        ` : ''}
        
        ${actionHtml}
    `;
    
    document.getElementById('bet-details-modal').classList.add('active');
}

function closeBetDetails(event) {
    if (event) event.stopPropagation();
    const modal = document.getElementById('bet-details-modal');
    if (modal) modal.classList.remove('active');
}

// Show Settle Group Pot Modal
function showSettleGroupModal(id) {
    const b = sideBetsData.find(x => x.id === id);
    if (!b) return;
    
    const participants = b.playerA.split(',').map(n => n.trim()).filter(n => n);
    
    let checklistHtml = '';
    participants.forEach((p, idx) => {
        checklistHtml += `
            <label style="display: flex; align-items: center; gap: 0.5rem; padding: 0.5rem; background: var(--bg-sidebar); border: 1px solid var(--border-color); border-radius: 8px; cursor: pointer; font-weight: 600;">
                <input type="checkbox" class="settle-winner-check" value="${p}" style="width: 18px; height: 18px;"> ${p}
            </label>
        `;
    });
    
    const inner = document.getElementById('settle-group-inner');
    inner.innerHTML = `
        <div class="card-header-block" style="margin-bottom: 0.5rem;">
            <div class="card-name" style="font-size: 1.4rem;">🎯 Settle Group Pot</div>
            <div class="card-nickname" style="color: var(--accent-cyan); font-weight: 700; margin-top: 0.25rem;">Select Winner(s) (supports split pots)</div>
        </div>
        
        <div style="font-size: 0.85rem; color: var(--text-secondary); margin-bottom: 0.25rem;">
            Game: <strong>${b.event}</strong> &middot; Pot size: <strong>$${(b.amount * participants.length).toFixed(0)}</strong>
        </div>
        
        <div style="display: flex; flex-direction: column; gap: 0.5rem; max-height: 240px; overflow-y: auto; padding-right: 0.25rem;">
            ${checklistHtml}
        </div>
        
        <button class="action-btn" onclick="confirmSettleGroup('${b.id}')" style="width: 100%; padding: 0.8rem; border-radius: 12px; font-weight: 700; margin-top: 0.5rem;">🎯 Confirm Winner(s)</button>
    `;
    
    document.getElementById('settle-group-modal').classList.add('active');
}

function closeSettleGroup(event) {
    if (event) event.stopPropagation();
    const modal = document.getElementById('settle-group-modal');
    if (modal) modal.classList.remove('active');
}

async function confirmSettleGroup(id) {
    const checked = Array.from(document.querySelectorAll('.settle-winner-check:checked')).map(c => c.value);
    if (checked.length === 0) {
        alert("Please select at least one winner.");
        return;
    }
    
    const winnerString = checked.join(', ');
    closeSettleGroup();
    
    // We update the winner cell to "Winners || PAID: " (initially empty payment list)
    executeBetAction({
        action: 'resolve',
        id: id,
        winner: winnerString + " || PAID: "
    });
}

async function saveGroupPlayerPayments(betId) {
    const b = sideBetsData.find(x => x.id === betId);
    if (!b) return;
    
    const checkboxes = Array.from(document.querySelectorAll('.group-payment-check'));
    const paidPlayers = checkboxes.filter(cb => cb.checked).map(cb => cb.value);
    
    const participants = b.playerA.split(',').map(n => n.trim()).filter(n => n);
    const allPaid = participants.every(p => paidPlayers.includes(p));
    
    const newWinnerCellValue = b.winner + " || PAID: " + paidPlayers.join(', ');
    
    delete googleSheetsCache['SIDE_BETS'];
    
    const container = document.getElementById('bet-details-inner');
    if (container) {
        container.innerHTML = `
            <div style="text-align: center; color: var(--text-secondary); padding: 3rem;">
                <span class="loading-spinner">⏳</span> Updating payment checklist in Google Sheets...
            </div>
        `;
    }
    
    try {
        await fetch(APPS_SCRIPT_URL, {
            method: 'POST',
            mode: 'no-cors',
            headers: { 'Content-Type': 'text/plain' },
            body: JSON.stringify({ action: 'resolve', id: betId, winner: newWinnerCellValue })
        });
        
        if (allPaid) {
            await fetch(APPS_SCRIPT_URL, {
                method: 'POST',
                mode: 'no-cors',
                headers: { 'Content-Type': 'text/plain' },
                body: JSON.stringify({ action: 'markPaid', id: betId })
            });
        }
        
        // Reload Board
        setTimeout(() => {
            closeBetDetails();
            renderSideBetsBoard();
        }, 1000);
    } catch (e) {
        console.error("Group payment save failed:", e);
        alert("Failed to update payment checklist: " + e.message);
        renderSideBetsBoard();
    }
}

// ----------------- 🎟️ TOURNAMENT CHECK-IN & SESSION MANAGEMENT -----------------
let checkInLoading = false;
let checkInPayoutsData = [];

// Fetch and load sessions from Google Sheets
async function loadCheckInSessions() {
    checkInLoading = true;
    try {
        // Clear caches to force fresh fetch
        delete googleSheetsCache['CHECK_IN_SESSIONS'];
        delete googleSheetsCache['CHECK_IN'];
        delete googleSheetsCache['PAYOUTS'];
        
        const sessRows = await fetchGoogleSheetCSV('CHECK_IN_SESSIONS');
        const checkInRows = await fetchGoogleSheetCSV('CHECK_IN');
        const payoutRows = await fetchGoogleSheetCSV('PAYOUTS');

        if (sessRows && sessRows.length > 1) {
            const headers = sessRows[0].map(h => h.trim());
            const dataRows = sessRows.slice(1);
            
            const idIdx = headers.indexOf('Session ID');
            const tourneyIdx = headers.indexOf('Tournament');
            const yearIdx = headers.indexOf('Year');
            const feeIdx = headers.indexOf('Entry Fee');
            const targetIdx = headers.indexOf('Bounty Target');
            const amtIdx = headers.indexOf('Bounty Amount');
            const winnerIdx = headers.indexOf('Bounty Winner');
            const statusIdx = headers.indexOf('Status');
            const timeIdx = headers.indexOf('Created At');
            
            checkInSessionsData = dataRows.map(row => ({
                sessionId: row[idIdx],
                tournament: row[tourneyIdx],
                year: parseInt(row[yearIdx]) || 2026,
                entryFee: parseFloat(row[feeIdx]) || 0.0,
                bountyTarget: row[targetIdx] || '',
                bountyAmount: parseFloat(row[amtIdx]) || 0.0,
                bountyWinner: row[winnerIdx] || '',
                status: row[statusIdx] || 'draft',
                createdAt: row[timeIdx]
            })).filter(s => s.sessionId && s.status && s.status.toLowerCase() !== 'deleted');
        } else {
            checkInSessionsData = [];
        }

        if (checkInRows && checkInRows.length > 1) {
            const headers = checkInRows[0].map(h => h.trim());
            const dataRows = checkInRows.slice(1);
            
            const sIdIdx = headers.indexOf('Session ID');
            const tourneyIdx = headers.indexOf('Tournament');
            const yearIdx = headers.indexOf('Year');
            const playerIdx = headers.indexOf('Player');
            const feePaidIdx = headers.indexOf('Entry Fee Paid');
            const freeIdx = headers.indexOf('Free Entry');
            const removedIdx = headers.indexOf('Removed');
            const timeIdx = headers.indexOf('Checked In At');
            
            checkInPlayersData = dataRows.map(row => ({
                sessionId: row[sIdIdx],
                tournament: row[tourneyIdx],
                year: parseInt(row[yearIdx]) || 2026,
                player: row[playerIdx],
                entryFeePaid: parseFloat(row[feePaidIdx]) || 0.0,
                freeEntry: row[freeIdx] || '',
                removed: row[removedIdx] || '',
                checkedInAt: row[timeIdx]
            })).filter(ci => ci.sessionId && ci.player && ci.removed !== 'Yes');
        } else {
            checkInPlayersData = [];
        }
        
        if (payoutRows && payoutRows.length > 1) {
            const headers = payoutRows[0].map(h => h.trim());
            const dataRows = payoutRows.slice(1);
            
            const sIdIdx = headers.indexOf('Session ID');
            const tourneyIdx = headers.indexOf('Tournament');
            const yearIdx = headers.indexOf('Year');
            const playerIdx = headers.indexOf('Player');
            const amountIdx = headers.indexOf('Amount Won');
            const typeIdx = headers.indexOf('Payout Type');
            const timeIdx = headers.indexOf('Timestamp');
            
            checkInPayoutsData = dataRows.map(row => ({
                sessionId: row[sIdIdx],
                tournament: row[tourneyIdx],
                year: parseInt(row[yearIdx]) || 2026,
                player: row[playerIdx],
                amountWon: parseFloat(row[amountIdx]) || 0.0,
                payoutType: row[typeIdx],
                timestamp: row[timeIdx]
            })).filter(p => p.sessionId && p.player);
        } else {
            checkInPayoutsData = [];
        }

    } catch (e) {
        console.error("Error loading check-in data:", e);
    } finally {
        checkInLoading = false;
        renderCheckInWidget();
        if (activeCheckInSession) {
            renderActiveSession(activeCheckInSession);
        }
        // If we are on the tournaments tab and not in an active session, render the tournaments leaderboard and the winnings ledger underneath
        if (currentTab === 'tournaments' && !activeCheckInSession) {
            renderTournamentTable();
        }
    }
}

// Render check-in widget in sidebar
function renderCheckInWidget() {
    const container = document.getElementById('checkin-widget-container');
    if (!container) return;
    
    if (checkInLoading && checkInSessionsData.length === 0) {
        container.innerHTML = `
            <div class="card widget-card">
                <div class="card-header"><h3>🎟️ Event Check-In</h3></div>
                <div class="widget-body" style="text-align: center; color: var(--text-secondary); padding: 1.5rem;">
                    <span class="loading-spinner">⏳</span> Loading sessions...
                </div>
            </div>
        `;
        return;
    }
    
    let activeSessionsHtml = '';
    const activeSessions = checkInSessionsData.filter(s => s.status !== 'complete');
    
    if (activeSessions.length > 0) {
        activeSessions.forEach(s => {
            const participants = checkInPlayersData.filter(p => p.sessionId === s.sessionId);
            const totalCollected = participants.reduce((sum, p) => sum + p.entryFeePaid, 0);
            const bountyTargetsList = s.bountyTarget ? s.bountyTarget.split(',').map(n => n.trim()).filter(Boolean) : [];
            const activePool = totalCollected - (s.bountyAmount * bountyTargetsList.length);
            const formattedDate = formatBetDate(s.createdAt) || 'Recent';
            
            activeSessionsHtml += `
                <div onclick="openCheckInSession('${s.sessionId}')" style="padding: 0.6rem 0.8rem; background: hsla(222, 20%, 15%, 0.4); border: 1px solid var(--border-color); border-radius: 10px; cursor: pointer; transition: border-color 0.2s; text-align: left; display: flex; flex-direction: column; gap: 0.2rem; margin-bottom: 0.5rem;">
                    <div style="display: flex; justify-content: space-between; font-weight: 700; font-size: 0.85rem; color: var(--text-primary);">
                        <span>🏆 ${s.tournament}</span>
                        <span style="color: var(--accent-cyan); font-size: 0.75rem; text-transform: uppercase;">${s.status}</span>
                    </div>
                    <div style="font-size: 0.78rem; color: var(--text-secondary); display: flex; justify-content: space-between;">
                        <span>Pool: $${activePool.toFixed(0)} (${participants.length} in)</span>
                        <span>${formattedDate}</span>
                    </div>
                </div>
            `;
        });
    } else {
        activeSessionsHtml = `
            <p style="font-style: italic; color: var(--text-secondary); font-size: 0.82rem; padding: 0.5rem 0; text-align: center;">
                No active event check-ins.
            </p>
        `;
    }


    
    container.innerHTML = `
        <div class="card widget-card">
            <div class="card-header">
                <h3>🎟️ Event Check-In</h3>
            </div>
            <div class="widget-body">
                <p style="font-size: 0.85rem; color: var(--text-secondary); margin-bottom: 0.75rem;">
                    Create a check-in sheet, track director free entries, bounties, and overall prize pools.
                </p>
                <button class="action-btn" onclick="showCreateSessionModal()" style="width: 100%; margin-bottom: 1.25rem;">➕ Create Event</button>
                
                <h4 style="font-size: 0.8rem; text-transform: uppercase; color: var(--accent-gold); letter-spacing: 0.5px; margin-bottom: 0.5rem; font-weight: 700;">Active Sessions</h4>
                <div style="max-height: 200px; overflow-y: auto; display: flex; flex-direction: column; gap: 0.25rem;">
                    ${activeSessionsHtml}
                </div>
            </div>
        </div>
    `;
}

function showCreateSessionModal() {
    const modal = document.getElementById('create-session-modal');
    if (!modal) return;
    
    // Populate tournament dropdown
    const select = document.getElementById('session-tournament-select');
    if (select && select.children.length === 0) {
        MAIN_TOURNAMENTS.forEach(t => {
            const opt = document.createElement('option');
            opt.value = t;
            opt.textContent = t;
            select.appendChild(opt);
        });
    }
    
    // Populate bounty target checklist
    const targetList = document.getElementById('session-bounty-targets-list');
    if (targetList) {
        targetList.innerHTML = '';
        const names = cupData.lifetime.map(p => p.PlayerName).sort((a,b) => a.localeCompare(b));
        names.forEach(n => {
            targetList.innerHTML += `
                <label style="display: flex; align-items: center; gap: 0.4rem; font-size: 0.82rem; cursor: pointer; color: var(--text-primary); font-weight: 500;">
                    <input type="checkbox" class="session-bounty-target-check" value="${n.replace(/"/g, '&quot;')}" style="width: 14px; height: 14px; cursor: pointer;">
                    <span>${n}</span>
                </label>
            `;
        });
    }
    
    modal.classList.add('active');
}

function closeCreateSessionModal(event) {
    if (event) event.stopPropagation();
    const modal = document.getElementById('create-session-modal');
    if (modal) modal.classList.remove('active');
}

async function handleCreateSessionSubmit(e) {
    e.preventDefault();
    const btn = document.getElementById('btn-session-start');
    
    const tournament = document.getElementById('session-tournament-select').value;
    const entryFee = parseFloat(document.getElementById('session-entry-fee').value) || 0.0;
    const checkedBountyTargets = Array.from(document.querySelectorAll('.session-bounty-target-check:checked')).map(c => c.value);
    const bountyTarget = checkedBountyTargets.join(', ');
    const bountyAmount = parseFloat(document.getElementById('session-bounty-amount').value) || 0.0;
    
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '⏳ Creating Session...';
    }
    
    const payload = {
        action: 'create_session',
        tournament: tournament,
        entryFee: entryFee,
        bountyTarget: bountyTarget,
        bountyAmount: bountyAmount,
        status: 'draft',
        year: 2026
    };
    
    try {
        await fetch(APPS_SCRIPT_URL, {
            method: 'POST',
            mode: 'no-cors',
            headers: { 'Content-Type': 'text/plain' },
            body: JSON.stringify(payload)
        });
        
        delete googleSheetsCache['CHECK_IN_SESSIONS'];
        
        closeCreateSessionModal();
        document.getElementById('create-session-form').reset();
        
        setTimeout(async () => {
            await loadCheckInSessions();
            const sorted = [...checkInSessionsData].sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt));
            const newSess = sorted.find(s => s.tournament === tournament);
            if (newSess) {
                openCheckInSession(newSess.sessionId);
            }
        }, 1200);
        
    } catch (err) {
        console.error("Error creating session:", err);
        alert("Failed to create session: " + err.message);
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '🏁 Start Tourney';
        }
    }
}

function openCheckInSession(sessionId) {
    activeCheckInSession = sessionId;
    renderActiveSession(sessionId);
}

// Get player grade in tournament based on historical data
function getTourneyGradeForPlayer(playerName, tournamentName) {
    const allEntries = cupData.granular.filter(g => g['Player Name'] === playerName && g.Tournament === tournamentName.toUpperCase());
    if (allEntries.length === 0) {
        return { grade: 'N/A', gradeClass: 'grade-na', avgPts: 0.0, entries: 0 };
    }
    
    const totalPts = allEntries.reduce((sum, e) => sum + e['PC Points'], 0);
    const count = allEntries.length;
    const avg = totalPts / count;
    
    let grade = 'F';
    let gradeClass = 'grade-f';
    
    if (avg >= 16.0) { grade = 'A+'; gradeClass = 'grade-a'; }
    else if (avg >= 13.0) { grade = 'A'; gradeClass = 'grade-a'; }
    else if (avg >= 11.0) { grade = 'A-'; gradeClass = 'grade-a'; }
    else if (avg >= 9.5) { grade = 'B+'; gradeClass = 'grade-b'; }
    else if (avg >= 8.0) { grade = 'B'; gradeClass = 'grade-b'; }
    else if (avg >= 6.5) { grade = 'B-'; gradeClass = 'grade-b'; }
    else if (avg >= 5.0) { grade = 'C+'; gradeClass = 'grade-c'; }
    else if (avg >= 4.0) { grade = 'C'; gradeClass = 'grade-c'; }
    else if (avg >= 3.0) { grade = 'C-'; gradeClass = 'grade-c'; }
    else if (avg >= 2.0) { grade = 'D'; gradeClass = 'grade-d'; }
    else { grade = 'F'; gradeClass = 'grade-f'; }
    
    return { grade, gradeClass, avgPts: avg, entries: count };
}

// Render active session check-in panel
async function renderActiveSession(sessionId) {
    const s = checkInSessionsData.find(x => x.sessionId === sessionId);
    if (!s) return;
    
    const container = document.getElementById('leaderboard-table-container');
    if (!container) return;
    
    const highlights = document.getElementById('tournament-highlights-container');
    if (highlights) highlights.style.display = 'none';
    
    const participants = checkInPlayersData.filter(p => p.sessionId === sessionId);
    const totalCollected = participants.reduce((sum, p) => sum + p.entryFeePaid, 0);
    const bountyTargetsList = s.bountyTarget ? s.bountyTarget.split(',').map(n => n.trim()).filter(Boolean) : [];
    const activePool = totalCollected - (s.bountyAmount * bountyTargetsList.length);
    
    const checkedInNames = participants.map(p => p.player);
    const allRosterNames = cupData.lifetime.map(p => p.PlayerName).sort((a,b) => a.localeCompare(b));
    
    const veteranPlayers = [];
    const rookiePlayers = [];
    
    allRosterNames.forEach(name => {
        const histEntries = cupData.granular.filter(g => g['Player Name'] === name && g.Tournament === s.tournament.toUpperCase());
        if (histEntries.length > 0) {
            veteranPlayers.push(name);
        } else {
            rookiePlayers.push(name);
        }
    });
    
    let dropdownHtml = '<option value="" disabled selected>-- Select Player --</option>';
    dropdownHtml += '<optgroup label="Veterans (Played before)">';
    veteranPlayers.forEach(name => {
        const disabled = checkedInNames.includes(name) ? 'disabled style="color: var(--text-secondary); opacity: 0.5;"' : '';
        dropdownHtml += `<option value="${name.replace(/"/g, '&quot;')}" ${disabled}>${name}</option>`;
    });
    dropdownHtml += '</optgroup>';
    dropdownHtml += '<optgroup label="Rookies (New to event)">';
    rookiePlayers.forEach(name => {
        const disabled = checkedInNames.includes(name) ? 'disabled style="color: var(--text-secondary); opacity: 0.5;"' : '';
        dropdownHtml += `<option value="${name.replace(/"/g, '&quot;')}" ${disabled}>${name}</option>`;
    });
    dropdownHtml += '</optgroup>';
    
    let statusActionsHtml = '';
    if (s.status === 'draft') {
        statusActionsHtml = `
            <button class="bet-btn resolve" onclick="updateSessionStatus('${s.sessionId}', 'active')" style="padding: 0.4rem 0.6rem; font-size: 0.8rem;">🏁 Mark Active</button>
            <button class="bet-btn" onclick="deleteSession('${s.sessionId}')" style="padding: 0.4rem 0.6rem; font-size: 0.8rem; background: var(--accent-red); border-color: var(--accent-red); color: white;">🗑️ Delete Draft</button>
        `;
    } else if (s.status === 'active') {
        statusActionsHtml = `
            <button class="bet-btn resolve" onclick="updateSessionStatus('${s.sessionId}', 'draft')" style="padding: 0.4rem 0.6rem; font-size: 0.8rem; background: var(--bg-sidebar); border-color: var(--border-color); color: var(--text-secondary);">✏️ Make Draft</button>
            <button class="bet-btn paid-btn" onclick="showSettlePayoutsModal('${s.sessionId}')" style="padding: 0.4rem 0.6rem; font-size: 0.8rem; background: linear-gradient(135deg, var(--accent-gold), hsl(45, 100%, 40%)); color: var(--bg-sidebar); font-weight: 800;">🏆 Settle & Payout</button>
        `;
    }
    
    let participantsHtml = '';
    if (participants.length === 0) {
        participantsHtml = '<p style="color: var(--text-secondary); font-style: italic; padding: 1.5rem; text-align: center;">No players registered yet.</p>';
    } else {
        participantsHtml = `<div style="display: flex; flex-direction: column; gap: 0.5rem; margin-top: 1rem;">`;
        participants.forEach(p => {
            const bountyTargetsList = s.bountyTarget ? s.bountyTarget.split(',').map(n => n.trim()) : [];
            const isBountyTarget = bountyTargetsList.includes(p.player);
            const stats = getTourneyGradeForPlayer(p.player, s.tournament);
            
            let statsLabel = stats.entries > 0 ? `${stats.avgPts.toFixed(1)} avg &middot; ${stats.entries} entry` : 'Never entered';
            const checkedFree = p.freeEntry === 'Yes' ? 'checked' : '';
            const checkedPaid = (p.entryFeePaid > 0 && p.freeEntry !== 'Yes') ? 'checked' : '';

            const freeLabelStyle = p.freeEntry === 'Yes' ? 'color: var(--accent-gold); font-weight: 700;' : 'color: var(--text-secondary);';
            const paidLabelStyle = (p.entryFeePaid > 0 && p.freeEntry !== 'Yes') ? 'color: var(--accent-cyan); font-weight: 700;' : 'color: var(--text-secondary);';
            const paidDisabled = p.freeEntry === 'Yes' ? 'disabled style="opacity: 0.5; cursor: not-allowed;"' : '';

            const rowBackground = isBountyTarget ? 'background: hsla(0, 85%, 50%, 0.08); border-color: var(--accent-red);' : 'background: hsla(222, 20%, 15%, 0.35);';
            const bountyTargetBadge = isBountyTarget ? `<span style="padding: 0.15rem 0.4rem; font-size: 0.72rem; font-weight: 700; color: var(--accent-red); background: hsla(0, 85%, 50%, 0.15); border: 1px solid hsla(0, 85%, 50%, 0.25); border-radius: 4px; margin-left: 0.4rem;">🎯 BOUNTY TARGET</span>` : '';
            
            participantsHtml += `
                <div style="display: flex; justify-content: space-between; align-items: center; padding: 0.6rem 0.8rem; border: 1px solid var(--border-color); border-radius: 12px; transition: all 0.2s; ${rowBackground}">
                    <div style="display: flex; align-items: center; gap: 0.6rem; min-width: 0;">
                        <span class="rank-badge ${stats.gradeClass}" style="width: 32px; height: 32px; font-size: 0.8rem; font-weight: 800; flex-shrink: 0; line-height: 32px; text-align: center; border-radius: 50%; color: var(--text-primary); display: inline-block;">${stats.grade}</span>
                        <div style="display: flex; flex-direction: column; min-width: 0;">
                            <span style="font-weight: 700; color: var(--text-primary); font-size: 0.95rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; cursor: pointer; text-decoration: underline;" onclick="showPlayerCard('${p.player.replace(/'/g, "\\'")}')">${p.player}${bountyTargetBadge}</span>
                            <span style="font-size: 0.75rem; color: var(--text-secondary);">${statsLabel}</span>
                        </div>
                    </div>
                    <div style="display: flex; align-items: center; gap: 0.75rem; flex-shrink: 0;">
                        <label style="display: flex; align-items: center; gap: 0.3rem; font-size: 0.8rem; cursor: pointer; ${paidLabelStyle}">
                            <input type="checkbox" class="paid-entry-check" ${checkedPaid} ${paidDisabled} onclick="togglePlayerPaidStatus('${s.sessionId}', '${p.player.replace(/'/g, "\\'")}', this.checked)" style="width: 14px; height: 14px; cursor: pointer;">
                            <span>Paid</span>
                        </label>
                        <label style="display: flex; align-items: center; gap: 0.3rem; font-size: 0.8rem; cursor: pointer; ${freeLabelStyle}">
                            <input type="checkbox" class="free-entry-check" ${checkedFree} onclick="togglePlayerFreeEntry('${s.sessionId}', '${p.player.replace(/'/g, "\\'")}', this.checked)" style="width: 14px; height: 14px; cursor: pointer;">
                            <span>Free</span>
                        </label>
                        <span style="font-size: 0.9rem; font-weight: 700; color: var(--accent-gold); width: 40px; text-align: right;">$${p.entryFeePaid.toFixed(0)}</span>
                        <button onclick="removePlayerFromCheckIn('${s.sessionId}', '${p.player.replace(/'/g, "\\'")}', '${s.tournament.replace(/'/g, "\\'")}')" style="background: none; border: none; color: var(--accent-red); font-weight: 800; font-size: 1.1rem; cursor: pointer; padding: 0.2rem;">✕</button>
                    </div>
                </div>
            `;
        });
        participantsHtml += `</div>`;
    }
    


    let bountyTextHtml = '';
    if (s.bountyAmount > 0) {
        const bountyTargetsList = s.bountyTarget ? s.bountyTarget.split(',').map(n => n.trim()).filter(Boolean) : [];
        const labelEach = bountyTargetsList.length > 1 ? ' each' : '';
        bountyTextHtml = `<div style="font-size: 0.8rem; color: var(--accent-red); font-weight: 700; margin-top: 0.25rem;">🎯 Bounty: $${s.bountyAmount.toFixed(0)}${labelEach} on ${s.bountyTarget || 'N/A'}</div>`;
    }
    
    container.innerHTML = `
        <div style="padding: 1rem 1.5rem; text-align: left;">
            <div style="margin-bottom: 1.25rem;">
                <button onclick="closeActiveSession()" style="background: none; border: none; color: var(--accent-cyan); font-weight: 700; font-size: 0.9rem; cursor: pointer; padding: 0; display: flex; align-items: center; gap: 0.3rem;">
                    ← Back to Tournaments
                </button>
            </div>
            
            <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 0.75rem; border-bottom: 1px solid var(--border-color); padding-bottom: 0.75rem; margin-bottom: 1.25rem;">
                <div>
                    <h2 style="font-family: 'Outfit', sans-serif; font-size: 1.6rem; color: var(--text-primary); display: flex; align-items: center; gap: 0.5rem;">
                        🎟️ ${s.tournament} Registration
                        <span style="font-size: 0.75rem; padding: 0.15rem 0.4rem; background: var(--border-color); border-radius: 4px; color: var(--text-secondary); text-transform: uppercase;">${s.status}</span>
                    </h2>
                    <span style="font-size: 0.8rem; color: var(--text-secondary);">Entry Fee: $${s.entryFee.toFixed(0)} &middot; Created ${formatBetDate(s.createdAt)}</span>
                </div>
                <div style="display: flex; gap: 0.4rem;">
                    ${statusActionsHtml}
                </div>
            </div>
            
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin-bottom: 1.5rem;">
                <div style="background: hsla(222, 20%, 15%, 0.4); border: 1px solid var(--border-color); padding: 0.8rem; border-radius: 12px; display: flex; flex-direction: column;">
                    <span style="font-size: 0.75rem; text-transform: uppercase; color: var(--text-secondary); font-weight: 700; letter-spacing: 0.5px;">Prize Pool</span>
                    <span style="font-size: 1.6rem; font-weight: 800; color: var(--accent-gold);">$${activePool.toFixed(0)}</span>
                    <span style="font-size: 0.73rem; color: var(--text-secondary); margin-top: 0.2rem;">Splits among tournament winners</span>
                </div>
                <div style="background: hsla(222, 20%, 15%, 0.4); border: 1px solid var(--border-color); padding: 0.8rem; border-radius: 12px; display: flex; flex-direction: column; justify-content: space-between;">
                    <div>
                        <span style="font-size: 0.75rem; text-transform: uppercase; color: var(--text-secondary); font-weight: 700; letter-spacing: 0.5px;">Paid Registrations</span>
                        <span style="font-size: 1.6rem; font-weight: 800; color: var(--text-primary); display: block;">$${totalCollected.toFixed(0)}</span>
                    </div>
                    ${bountyTextHtml}
                </div>
            </div>
            
            <form onsubmit="handleCheckInPlayerSubmit(event, '${s.sessionId}', '${s.tournament}', ${s.entryFee})" style="display: flex; gap: 0.5rem; margin-bottom: 1.5rem; background: hsla(222, 28%, 7%, 0.3); padding: 0.75rem; border-radius: 12px; border: 1px dashed var(--border-color);">
                <select id="checkin-player-select" class="form-select" style="flex: 1;" required>
                    ${dropdownHtml}
                </select>
                <button type="submit" class="action-btn" style="padding: 0 1rem; height: 38px; line-height: 38px; border-radius: 8px;">✅ Register</button>
            </form>
            
            <h3 style="font-family: 'Outfit', sans-serif; font-size: 1.15rem; color: var(--text-primary); border-bottom: 1px solid var(--border-color); padding-bottom: 0.4rem; margin-bottom: 0.5rem;">Registered Players (${participants.length})</h3>
            ${participantsHtml}
        </div>
    `;
}

function closeActiveSession() {
    activeCheckInSession = null;
    renderCheckInWidget();
    renderTournamentTable();
}

async function togglePlayerFreeEntry(sessionId, player, isFree) {
    const s = checkInSessionsData.find(x => x.sessionId === sessionId);
    if (!s) return;
    
    if (isFree) {
        const freeCount = checkInPlayersData.filter(p => p.sessionId === sessionId && p.freeEntry === 'Yes').length;
        if (freeCount >= 2) {
            alert("Limit reached! Maximum of 2 players can be given free director entries per event.");
            renderActiveSession(sessionId);
            return;
        }
    }
    
    const entryFeePaid = 0; // Free entry means $0 paid. Unchecking Free returns them to Unpaid ($0).
    const freeVal = isFree ? 'Yes' : '';
    
    const pLocal = checkInPlayersData.find(p => p.sessionId === sessionId && p.player === player);
    if (pLocal) {
        pLocal.entryFeePaid = entryFeePaid;
        pLocal.freeEntry = freeVal;
    }
    renderActiveSession(sessionId);
    
    const payload = {
        action: 'toggle_free_entry',
        sessionId: sessionId,
        player: player,
        entryFeePaid: entryFeePaid,
        freeEntry: freeVal
    };
    
    try {
        await fetch(APPS_SCRIPT_URL, {
            method: 'POST',
            mode: 'no-cors',
            headers: { 'Content-Type': 'text/plain' },
            body: JSON.stringify(payload)
        });
        delete googleSheetsCache['CHECK_IN'];
        loadCheckInSessions();
    } catch (e) {
        console.error("Free entry toggle failed:", e);
    }
}

async function handleCheckInPlayerSubmit(e, sessionId, tournament, entryFee) {
    e.preventDefault();
    const select = document.getElementById('checkin-player-select');
    const player = select.value;
    if (!player) return;
    
    const exists = checkInPlayersData.some(p => p.sessionId === sessionId && p.player === player);
    if (exists) return;
    
    // Register player as unpaid (0 paid) by default
    checkInPlayersData.push({
        sessionId: sessionId,
        tournament: tournament,
        year: 2026,
        player: player,
        entryFeePaid: 0,
        freeEntry: '',
        removed: '',
        checkedInAt: new Date().toISOString()
    });
    renderActiveSession(sessionId);
    
    const payload = {
        action: 'checkin_player',
        sessionId: sessionId,
        tournament: tournament,
        player: player,
        entryFeePaid: 0,
        year: 2026
    };
    
    try {
        await fetch(APPS_SCRIPT_URL, {
            method: 'POST',
            mode: 'no-cors',
            headers: { 'Content-Type': 'text/plain' },
            body: JSON.stringify(payload)
        });
        delete googleSheetsCache['CHECK_IN'];
        loadCheckInSessions();
    } catch (err) {
        console.error("Player check-in failed:", err);
    }
}

async function removePlayerFromCheckIn(sessionId, player, tournament) {
    if (!confirm(`Are you sure you want to remove ${player} from this tournament check-in?`)) return;
    
    checkInPlayersData = checkInPlayersData.filter(p => !(p.sessionId === sessionId && p.player === player));
    renderActiveSession(sessionId);
    
    const payload = {
        action: 'uncheckin_player',
        sessionId: sessionId,
        player: player
    };
    
    try {
        await fetch(APPS_SCRIPT_URL, {
            method: 'POST',
            mode: 'no-cors',
            headers: { 'Content-Type': 'text/plain' },
            body: JSON.stringify(payload)
        });
        delete googleSheetsCache['CHECK_IN'];
        loadCheckInSessions();
    } catch (err) {
        console.error("Remove player failed:", err);
    }
}

async function updateSessionStatus(sessionId, status) {
    const s = checkInSessionsData.find(x => x.sessionId === sessionId);
    if (s) s.status = status;
    renderActiveSession(sessionId);
    
    const payload = {
        action: 'update_session_status',
        sessionId: sessionId,
        status: status
    };
    
    try {
        await fetch(APPS_SCRIPT_URL, {
            method: 'POST',
            mode: 'no-cors',
            headers: { 'Content-Type': 'text/plain' },
            body: JSON.stringify(payload)
        });
        delete googleSheetsCache['CHECK_IN_SESSIONS'];
        loadCheckInSessions();
    } catch (e) {
        console.error("Status update failed:", e);
    }
}

async function deleteSession(sessionId) {
    if (!confirm("Are you sure you want to delete this draft event? This cannot be undone.")) return;

    // Remove locally
    checkInSessionsData = checkInSessionsData.filter(x => x.sessionId !== sessionId);
    closeActiveSession();

    const payload = {
        action: 'update_session_status',
        sessionId: sessionId,
        status: 'deleted'
    };

    try {
        await fetch(APPS_SCRIPT_URL, {
            method: 'POST',
            mode: 'no-cors',
            headers: { 'Content-Type': 'text/plain' },
            body: JSON.stringify(payload)
        });
        delete googleSheetsCache['CHECK_IN_SESSIONS'];
        loadCheckInSessions();
    } catch (e) {
        console.error("Delete session failed:", e);
    }
}

async function togglePlayerPaidStatus(sessionId, player, isPaid) {
    const s = checkInSessionsData.find(x => x.sessionId === sessionId);
    if (!s) return;

    const entryFeePaid = isPaid ? s.entryFee : 0;
    const freeVal = ''; // Toggling paid to true or false resets free status

    const pLocal = checkInPlayersData.find(p => p.sessionId === sessionId && p.player === player);
    if (pLocal) {
        pLocal.entryFeePaid = entryFeePaid;
        pLocal.freeEntry = freeVal;
    }
    renderActiveSession(sessionId);

    const payload = {
        action: 'toggle_free_entry',
        sessionId: sessionId,
        player: player,
        entryFeePaid: entryFeePaid,
        freeEntry: freeVal
    };

    try {
        await fetch(APPS_SCRIPT_URL, {
            method: 'POST',
            mode: 'no-cors',
            headers: { 'Content-Type': 'text/plain' },
            body: JSON.stringify(payload)
        });
        delete googleSheetsCache['CHECK_IN'];
        loadCheckInSessions();
    } catch (e) {
        console.error("Paid status toggle failed:", e);
    }
}

// Show settle payouts modal
function showSettlePayoutsModal(sessionId) {
    const s = checkInSessionsData.find(x => x.sessionId === sessionId);
    if (!s) return;
    
    const participants = checkInPlayersData.filter(p => p.sessionId === sessionId);
    if (participants.length === 0) {
        alert("Cannot settle a tournament with 0 players.");
        return;
    }
    
    const totalCollected = participants.reduce((sum, p) => sum + p.entryFeePaid, 0);
    const bountyTargetsList = s.bountyTarget ? s.bountyTarget.split(',').map(n => n.trim()).filter(Boolean) : [];
    const activePool = totalCollected - (s.bountyAmount * bountyTargetsList.length);
    
    let winnersListHtml = '';
    participants.forEach(p => {
        winnersListHtml += `
            <label style="display: flex; align-items: center; gap: 0.5rem; padding: 0.5rem; background: var(--bg-sidebar); border: 1px solid var(--border-color); border-radius: 8px; cursor: pointer; font-weight: 600;">
                <input type="checkbox" class="settle-winner-check-in" value="${p.player.replace(/"/g, '&quot;')}" style="width: 18px; height: 18px;">
                <span>${p.player}</span>
            </label>
        `;
    });
    
    let bountyHunterHtml = '';
    if (s.bountyAmount > 0) {
        const bountyTargetsList = s.bountyTarget ? s.bountyTarget.split(',').map(n => n.trim()) : [];
        let bountyHuntersChecklistHtml = '';
        
        participants.forEach(p => {
            if (!bountyTargetsList.includes(p.player)) {
                bountyHuntersChecklistHtml += `
                    <label style="display: flex; align-items: center; gap: 0.5rem; padding: 0.5rem; background: var(--bg-sidebar); border: 1px solid var(--border-color); border-radius: 8px; cursor: pointer; font-weight: 600;">
                        <input type="checkbox" class="settle-bounty-hunter-check" value="${p.player.replace(/"/g, '&quot;')}" style="width: 18px; height: 18px;">
                        <span>${p.player}</span>
                    </label>
                `;
            }
        });
        
        bountyHunterHtml = `
            <div class="form-group" style="margin-bottom: 1rem; display: flex; flex-direction: column; gap: 0.25rem;">
                <label style="font-size: 0.85rem; font-weight: 700; color: var(--text-secondary);">Bounty Winner(s) (Who eliminated ${s.bountyTarget}?)</label>
                <div style="display: flex; flex-direction: column; gap: 0.4rem; max-height: 120px; overflow-y: auto; padding-right: 0.25rem;">
                    ${bountyHuntersChecklistHtml}
                </div>
            </div>
        `;
    }
    
    const inner = document.getElementById('settle-payouts-inner');
    inner.innerHTML = `
        <div class="card-header-block" style="margin-bottom: 0.5rem;">
            <div class="card-name" style="font-size: 1.4rem;">🎯 Settle Event Payouts</div>
            <div class="card-nickname" style="color: var(--accent-cyan); font-weight: 700; margin-top: 0.25rem;">Confirm winners and payout payouts</div>
        </div>
        
        <div style="font-size: 0.85rem; color: var(--text-secondary); margin-bottom: 1rem; background: hsla(222, 20%, 15%, 0.3); padding: 0.6rem; border-radius: 8px; border: 1px solid var(--border-color);">
            Event: <strong>${s.tournament}</strong> &middot; Entry Fee: <strong>$${s.entryFee}</strong><br>
            Total collected: <strong>$${totalCollected}</strong> &middot; Calculated Prize Pool: <strong>$${activePool}</strong>
        </div>
        
        <div class="form-group" style="margin-bottom: 1rem; display: flex; flex-direction: column; gap: 0.25rem;">
            <label style="font-size: 0.85rem; font-weight: 700; color: var(--text-secondary);">Winners (Select all who split the pot)</label>
            <div style="display: flex; flex-direction: column; gap: 0.4rem; max-height: 180px; overflow-y: auto; padding-right: 0.25rem;">
                ${winnersListHtml}
            </div>
        </div>
        
        ${bountyHunterHtml}
        
        <div class="form-group" style="margin-bottom: 1rem; display: flex; flex-direction: column; gap: 0.25rem;">
            <label for="settle-pot-override" style="font-size: 0.85rem; font-weight: 700; color: var(--text-secondary);">Total Prize Pool to Distribute ($)</label>
            <input type="number" class="form-input" id="settle-pot-override" value="${activePool}" min="0">
        </div>
        
        <button class="action-btn" onclick="confirmSettlePayouts('${s.sessionId}')" style="width: 100%; padding: 0.8rem; border-radius: 12px; font-weight: 700; margin-top: 0.5rem;">💾 Save Payouts & Complete</button>
    `;
    
    document.getElementById('settle-payouts-modal').classList.add('active');
}

function closeSettlePayoutsModal(event) {
    if (event) event.stopPropagation();
    const modal = document.getElementById('settle-payouts-modal');
    if (modal) modal.classList.remove('active');
}

async function confirmSettlePayouts(sessionId) {
    const s = checkInSessionsData.find(x => x.sessionId === sessionId);
    if (!s) return;
    
    const checkedWinners = Array.from(document.querySelectorAll('.settle-winner-check-in:checked')).map(c => c.value);
    if (checkedWinners.length === 0) {
        alert("Please select at least one winner.");
        return;
    }
    
    const distPool = parseFloat(document.getElementById('settle-pot-override').value) || 0.0;
    const winShare = distPool / checkedWinners.length;
    
    const checkedBountyHunters = Array.from(document.querySelectorAll('.settle-bounty-hunter-check:checked')).map(c => c.value);
    const bountyWinner = checkedBountyHunters.join(', ');
    
    closeSettlePayoutsModal();
    
    const container = document.getElementById('leaderboard-table-container');
    if (container) {
        container.innerHTML = `
            <div style="text-align: center; color: var(--text-secondary); padding: 3rem;">
                <span class="loading-spinner">⏳</span> Saving payouts & completing session in Google Sheets...
            </div>
        `;
    }
    
    const bountyTargetsList = s.bountyTarget ? s.bountyTarget.split(',').map(n => n.trim()).filter(Boolean) : [];
    const totalBounty = s.bountyAmount * bountyTargetsList.length;

    const payload = {
        action: 'save_payouts',
        sessionId: sessionId,
        tournament: s.tournament,
        year: 2026,
        winners: checkedWinners,
        winShare: winShare,
        bountyWinner: bountyWinner,
        bountyAmount: totalBounty
    };
    
    try {
        await fetch(APPS_SCRIPT_URL, {
            method: 'POST',
            mode: 'no-cors',
            headers: { 'Content-Type': 'text/plain' },
            body: JSON.stringify(payload)
        });
        
        delete googleSheetsCache['CHECK_IN_SESSIONS'];
        delete googleSheetsCache['PAYOUTS'];
        
        activeCheckInSession = null;
        
        setTimeout(() => {
            loadCheckInSessions();
        }, 1200);
    } catch (e) {
        console.error("Failed to save payouts:", e);
        alert("Failed to save payouts: " + e.message);
        loadCheckInSessions();
    }
}

// Render winnings leaderboard at the bottom of the tournament view
async function renderWinningsLeaderboard() {
    const tableContainer = document.getElementById('leaderboard-table-container');
    if (!tableContainer) return;
    
    // Remove existing card to prevent duplicates
    const existingCard = document.getElementById('winnings-leaderboard-card');
    if (existingCard) {
        existingCard.remove();
    }

    const card = document.createElement('div');
    card.id = 'winnings-leaderboard-card';
    card.className = 'card';
    card.style.cssText = 'margin-top: 1.5rem; background: var(--bg-card); border: 1px solid var(--border-color); padding: 1.5rem; border-radius: var(--border-radius); text-align: left;';
    card.innerHTML = `
        <div style="text-align: center; color: var(--text-secondary); padding: 1.5rem;">
            <span class="loading-spinner">⏳</span> Loading 2026 tournament money tracker...
        </div>
    `;
    tableContainer.appendChild(card);

    await ensureAll2026EventMoneyDataLoaded();
    
    const stats = {};
    const names = cupData.lifetime.map(p => p.PlayerName);
    names.forEach(n => {
        stats[n] = { name: n, entries: 0, paidIn: 0, won: 0, net: 0 };
    });
    
    const moneyEntries = cupData.granular.filter(g => g.Year === 2026);

    moneyEntries.forEach(entry => {
        const name = entry['Player Name'];
        if (!name) return;

        if (!stats[name]) {
            stats[name] = { name: name, entries: 0, paidIn: 0, won: 0, net: 0 };
        }

        const entryFee = Number(entry.EntryFee ?? entry['Entry Fee'] ?? 0) || 0;
        const winnings = Number(entry.Winnings ?? 0) || 0;
        const bounty = Number(entry.Bounty ?? 0) || 0;
        const calculatedWon = winnings + bounty;
        const netMoney = entry.NetMoney ?? entry['Net Money'];
        const calculatedNet = netMoney !== undefined && netMoney !== null && netMoney !== ''
            ? Number(netMoney) || 0
            : calculatedWon - entryFee;

        stats[name].entries++;
        stats[name].paidIn += entryFee;
        stats[name].won += calculatedWon;
        stats[name].net += calculatedNet;
    });
    
    const boardData = Object.values(stats).filter(p => p.entries > 0 || p.won > 0);
    
    boardData.sort((a,b) => b.net - a.net || b.won - a.won);
    
    let rowsHtml = '';
    if (boardData.length === 0) {
        rowsHtml = `<tr><td colspan="5" style="text-align: center; color: var(--text-secondary); padding: 1.5rem; font-style: italic;">No 2026 tournament money rows loaded yet.</td></tr>`;
    } else {
        boardData.forEach(p => {
            const netClass = p.net > 0 ? 'positive' : p.net < 0 ? 'negative' : 'neutral';
            const netPrefix = p.net > 0 ? '+$' : p.net < 0 ? '-$' : '$';
            const netDisplay = netPrefix + Math.abs(p.net).toFixed(0);
            
            rowsHtml += `
                <tr>
                    <td style="font-weight: 600; color: var(--text-primary); cursor: pointer;" onclick="showPlayerCard('${p.name.replace(/'/g, "\\'")}')">${p.name}</td>
                    <td style="text-align: center;">${p.entries}</td>
                    <td style="text-align: right; color: var(--text-secondary); font-weight: 600;">$${p.paidIn.toFixed(0)}</td>
                    <td style="text-align: right; color: var(--accent-green); font-weight: 700;">$${p.won.toFixed(0)}</td>
                    <td style="text-align: right; font-weight: 700;" class="bet-leaderboard-value ${netClass}">${netDisplay}</td>
                </tr>
            `;
        });
    }
    
    card.innerHTML = `
        <h3 style="font-family: 'Outfit', sans-serif; font-size: 1.3rem; margin-bottom: 0.5rem; color: var(--text-primary);">
            💰 2026 Season Tourney Winnings
        </h3>
        <p style="font-size: 0.8rem; color: var(--text-secondary); margin-bottom: 1rem; line-height: 1.4;">
            This ledger tracks aggregate entry fees, winnings, bounties, and net money from the 2026 tournament result sheets.
        </p>
        <div class="table-container">
             <table class="data-table">
                  <thead>
                       <tr>
                           <th>Player</th>
                           <th style="text-align: center;">Entries</th>
                           <th style="text-align: right;">Paid In</th>
                           <th style="text-align: right;">Won</th>
                           <th style="text-align: right;">Net</th>
                       </tr>
                  </thead>
                  <tbody>
                       ${rowsHtml}
                  </tbody>
             </table>
        </div>
    `;
}

