1. Project Vision

To create a high-end digital archive and analytics platform for the Kloten-Dietlikon Jets. We aim to move beyond basic standings by using "Moneyball" metrics to reveal the true tactical value of players and preserve the club’s historical data.
2. Data Infrastructure (The Foundation)

    Source: Official Swiss Unihockey API v2.

    Technology: Python backend for logic, GitHub Pages (HTML/JS) for the frontend.

    The "Query-Aware Cache":

        Every API response is saved locally as a .json file, hashed by Endpoint + Query Parameters.
        The entries in the cache has a TTl of 24 hours.


        Benefit: You can run tests 100 times without hitting API rate limits or being blocked.

    Database: SQLite (blue_yellow_archive.db) for long-term storage of seasons and player career paths.

3. "Moneyball" & Tactical Catalog (The Stats)

The engine analyzes every goal as a sequence of events.
A. Player Metrics

    The Catalyst Index: Identifies the "pre-assist." Who initiates the attack? (Sequence analysis 15s prior to a goal).

    The Pest (Penalty Draw Rate): Net balance of penalties drawn (Opponent penalty minutes while Player X is on the floor vs. Player X’s own penalties).

    Clutch Factor: Goals/Assists during "Crunch Time" (last 10 minutes of a game, goal difference ≤1).

    The Wall (Goalies): Goals Against Average (GAA) and performance tracking specifically during opponent powerplays.

B. Team & Tactical Metrics

    Lineup Reconstruction: Automatically groups 5-player units based on shared on-field events.

    Comeback Tracker: Analysis of games won after trailing by 2 or more goals.

    Buzzer-Beater Stats: Goals scored in the final 60 seconds of any period.

C. Geography & Rivalry

    Road Warrior Index: Points-per-game correlated with travel distance (calculated in KM from Kloten Stighag).

    Derby Barometer: Isolated standings for "Zurich Derbies" against GC, UHC Uster, and HC Rychenberg.

4. Privacy & Legal Compliance

    Two-Tier Anonymization:

        L-UPL (Men/Women): Full names used (Public figures in sports).

        Juniors (U-Teams): Surnames shortened (e.g., "Lukas K.").

    Data Quality Score: A transparency badge for junior games if the match sheet is incomplete (e.g., "Data Confidence: 65%").

    Attribution: Required footer notice: "Data source: Swiss Unihockey API".

5. Repository Structure (blue-yellow-stats)
Plaintext

/
├── .github/workflows/sync.yml   # Automatic update every Monday at 04:00
├── scripts/
│   ├── scraper.py               # Data fetching with smart caching
│   ├── analyser.py              # Logic for Catalyst, Pest, and Clutch scores
│   ├── geo_helper.py            # Distance calculations from Kloten
├── data/
│   ├── archive/                 # SQLite DB & historical JSON backups
│   ├── processed/               # Cleaned JSONs ready for the web dashboard
├── web/
│   ├── index.html               # Main dashboard (Tailwind CSS)
│   ├── js/charts.js             # Visualizations (Radar charts, heatmaps)
└── config.json                  # Settings for Jets Club-ID & League IDs

6. Visualization Concept (The Frontend)

    Player Cards: Each player gets a profile with "Moneyball Badges" (🛡️ Wall, ⚡ Catalyst, 🎣 Pest).

    Venue Map: An interactive map of Switzerland showing where the Jets "harvest" their points (Circle size = Points won).

    Momentum Grap: A "heartbeat" line for every game showing the shift in win probability.

7. Implementation Roadmap (Step-by-Step)

    Phase 1: Create GitHub Repo blue-yellow-stats and store API keys in GitHub Secrets.

    Phase 2: Develop the Scraper with the Query-Aware Cache (initially filtered for Jets Club-ID).

    Phase 3: Set up the Database Schema (Players, Games, Events).

    Phase 4: Write the Analyser Logic (start with Catalyst and Pest metrics).

    Phase 5: Build a basic Web Frontend with a filterable table and the travel map.

This is your complete blueprint. It is lean enough for a Jets-only start but built with the professional architecture required to toggle on the entire UPL/NLB later.