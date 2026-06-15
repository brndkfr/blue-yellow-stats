# Jets U14B Blau - Statistiken Referenz / Stats Reference

---

## Deutsch

Alle Statistiken werden aus den geloggten Aktionen im Jets Tracker berechnet.
Da nicht immer alle Aktionen erfasst werden (hektische Spiele, verspätete Einträge),
werden Quoten und Anteile nur angezeigt, wenn genug Datenpunkte vorliegen.

### Standard-Statistiken

#### Team

| Statistik | Beschreibung |
|-----------|-------------|
| Spiele | Anzahl der Spiele im gewählten Zeitraum / Spieltyp |
| Siege / Unentschieden / Niederlagen | Aus Tordifferenz pro Spiel berechnet |
| Tore | Alle geloggten Tore (Aktion "goal") |
| Gegentore | Alle geloggten Gegentore (Aktion "gegengoal") |
| Tordifferenz | Tore minus Gegentore |
| Heimsiege / Auswärtssiege | Siege aufgeteilt nach Spielort |

#### Feldspieler

| Statistik | Beschreibung |
|-----------|-------------|
| Tore | Anzahl der geschossenen Tore dieses Spielers |
| Vorlagen | Anzahl der Tore, bei denen dieser Spieler den Assist gegeben hat |
| Punkte | Tore + Vorlagen zusammen |
| Tore Überzahl | Tore während Überzahl des Teams |
| Vorlagen Überzahl | Assists während Überzahl des Teams |
| Torschüsse (Zentrum) | Schüsse aus der Torlinie / Zentrumszone - nur hochgefährliche Abschlüsse werden geloggt |
| Torschussquote | Anteil der Torschüsse, die zu einem Tor geführt haben. Nur angezeigt, wenn mindestens 5 Torschüsse vorhanden. |
| Spiele | Anzahl der Spiele, in denen der Spieler im Kader stand (aus dem Spielkader) |

#### Torhüter

| Statistik | Beschreibung |
|-----------|-------------|
| Paraden | Paraden (normal) + Mega-Paraden zusammen |
| Mega-Paraden | Herausragende Paraden - der Torwart hat das Tor verhindert obwohl es aussichtslos schien |
| Anteil Mega-Paraden | Wie viel Prozent aller Paraden waren Mega-Paraden (Qualitätsindikator) |
| Gegentore | Summe aller Gegentore in den Spielen, die dieser Torwart bestritten hat |
| Fangquote | Paraden geteilt durch (Paraden + Gegentore). Nur angezeigt, wenn mindestens 3 Datenpunkte vorhanden. |
| Torwart-Dominanz-Wert | Erweiterte Fangquote: Mega-Paraden werden doppelt gewichtet. Formel: (Mega-Paraden x 2 + Paraden) geteilt durch (alle Paraden + Gegentore). Höher als die normale Fangquote bei vielen Mega-Paraden. |
| Schlüsselpässe | Pässe des Torwarts, die direkt zu einer Torchance geführt haben |
| Fehlauswürfe | Fehlerhafter Abwurf des Torwarts |

#### Powerplay und Unterzahl (Team)

| Statistik | Beschreibung |
|-----------|-------------|
| Powerplay-Quote | Anteil der Powerplay-Situationen, in denen ein Tor geschossen wurde |
| Unterzahl gehalten | Anteil der Unterzahl-Situationen, in denen kein Gegentor kassiert wurde |

---

### Erweiterte Statistiken (Moneyball)

Diese Metriken gehen über die einfachen Zählstatistiken hinaus und messen den Gesamtbeitrag
eines Spielers. Sie sind besonders nützlich, um Spieler zu identifizieren, die in den
Standard-Statistiken (Tore, Vorlagen) wenig auffallen, aber enorm wichtig für das Spiel sind.

#### Feldspieler Beitrag

