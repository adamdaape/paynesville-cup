import os
import pandas as pd
import glob
import re
import numpy as np
import json

# Set working directories and paths
data_dir = "/Users/amurf/Documents/Coding-Projects/Paynesville-cup"
all_xlsx = sorted(glob.glob(os.path.join(data_dir, "*.xlsx")))
excel_files = [f for f in all_xlsx if "Master" not in os.path.basename(f) and "~$" not in os.path.basename(f)]

# Mappings for name unification & raw event sheet typo corrections
NAME_MAPPINGS = {
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
    "Mel Murphy": "Melanie Murphy"
}

def clean_player_name(name):
    if not isinstance(name, str):
        return ""
    cleaned = re.sub(r'\s+', ' ', name.strip())
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
    try:
        return float(val_str)
    except ValueError:
        return 0.0

# Blacklist metadata rows & spreadsheet annotation notes
BLACKLIST_NAMES = {
    'KEY', 'Active Score', 'Inactive Score', 'No Participation', 'Booby Prize', 'nan', '', 'None'
}

def is_valid_player(name):
    """Returns False for spreadsheet metadata/note rows that aren't real players."""
    if not name or name in BLACKLIST_NAMES:
        return False
    if name.lower().startswith('note'):
        return False
    return True

granular_entries = []
yearly_standings = []

print("🚀 Running compilation engine...")

