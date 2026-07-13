import os
import pandas as pd
import glob
import re
import numpy as np

# Set working directories and paths
data_dir = "/Users/amurf/Documents/Coding-Projects/Paynesville-cup"
# Select only source files (e.g. 2022, 2023, 2024, 2025 CCBT results) and ignore master database
all_xlsx = sorted(glob.glob(os.path.join(data_dir, "*.xlsx")))
excel_files = [f for f in all_xlsx if "Master" not in os.path.basename(f) and "~$" not in os.path.basename(f)]

# Mappings for name unification & raw event sheet typo corrections
NAME_MAPPINGS = {
    # Confirmed name changes & spelling updates
    "Katie Bonicatto": "Katie Breviu",
    "Kate Breviu": "Katie Breviu",
    "Brodie": "Brody",
    "Sawyer Sherer": "Sawyer Scherer",
    "Sawyer Scherer": "Sawyer Scherer",
    
    # Granular Event Sheet Spelling Typo Corrections (Mapped to official STANDINGS names)
    "Donna Wieneke": "Donna Weineke",
    "Donna Bonicatto": "Donna Weineke",  # Maiden/married name mix-up in events
    "Dave Modrow": "Dave (Sr.) Modrow",  # Dave Sr.
    "Angi Willette": "Angie Willette",
    "Cinci Rob": "(Cincy) Rob Murphy",
    "Cinci Rob Murphy": "(Cincy) Rob Murphy",
    "Uncle Rob Murphy": "(Cincy) Rob Murphy",
    "Rob Murphy": "(Cincy) Rob Murphy",  # Standardize all "Rob Murphy" events to Cincy Rob (Robbie is Robbie/Rob Jr.)
    "Kelli Lindseth": "Kelly Lindseth",
    "Kylina": "Kilayna",
    "Luke Weineke": "Luke Wieneke",
    "Matt Stahlman": "Matt Stahlmann",
    "Tricia Stahlman": "Tricia Stahlmann",
    "Samanatha Pettit": "Samantha Pettit",
    "Zach Schirmers": "Zack Schirmers",
    "Ben Aeshilman": "Ben Aeshliman",
    "Patrick Iriwn": "Patrick Irwin",
    "Shaun irwin": "Shaun Irwin",
    "Mel Murphy": "Melanie Murphy"
}

def clean_player_name(name):
    if not isinstance(name, str):
        return ""
    # Strip whitespace, collapse multi-spaces
    cleaned = re.sub(r'\s+', ' ', name.strip())
    # Apply our specific mappings
    if cleaned in NAME_MAPPINGS:
        return NAME_MAPPINGS[cleaned]
    return cleaned

def safe_float(val):
    if pd.isna(val):
        return 0.0
    if isinstance(val, (int, float)):
        return float(val)
    val_str = str(val).strip()
    if val_str.startswith('#') or 'DIV' in val_str.upper() or 'VALUE' in val_str.upper():
        return 0.0
    val_str = re.sub(r'[$,\s]', '', val_str)
    if val_str in ('', '-'):
        return 0.0
    try:
        return float(val_str)
    except ValueError:
        return 0.0

# Blacklist words that represent sheet legends, totals, or metadata rather than player names
BLACKLIST_NAMES = {
    'KEY', 'Active Score', 'Inactive Score', 'No Participation', 'Booby Prize', 'nan', '', 'None'
}

granular_entries = []
yearly_standings = []

print("🚀 Starting Paynesville Cup Data Compilation...")
print(f"Found source files: {[os.path.basename(f) for f in excel_files]}")