| Statistik | Beschreibung |
|-----------|-------------|
| Anzahl Aktionen | Gesamtzahl aller geloggten Aktionen dieses Spielers (positiv + negativ). Niedrige Anzahl = wenig Daten, Statistiken mit Vorsicht interpretieren. |
| Positiv-Anteil | Anteil der positiven Aktionen an allen Aktionen. Formel: (Tore + Vorlagen + Schlüsselpässe + Torschüsse + Ballgewinne + Abwehraktionen) geteilt durch alle Aktionen. Ein Spieler mit 90% bedeutet: 9 von 10 Aktionen waren konstruktiv. |
| Offensiv-Wert | Gewichteter Offensiv-Beitrag pro Saison/Filter. Formel: Tore x 4 + Vorlagen x 3 + Schlüsselpässe x 1.5 + Torschüsse x 1. Tore werden am höchsten gewichtet, da sie am direktesten zum Ergebnis beitragen. |
| Defensiv-Wert | Netto-Defensiv-Beitrag. Formel: Ballgewinne + Abwehraktionen - Fehlpässe x 0.5. Fehlpässe werden abgezogen, da sie oft Konter einleiten. Ein negativer Wert deutet auf mehr Fehler als Defensivleistungen hin. |
| Gesamtwert | Offensiv-Wert + Defensiv-Wert zusammen. Das Gesamtranking für einen Spieler. Nützlich für schnellen Post-Match-Vergleich. |
| Offensiv-Anteil am Team | Anteil dieses Spielers am gesamten offensiven Output des Teams (Tore + Vorlagen + Schlüsselpässe + Torschüsse). Identifiziert, wer das Angriffsspiel anführt. Ein Spieler mit 25% Anteil trägt ein Viertel des Angriffsspiels. |
| Leistung Schlussphase | Anteil der Aktionen, die in der letzten Spielphase (2. Halbzeit oder 3. Drittel) erbracht wurden. Spieler mit über 50% sind Endphasen-Spezialisten - sie werden besser wenn andere müder werden. |
| Ballgewinn-Balance | Verhältnis von Ballgewinnen zu Ballverlusten. Formel: Ballgewinne geteilt durch (Ballgewinne + Fehlpässe). Unter 50% = der Spieler verliert öfter den Ball als er ihn gewinnt. |

#### Team-Trends

| Statistik | Beschreibung |
|-----------|-------------|
| Erwartete Gegentore (xGA) | Wie viele Gegentore wären statistisch zu erwarten, basierend auf der Art der Gegentore? Konter = 1.0, Freier Schuss = 0.9, Deckungsfehler = 0.8, Überzahl = 0.7, Fehlpass = 0.6, Pech = 0.3. Summe aller Gewichte = erwartete Gegentore. |
| xGA Bewertung "Pech" | Tatsächliche Gegentore deutlich über der Erwartung. Das Team hat schlechter verteidigt als die Chancenlage vermuten lässt, oder der Torwart hatte einen schwachen Tag. |
| xGA Bewertung "Ausgeglichen" | Gegentore entsprechen der Erwartung. Ergebnis war verdient. |
| xGA Bewertung "Stark gehalten" | Tatsächliche Gegentore deutlich unter der Erwartung. Der Torwart oder die Verteidigung hat mehr gehalten als statistisch erwartet. |

#### Verbindungsindex (Chemistry)

Zeigt, welche Spieler-Paare am häufigsten zusammen Tore erzielen (Torschütze + Vorbereiter).
Ein hohes gemeinsames Tore-Zahl bedeutet, dass diese beiden Spieler gut harmonieren und
bevorzugt zusammen eingesetzt werden sollten.

---

### Daten und Vollständigkeit

Die Qualität der Statistiken hängt direkt davon ab, wie vollständig die Aktionen geloggt werden.

- **Tore und Gegentore** sind in der Regel vollständig (spielentscheidend, werden immer notiert)
- **Paraden, Torschüsse, Pässe** können unvollständig sein bei hektischen Spielen
- **"Anzahl Aktionen"** zeigt die Datendichte: weniger als 10-15 Aktionen pro Spiel bedeutet Lücken
- Quoten (Fangquote, Torschussquote) werden erst ab Mindest-Datenpunkten angezeigt

**Empfehlung**: Mindestens Tore, Gegentore, Torschüsse und Paraden konsequent loggen.
Dann sind alle wichtigen Statistiken auswertbar.

---

---

## English

All stats are computed from events logged in the Jets Tracker.
Since not every action gets logged during every game (busy coaching situations, entries added after the fact),
rates and percentages are only shown when enough data points are available.

### Standard Stats

#### Team

| Stat | Description |
|------|-------------|
| Games | Number of games in the selected period / game type |
| W / D / L | Derived from goal differential per game |
| Goals | All logged goals (action "goal") |
| Goals Against | All logged opponent goals (action "gegengoal") |
| Goal Differential | Goals minus Goals Against |
| Home Wins / Away Wins | Wins split by venue |

#### Field Players