for f in excel_files:
    fname = os.path.basename(f)
    year = int(re.search(r"\d{4}", fname).group())
    
    xl = pd.ExcelFile(f, engine='openpyxl')
    
    # 1. Parse Standings sheet
    standings_sheet = [s for s in xl.sheet_names if 'STANDINGS' in s.upper()][0]
    df_st = xl.parse(standings_sheet)
    df_st.columns = [c.strip() if isinstance(c, str) else c for c in df_st.columns]
    
    if 'Name' in df_st.columns:
        df_st = df_st[df_st['Name'].notna()]
        df_st = df_st[df_st['Name'].apply(lambda x: isinstance(x, str))]
        df_st['Name_clean'] = df_st['Name'].apply(clean_player_name)
        df_st = df_st[df_st['Name_clean'].apply(is_valid_player)]

        
        for idx, row in df_st.iterrows():
            name = row['Name_clean']
            place = row.get('Place', np.nan)
            pts = row.get('Points', 0)
            tourneys = row.get('Tournaments Entered', 0)
            tot_score = row.get('Total Score', 0)
            avg_score = row.get('Average Score', 0)
            
            yearly_standings.append({
                'Year': year,
                'Place': str(place).strip() if pd.notna(place) else 'N/A',
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
        df_ev = df_ev[df_ev['Name_clean'].apply(is_valid_player)]

        
        pts_col = None
        for c in ['PC Points', 'PC POINTS', 'Points', 'POINTS', 'PC Pt', 'PC Pts']:
            if c in df_ev.columns:
                pts_col = c
                break
                
        score_col = None
        for c in ['Score', 'Games Won', 'Games', 'Result', 'Points Won', 'Wins']:
            if c in df_ev.columns:
                score_col = c
                break
                
        for idx, row in df_ev.iterrows():
            name = row['Name_clean']
            place = row.get('Place', np.nan)
            pts_val = row.get(pts_col, 0.0) if pts_col else 0.0
            score_val = row.get(score_col, np.nan) if score_col else np.nan
            
            granular_entries.append({
                'Year': year,
                'Tournament': sheet.strip().upper(),
                'Player Name': name,
                'Place': str(place).strip() if pd.notna(place) else 'N/A',
                'Score': str(score_val).strip() if pd.notna(score_val) else 'N/A',
                'PC Points': safe_float(pts_val)
            })

df_granular = pd.DataFrame(granular_entries)
df_yearly = pd.DataFrame(yearly_standings)

# ----------------- 3. COMPILING LIFETIME LEADERBOARD -----------------
print("📈 Computing Lifetime Leaderboard...")
lifetime_stats = []
unique_players = set(df_yearly['Name'].unique()).union(set(df_granular['Player Name'].unique()))

for player in unique_players:
    player_yearly = df_yearly[df_yearly['Name'] == player]
    player_granular = df_granular[df_granular['Player Name'] == player]
    
    active_years = sorted([int(y) for y in player_yearly['Year'].unique()])
    years_competed = len(active_years)
    
    if years_competed == 0:
        active_years = sorted([int(y) for y in player_granular['Year'].unique()])
        years_competed = len(active_years)
        
    pts_2022 = float(player_yearly[player_yearly['Year'] == 2022]['Cup Points'].sum()) if 2022 in active_years else np.nan
    pts_2023 = float(player_yearly[player_yearly['Year'] == 2023]['Cup Points'].sum()) if 2023 in active_years else np.nan
    pts_2024 = float(player_yearly[player_yearly['Year'] == 2024]['Cup Points'].sum()) if 2024 in active_years else np.nan
    pts_2025 = float(player_yearly[player_yearly['Year'] == 2025]['Cup Points'].sum()) if 2025 in active_years else np.nan
    
    lifetime_cup_pts = float(player_yearly['Cup Points'].sum())
    total_tourneys = int(player_granular.shape[0])
    avg_cup_pts = lifetime_cup_pts / years_competed if years_competed > 0 else 0.0
    
    lifetime_stats.append({
        'PlayerName': player,
        'LifetimeCupPoints': round(lifetime_cup_pts, 2),
        'TotalTournamentsEntered': total_tourneys,
        'YearsCompeted': years_competed,
        'AverageCupScore': round(avg_cup_pts, 2),
        '2022': pts_2022,
        '2023': pts_2023,
        '2024': pts_2024,
        '2025': pts_2025
    })

df_lifetime = pd.DataFrame(lifetime_stats)
df_lifetime.sort_values(by='LifetimeCupPoints', ascending=False, inplace=True)

# Sort yearly standings and granular results
df_yearly.sort_values(by=['Year', 'Place', 'Cup Points'], ascending=[True, True, False], inplace=True)
df_granular.sort_values(by=['Year', 'Tournament', 'PC Points'], ascending=[True, True, False], inplace=True)


# ----------------- 4. 2026 MONTE CARLO SIMULATION -----------------
print("🎲 Simulating 2026 Odds...")
all_stds = df_yearly.groupby('Name')['Cup Points'].std().dropna()
pooled_std = all_stds.mean() if not all_stds.empty else 10.0

player_params = {}
for player in df_lifetime['PlayerName']:
    p_years = df_yearly[df_yearly['Name'] == player]
    years_played = len(p_years)
    
    if years_played == 0:
        continue
        
    mean_score = p_years['Cup Points'].mean()
    if years_played < 2:
        std_score = pooled_std
    else:
        std_score = p_years['Cup Points'].std()
        if pd.isna(std_score) or std_score < 2.0:
            std_score = pooled_std
            
    boost = 0.0
    p_2025 = p_years[p_years['Year'] == 2025]
    p_2024 = p_years[p_years['Year'] == 2024]
    if not p_2025.empty and not p_2024.empty:
        if p_2025.iloc[0]['Cup Points'] > p_2024.iloc[0]['Cup Points']:
            boost = 2.0
            
    player_params[player] = (mean_score + boost, std_score)

np.random.seed(42)
num_sims = 10000
win_counts = {p: 0 for p in player_params.keys()}

for _ in range(num_sims):
    sim_scores = {}
    for p, (mean, std) in player_params.items():
        score = min(100.0, max(0.0, np.random.normal(mean, std)))
        sim_scores[p] = score
    winner = max(sim_scores, key=sim_scores.get)
    win_counts[winner] += 1

sim_results = []
for p, wins in win_counts.items():
    prob = wins / num_sims
    if prob > 0:
        if prob >= 0.5:
            odds = int(-100 * (prob / (1 - prob)))
            odds_str = f"{odds}"
        else:
            odds = int(100 * ((1 - prob) / prob))
            odds_str = f"+{odds}"
            
        sim_results.append({
            'Player': p,
            'Prob': round(prob * 100, 2),
            'OddsStr': odds_str,
            'RawProb': prob
        })

df_odds = pd.DataFrame(sim_results)
df_odds.sort_values(by='RawProb', ascending=False, inplace=True)


# ----------------- 5. COMPUTE BUBBLE WATCH (2025 DATA) -----------------
print("🎈 Computing Bubble Watch indicators...")
bubble_watch_list = []
df_2025_granular = df_granular[df_granular['Year'] == 2025]

for player in df_lifetime['PlayerName']:
    p_2025 = df_2025_granular[df_2025_granular['Player Name'] == player]
    played_count = len(p_2025)
    
    if played_count == 0:
        continue
        
    scores = sorted(p_2025['PC Points'].tolist(), reverse=True)
    
    if played_count < 4:
        bubble_status = "Incomplete"
        bubble_score = None
        target_score = 0.5
        details = f"Needs {4 - played_count} more event(s) to stabilize standings points."
    else:
        bubble_status = "Active"
        bubble_score = bubble_score_val = scores[3]
        target_score = bubble_score_val + 0.5
        details = f"Playing {played_count + 1}th event. Scoring > {bubble_score_val:.1f} points will discard it and boost standings!"
        
    bubble_watch_list.append({
        'Player': player,
        'EventsPlayed': played_count,
        'Status': bubble_status,
        'BubbleScore': bubble_score,
        'TargetScore': target_score,
        'Details': details,
        'TopScores': scores[:5]
    })

bubble_watch_list = sorted(bubble_watch_list, key=lambda x: (x['Status'] == 'Active', x['EventsPlayed']), reverse=True)


# ----------------- 6. REPLACE ALL NANs WITH NONE BEFORE JSON WRITE -----------------
# This ensures that np.nan is written as valid JSON 'null' instead of standard python 'NaN' which crashes browsers!
df_lifetime_clean = df_lifetime.replace({np.nan: None})
df_yearly_clean = df_yearly.replace({np.nan: None})
df_granular_clean = df_granular.replace({np.nan: None})
df_odds_clean = df_odds.replace({np.nan: None})

lifetime_list = df_lifetime_clean.to_dict(orient='records')
yearly_list = df_yearly_clean.to_dict(orient='records')
granular_list = df_granular_clean.to_dict(orient='records')
odds_list = df_odds_clean.drop(columns=['RawProb']).to_dict(orient='records')

# Replace np.nan/None in bubble_watch_list items
for b in bubble_watch_list:
    if b['BubbleScore'] is not None and pd.isna(b['BubbleScore']):
        b['BubbleScore'] = None
    if b['TargetScore'] is not None and pd.isna(b['TargetScore']):
        b['TargetScore'] = None

json_payload = {
    'lifetime': lifetime_list,
    'yearly': yearly_list,
    'granular': granular_list,
    'odds': odds_list,
    'bubble': bubble_watch_list
}

output_json_path = os.path.join(data_dir, "cup_data.json")
print(f"💾 Saving JSON payload to: {output_json_path}")
with open(output_json_path, "w") as jf:
    json.dump(json_payload, jf, indent=2)

print("🎉 JSON Data Compilation Complete (All NaN elements successfully converted to valid JSON nulls)!")
