# 🎰 Side Bets Tracker — Feature Spec

**Status:** Planned (build after Google Sheets live feed is complete)  
**Estimated Build Time:** ~1 session (~2–3 hours)  
**Backend Required:** Firebase Firestore (free tier)

---

## The Concept

A real-time side bet ledger baked into the Paynesville Cup app. Any player can create a bet against any other player on any event — whether it's an official Paynesville Cup tournament OR a casual activity like minigolf, Clash Royale, a cornhole game, etc. Bets stay live and visible to everyone until they're resolved and marked paid. All history is preserved forever as a fun running record.

No logins. No payment integration. Pure honor system. Cash changes hands in person.

---

## Two Types of Bets

### Type 1 — Paynesville Cup Tournament Bets
Tied to official Cup events. Who finishes higher / gets more Cup Points in a specific tournament.

**Examples:**
- Adam vs. Zach — Pickleball — $2 — who gets more Cup Points
- Kevin vs. Ben — Beanbag — $1 — who places higher

### Type 2 — Custom / Informal Activity Bets
Any activity outside the official tournament. Free-text description of what the bet is on.

**Examples:**
- Adam vs. Max — Clash Royale — $5 — best of 3 series
- Ryan vs. Shane — Mini Golf — $2 — low score wins
- John vs. Patrick — Cornhole — $1 — first to 21

---

## Navigation

Add a **7th button** to the bottom mobile nav bar and the desktop sidebar:

```
🎰  Side Bets
```

The Side Bets tab has **three sub-sections** navigated by top pills:

```
[ 🔴 Active Bets ]  [ ➕ Create Bet ]  [ 📜 History ]
```

---

## Screen 1: Active Bets (Default View)

Shows all unresolved bets in chronological order (newest first). Each bet is a card:

```
┌─────────────────────────────────────────────┐
│  🎰  ACTIVE                                  │
│                                              │
│  Adam Murphy  VS  Zach Leahy                │
│  📅 Pickleball  ·  $2  ·  Created Jul 12   │
│  "You're going down, Zach. Easy money."     │
│                                              │
│  [ Enter Result ▼ ]     [ Mark Paid ✅ ]    │
└─────────────────────────────────────────────┘
```

**Result dropdown options:**
- Adam Murphy Wins
- Zach Leahy Wins
- Tie — No Payout

Once a result is entered, the card updates:

```
┌─────────────────────────────────────────────┐
│  ✅ RESOLVED — Awaiting Payment              │
│                                              │
│  Adam Murphy  VS  Zach Leahy                │
│  📅 Pickleball  ·  $2                       │
│  🏆 Winner: Adam Murphy                      │
│                                              │
│  [ Mark Paid ✅ ]                           │
└─────────────────────────────────────────────┘
```

Once "Mark Paid" is clicked → bet moves to History.

**If no active bets:**
```
No active bets right now.
Be the first to start one! 🎰
```

---

## Screen 2: Create New Bet

A clean form — minimal fields, all dropdowns where possible:

```
🎰 Start a Side Bet

Your Name *
[ Dropdown — all 2026 roster players ]

vs. Who? *
[ Dropdown — all 2026 roster players ]

Wager Amount *
[ $1 ]  [ $2 ]  [ $5 ]  [ Other... ]

Event Category *
[ Dropdown with options ▼ ]
  — Official Paynesville Cup Events —
  Beanbag / Backgammon / Cribbage / Bocce
  Golf / Court Whist / Pickleball / Bucket Golf
  3-Club Challenge / Kubb / Texas Hold 'Em
  Euchre / Golf Cards
  — Custom Activity —
  ✏️ Other (type it in) ← reveals a text field

What's on the line? (optional trash talk)
[ Text area — 120 chars max ]

[ 🎰 Create Bet ]
```

**Validation rules:**
- Can't bet against yourself
- Both players must be selected
- Amount and event required
- "Other" requires a typed description (min 2 chars)

On submit → bet goes live on Firebase instantly, visible to everyone on all devices.

---

## Screen 3: Bet History & Net Totals Leaderboard