| Stat | Description |
|------|-------------|
| Goals | Number of goals scored by this player |
| Assists | Number of goals this player set up with a pass |
| Points | Goals + Assists combined |
| Power Play Goals | Goals scored while the team had a man advantage |
| Power Play Assists | Assists on power play goals |
| Slot Shots | Shots taken from the slot / centre zone - only high-danger attempts in front of goal are logged |
| Shot Conversion | Fraction of slot shots that resulted in a goal. Only shown when at least 5 shots are logged. |
| Games | Number of games the player appeared on the game roster |

#### Goalie

| Stat | Description |
|------|-------------|
| Saves | Regular saves + mega saves combined |
| Mega Saves | Outstanding saves - the goalie stopped what looked like a certain goal |
| Mega Save Ratio | What fraction of all saves were mega saves (save quality indicator) |
| Goals Against | Total goals conceded in games this goalie played |
| Save Percentage | Saves divided by (Saves + Goals Against). Only shown when at least 3 data points available. |
| Goalie Dominance Score | Enhanced save quality metric: mega saves count double. Formula: (Mega Saves x 2 + Saves) divided by (all Saves + Goals Against). Higher than standard SV% when the goalie makes many exceptional stops. |
| Key Passes | Goalie distributions that directly created a scoring chance |
| Bad Throws | Errant outlet passes by the goalie |

#### Power Play and Penalty Kill (Team)

| Stat | Description |
|------|-------------|
| Power Play % | Fraction of power play situations that resulted in a goal |
| Penalty Kill % | Fraction of penalty kill situations where no goal was conceded |

---

### Advanced Stats (Moneyball)

These metrics go beyond simple counting stats and measure a player's overall contribution.
They are especially useful for identifying players who rarely appear in the scoring stats
but are crucial to how the team plays.

#### Player Contribution (Feldspieler Beitrag)

| Stat | Description |
|------|-------------|
| Total Actions | Total number of logged actions for this player (positive + negative). Low counts mean sparse data - interpret with caution. |
| Positive Action Ratio | Fraction of a player's actions that were positive. Formula: (Goals + Assists + Key Passes + Shots + Recoveries + Defensive stops) divided by all actions. 90% means 9 out of 10 actions were constructive. |
| Attacking Value | Weighted offensive contribution per season/filter. Formula: Goals x 4 + Assists x 3 + Key Passes x 1.5 + Shots x 1. Goals are weighted highest since they directly decide the game. |
| Defensive Value | Net defensive contribution. Formula: Recoveries + Defensive stops - Bad Passes x 0.5. Bad passes are penalized because they often trigger counter-attacks. A negative value means more mistakes than defensive contributions. |
| Overall Score | Attacking Value + Defensive Value combined. The composite ranking for a player. Useful for quick post-match comparison. |
| Offensive Team Share | This player's share of the team's total offensive output (Goals + Assists + Key Passes + Shots). A player at 25% drives a quarter of all offensive actions. |
| Late-Game Performance | Fraction of actions recorded in the final phase (2nd half or 3rd period). Above 50% means the player gets stronger when others get tired - a pressure performer. |
| Ball Win Balance | Ratio of recoveries to turnovers. Formula: Recoveries divided by (Recoveries + Bad Passes). Below 50% means this player loses the ball more often than winning it back. |

#### Team Trends

| Stat | Description |
|------|-------------|
| Expected Goals Against (xGA) | How many goals against were statistically expected, based on how the goals were conceded? Counter-attack = 1.0, Free shot = 0.9, Coverage error = 0.8, Power play = 0.7, Bad pass = 0.6, Bad luck = 0.3. Sum of weights = expected goals against. |
| xGA "Pech" (Bad Luck) | Actual goals conceded significantly above expectation. Either the defense was porous or the goalie had an off day relative to the chances faced. |
| xGA "Ausgeglichen" (Even) | Actual goals matched expectation. Result was deserved. |
| xGA "Stark gehalten" (Strong Hold) | Actual goals significantly below expectation. The goalie or defense over-performed relative to the danger level. |

#### Chemistry Index (Verbindungsindex)

Shows which player pairs most frequently combine for goals (scorer + assister).
A high shared goal count means these two players connect well and should be prioritized
on the same line.

---

### Data and Completeness

The quality of stats depends directly on how consistently actions are logged.

- **Goals and goals against** are typically complete (game-critical, always noted)
- **Saves, shots, passes** may be incomplete during hectic games
- **"Total Actions"** shows data density: fewer than 10-15 actions per game indicates gaps
- Rates (save %, shot conversion) are only shown above minimum thresholds

**Recommendation**: Log at minimum goals, goals against, shots and saves consistently.
That makes all important stats computable even with partial scouting.