for f in excel_files:
    fname = os.path.basename(f)
    year = re.search(r"\d{4}", fname).group()
    print(f"\nProcessing file: {fname} (Year {year})")
    
    xl = pd.ExcelFile(f, engine='openpyxl')
    
    # 1. Parse Standings sheet
    standings_sheet = [s for s in xl.sheet_names if 'STANDINGS' in s.upper()][0]
    df_st = xl.parse(standings_sheet)
    df_st.columns = [c.strip() if isinstance(c, str) else c for c in df_st.columns]
    
    if 'Name' in df_st.columns:
        df_st = df_st[df_st['Name'].notna()]
        df_st = df_st[df_st['Name'].apply(lambda x: isinstance(x, str))]
        df_st['Name_clean'] = df_st['Name'].apply(clean_player_name)
        df_st = df_st[~df_st['Name_clean'].isin(BLACKLIST_NAMES)]
        
        for idx, row in df_st.iterrows():
            name = row['Name_clean']
            place = row.get('Place', np.nan)
            pts = row.get('Points', 0)
            tourneys = row.get('Tournaments Entered', 0)
            tot_score = row.get('Total Score', 0)
            avg_score = row.get('Average Score', 0)
            
            yearly_standings.append({
                'Year': int(year),
                'Place': place,
                'Name': name,
                'Cup Points': safe_float(pts),
                'Tournaments Entered': int(tourneys) if pd.notna(tourneys) and str(tourneys).isdigit() else 0,
                'Total Score': safe_float(tot_score),
                'Average Score': safe_float(avg_score)
            })
            
    # 2. Parse individual event sheets
    event_sheets = [s for s in xl.sheet_names if 'STANDINGS' not in s.upper()]
    for sheet in event_sheets:
        df_ev = xl.parse(sheet)
        df_ev.columns = [c.strip() if isinstance(c, str) else c for c in df_ev.columns]
        
        if 'Name' not in df_ev.columns:
            name_cols = [c for c in df_ev.columns if 'NAME' in str(c).upper()]
            if name_cols:
                df_ev.rename(columns={name_cols[0]: 'Name'}, inplace=True)
            else:
                continue
                
        df_ev = df_ev[df_ev['Name'].notna()]
        df_ev = df_ev[df_ev['Name'].apply(lambda x: isinstance(x, str))]
        df_ev['Name_clean'] = df_ev['Name'].apply(clean_player_name)
        df_ev = df_ev[~df_ev['Name_clean'].isin(BLACKLIST_NAMES)]
        
        # Find points column (PC Points or Points)
        pts_col = None
        for c in ['PC Points', 'PC POINTS', 'Points', 'POINTS', 'PC Pt', 'PC Pts']:
            if c in df_ev.columns:
                pts_col = c
                break
                
        # Find score column (Score, Games Won, Games, Result)
        score_col = None
        for c in ['Score', 'Games Won', 'Games', 'Result', 'Points Won', 'Wins']:
            if c in df_ev.columns:
                score_col = c
                break

        # Find money columns (new for 2026+)
        entry_fee_col = next((c for c in ['Entry Fee', 'ENTRY FEE', 'Entry', 'Fee'] if c in df_ev.columns), None)
        winnings_col  = next((c for c in ['Winnings', 'WINNINGS', 'Prize', 'Payout'] if c in df_ev.columns), None)
        bounty_col    = next((c for c in ['Bounty', 'BOUNTY', 'Bounty Won', 'BOUNTY WON'] if c in df_ev.columns), None)
                
        for idx, row in df_ev.iterrows():
            name = row['Name_clean']
            place = row.get('Place', np.nan)
            pts_val = row.get(pts_col, 0.0) if pts_col else 0.0
            score_val = row.get(score_col, np.nan) if score_col else np.nan

            # Money fields (default 0 if columns absent or blank)
            entry_fee = safe_float(row.get(entry_fee_col, 0.0)) if entry_fee_col else 0.0
            winnings  = safe_float(row.get(winnings_col, 0.0))  if winnings_col  else 0.0
            bounty    = safe_float(row.get(bounty_col, 0.0))    if bounty_col    else 0.0
            net_money = round(winnings + bounty - entry_fee, 2)
            
            granular_entries.append({
                'Year': int(year),
                'Tournament': sheet.strip().upper(),
                'Player Name': name,
                'Place': str(place).strip() if pd.notna(place) else 'N/A',
                'Score/Result': str(score_val).strip() if pd.notna(score_val) else 'N/A',
                'PC Points': safe_float(pts_val),
                'Entry Fee': entry_fee,
                'Winnings': winnings,
                'Bounty': bounty,
                'Net Money': net_money
            })

# Convert compiled lists to DataFrames
df_granular = pd.DataFrame(granular_entries)
df_yearly = pd.DataFrame(yearly_standings)

print(f"\n✅ Extracted {len(df_granular)} tournament entry records.")
print(f"✅ Extracted {len(df_yearly)} overall yearly standing records.")

# ----------------- VALIDATION & TOP 4 RECALCULATION -----------------
print("\n🔍 Running validation cross-checks (Top-4 Recalculation Verification)...")
recalc_discrepancies = []

# Group granular entries by Year and Player, compute their top-4 sum
for (year, player), group in df_granular.groupby(['Year', 'Player Name']):
    # Get the official yearly standing record
    official_row = df_yearly[(df_yearly['Year'] == year) & (df_yearly['Name'] == player)]
    official_pts = official_row.iloc[0]['Cup Points'] if not official_row.empty else None
    official_entered = official_row.iloc[0]['Tournaments Entered'] if not official_row.empty else 0
    
    sorted_scores = sorted(group['PC Points'].tolist(), reverse=True)
    recalc_top4 = sum(sorted_scores[:4])
    
    # Check discrepancy with official points
    if official_pts is not None:
        diff = abs(recalc_top4 - official_pts)
        if diff > 0.01:
            recalc_discrepancies.append({
                'Year': year,
                'Player': player,
                'Official Cup Pts': official_pts,
                'Recalculated Cup Pts (Top 4)': recalc_top4,
                'Diff': diff,
                'All Scores': sorted_scores,
                'Official Entered': official_entered,
                'Recalculated Entered': len(group)
            })