### Running Net Totals (top)
A mini-leaderboard of who's up and who's down on the season:

```
💰 Side Bet Ledger — All Time

  Adam Murphy        +$14  🟢
  Kevin Horner       +$7   🟢
  Ben Aeshliman      +$3   🟢
  Ryan Fitzpatrick    $0   ⚪
  Zach Leahy         -$6   🔴
  Max Murphy         -$8   🔴
```

### Resolved Bets Log (below)
Scrollable list of all paid-out bets, newest first:

```
✅ Jul 14 — Adam Murphy beat Zach Leahy
   Pickleball · $2 · "Easy money."

✅ Jul 13 — Kevin Horner beat Patrick Irwin
   Clash Royale · $5

✅ Jul 12 — Tie — Ben Aeshliman vs. Ryan Fitzpatrick
   Bocce · $1 · No payout
```

**Filter pills:** All · Cup Events Only · Custom Only · [Search player]

---

## Data Model (Firebase Firestore)

### Collection: `sidebets`
Each document is one bet:

```json
{
  "id": "auto-generated",
  "playerA": "Adam Murphy",
  "playerB": "Zach Leahy",
  "eventType": "official",
  "eventName": "Pickleball",
  "customEventName": null,
  "amount": 2,
  "trashTalk": "You're going down, Zach. Easy money.",
  "status": "active",
  "result": null,
  "winner": null,
  "createdAt": "2026-07-12T14:30:00Z",
  "resolvedAt": null,
  "paidAt": null
}
```

**Status lifecycle:** `active` → `resolved` → `paid`  
**Result values:** `"playerA"` | `"playerB"` | `"tie"`

### Firestore Security Rules (honor system — public read/write)
```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /sidebets/{betId} {
      allow read, write: if true;
    }
  }
}
```

---

## Firebase Setup Steps (When Ready to Build)

1. Go to [console.firebase.google.com](https://console.firebase.google.com)
2. Create project named `paynesville-cup`
3. Add a **Web App** → copy the config object (apiKey, projectId, etc.)
4. Enable **Firestore Database** → start in test mode
5. Paste the config into `index.html` — done

**Free tier limits (Firestore Spark plan):**
- 50,000 reads/day
- 20,000 writes/day  
- 1 GB storage

Our actual usage during vacation: ~200 reads and ~20 writes per day. Well within limits, forever free.

---

## Key Design Decisions

| Decision | Choice | Reason |
|----------|--------|--------|
| Authentication | None — honor system | Family trust, zero friction |
| Who can mark results | Anyone | Same as who can mark paid |
| Ties | No payout, still tracked | Explicitly requested |
| Payment | In person, cash only | No Venmo or payment integration needed |
| Custom events | Free text "Other" field | Supports Clash Royale, mini golf, cornhole, anything |
| History | Permanent, never deleted | Builds a fun multi-year record |
| Player roster | 2026 Google Sheets roster | Same source as the rest of the app |

---

## Nice-to-Have (Future Additions)

- [ ] Emoji reactions / trash talk replies on a bet
- [ ] Multi-year leaderboard (best all-time side bet record across all vacations)
- [ ] "Challenge" shortcut — click any player's name in the leaderboard → pre-fills Create Bet form with them
- [ ] Filter active bets by event type
- [ ] Team bets (2v2 format)

---

## Implementation Order (When Ready)

1. Set up Firebase project + Firestore (Adam does this with step-by-step guidance — ~20 min)
2. Add Firebase SDK script tags to `index.html`
3. Add 🎰 Side Bets to desktop sidebar nav + mobile bottom nav bar
4. Build the tab UI structure (Active / Create / History sub-tabs) in `index.html`
5. Build `createBet()`, `resolvebet()`, `markPaid()` functions in `app.js`
6. Wire real-time listener (`onSnapshot`) so all phones update instantly
7. Build Net Totals leaderboard calculation in `app.js`
8. Test on multiple devices simultaneously
9. Push to GitHub → Vercel auto-deploys in ~60 seconds
