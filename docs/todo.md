
### fix scraper issue
One thing to note: home_team has encoding corruption (Z\xf6rich instead of Zürich) — that's a Windows cp1252 issue in the scraper output. The data is intact in the API; it's just being stored with the wrong encoding. Worth fixing in the scraper if you plan to display team names in the web dashboard.