if recalc_discrepancies:
    print(f"⚠️ Found {len(recalc_discrepancies)} mathematical standing differences (Excel formulas vs pure top-4):")
    for d in recalc_discrepancies:
        # Note: most of these are now due to 2022 negative point penalties (like Euchre -1.66) or custom formulas
        print(f"  - Year {d['Year']}, {d['Player']}: Official={d['Official Cup Pts']}, Recalc={d['Recalculated Cup Pts (Top 4)']}, Diff={d['Diff']:.2f}")
        print(f"    All Event Scores: {d['All Scores']}")
else:
    print("💯 Perfect validation! Recalculated top 4 points perfectly match overall standing sheets for all players!")

# ----------------- COMPILING LIFETIME LEADERBOARD -----------------
print("\n📈 Compiling Lifetime Leaderboard...")
lifetime_stats = []

unique_players = set(df_yearly['Name'].unique()).union(set(df_granular['Player Name'].unique()))

for player in unique_players:
    player_yearly = df_yearly[df_yearly['Name'] == player]
    player_granular = df_granular[df_granular['Player Name'] == player]
    
    # Years active
    active_years = sorted(list(player_yearly['Year'].unique()))
    years_competed = len(active_years)
    
    if years_competed == 0:
        active_years = sorted(list(player_granular['Year'].unique()))
        years_competed = len(active_years)
        
    pts_2022 = player_yearly[player_yearly['Year'] == 2022]['Cup Points'].sum() if 2022 in active_years else np.nan
    pts_2023 = player_yearly[player_yearly['Year'] == 2023]['Cup Points'].sum() if 2023 in active_years else np.nan
    pts_2024 = player_yearly[player_yearly['Year'] == 2024]['Cup Points'].sum() if 2024 in active_years else np.nan
    pts_2025 = player_yearly[player_yearly['Year'] == 2025]['Cup Points'].sum() if 2025 in active_years else np.nan
    pts_2026 = player_yearly[player_yearly['Year'] == 2026]['Cup Points'].sum() if 2026 in active_years else np.nan
    
    lifetime_cup_pts = player_yearly['Cup Points'].sum()
    total_tourneys = player_granular.shape[0]
    avg_cup_pts = lifetime_cup_pts / years_competed if years_competed > 0 else 0.0

    # Money stats (sum from granular entries; 0 for years without money columns)
    tourney_entry_fees = float(player_granular['Entry Fee'].sum())  if 'Entry Fee'  in player_granular.columns else 0.0
    tourney_winnings   = float(player_granular['Winnings'].sum())   if 'Winnings'   in player_granular.columns else 0.0
    tourney_bounty     = float(player_granular['Bounty'].sum())     if 'Bounty'     in player_granular.columns else 0.0
    tourney_net        = float(player_granular['Net Money'].sum())  if 'Net Money'  in player_granular.columns else 0.0
    
    lifetime_stats.append({
        'Player Name': player,
        'Lifetime Cup Points': lifetime_cup_pts,
        'Total Tournaments Entered': total_tourneys,
        'Years Competed': years_competed,
        'Average Cup Score': round(avg_cup_pts, 2),
        '2022 Cup Points': pts_2022,
        '2023 Cup Points': pts_2023,
        '2024 Cup Points': pts_2024,
        '2025 Cup Points': pts_2025,
        '2026 Cup Points': pts_2026,
        'Tourney $ Net': round(tourney_net, 2),
        'Tourney Entry Fees Paid': round(tourney_entry_fees, 2),
        'Tourney Winnings': round(tourney_winnings, 2),
        'Tourney Bounty Earnings': round(tourney_bounty, 2)
    })

df_lifetime = pd.DataFrame(lifetime_stats)
df_lifetime.sort_values(by='Lifetime Cup Points', ascending=False, inplace=True)

# ----------------- WRITING MASTER SPREADSHEET -----------------
output_path = os.path.join(data_dir, "Paynesville Cup Master Database (2022-2025).xlsx")
print(f"\n💾 Saving Master Database to: {output_path}")

df_yearly.sort_values(by=['Year', 'Place', 'Cup Points'], ascending=[True, True, False], inplace=True)
df_granular.sort_values(by=['Year', 'Tournament', 'PC Points'], ascending=[True, True, False], inplace=True)

with pd.ExcelWriter(output_path, engine='openpyxl') as writer:
    df_lifetime.to_excel(writer, sheet_name='Lifetime Leaderboard', index=False)
    df_yearly.to_excel(writer, sheet_name='Yearly Standings', index=False)
    df_granular.to_excel(writer, sheet_name='Granular Tournament Results', index=False)

print("🎉 Master Database successfully created and styled!")
