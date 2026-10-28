# HOI4Wise
Nederlandstalig tweede scherm voor Hearts of Iron IV. Onofficiële fanapp; geen gamekoppeling en geen AI-dienst nodig.

## Status en beperkingen
Dit is een werkende eerste applicatieversie, **geen volledige oplevering van alle gevraagde content**. Er zijn 12 gedeeltelijke basisguides met landspecifieke uitgangspunten en gedeelde strategische uitleg. Exacte focusvolgordes, alternatieve routes, vrij te spelen landen en de volledige landencatalogus ontbreken. Alleen 1936 wordt aangeboden. Geen guide wordt als volledig aangemerkt. Het dekkingsscherm beschrijft de resterende inhoudelijke controle. Versie 1.19.3 is een kandidaat uit de officiële aankondigingen, geen gegarandeerd geverifieerde huidige patch. DLC-catalogus en geïntegreerde uitbreidingen vragen nog een volledige actuele audit.

## Starten
Gebruik Docker Compose:

```sh
docker compose up -d --build
```

Open http://localhost:3000. Kopieer eventueel `.env.example` naar `.env` en verander PORT. De app draait als gebruiker node. Campagnes en instellingen staan in het named volume `campaigns`, bestand `/app/data/hoi4wise.db`. Er zijn geen standaardaccounts: dit is een single-user app voor een vertrouwd lokaal netwerk. Alle bezoekers met toegang delen dezelfde gegevens.

Alternatief, met Node.js 24 of hoger:

```sh
node server.mjs
```

Geen dependency-installatie nodig. Er is bewust gekozen voor een kleine Node-app met ingebouwde SQLite in plaats van Next.js/TypeScript/Tailwind. De content staat los van de interface in `content/guides.json`. De ingebouwde SQLite-API kan een experimentele waarschuwing tonen.

## Docker op GitHub
`.github/workflows/docker.yml` voert tests en contentvalidatie uit en bouwt daarna een image voor linux/amd64 en linux/arm64. Pushes naar main, master en feature/** publiceren naar `ghcr.io/sjefkebakfiets/hoi4wise`. Pull requests bouwen zonder publiceren. Tags zijn branchnaam, commit-SHA en git-versietag; `latest` wordt alleen door main/master bijgewerkt. Publicatie gebruikt GITHUB_TOKEN met packages:write, zonder persoonlijk token. Repository Actions moeten aanstaan en package-publicatie toestaan. De eerste package kan privé zijn; wijzig de package visibility als anonieme pulls gewenst zijn. Voor een featurebranch gebruik je de bijbehorende branch-tag, niet latest.

## PWA
Manifest, eigen SVG-iconen en service worker inbegrepen. Installeer via het browsermenu op localhost of HTTPS. Een HTTP-adres op een LAN-IP biedt meestal geen service worker/installatie. Na één verbonden bezoek worden interface en guides gecachet. De laatst geladen campagnes worden in het browserprofiel bewaard. Offline wijzigingen krijgen een aparte herstelkopie. Gebruik Instellingen → Lokale herstelkopie samenvoegen om ze als nieuwe campagnes toe te voegen; bestaande campagnes worden behouden. De herstelkopie bevat geen volledige synchronisatie/conflictoplossing. Installatie is nog niet visueel getest op alle browsers; rastericonen voor bredere platformcompatibiliteit ontbreken.

## Gebruik en veiligheid
Stel eerst DLC en ervaring in. Kies daarna land → route → campagne. Datum, focus, factie en keuzes vul je zelf in. Taken volgen deterministisch uit datum, keuzevoorwaarden en DLC. Focus- en factietekst zijn op dit moment logboekvelden; er is nog geen inhoudelijke beslisboom voor alle focuskeuzes. Beginners krijgen extra taaktekst; de uitleg voor gevorderden en experts verschilt nog beperkt.

Import accepteert exportformaat 1, maximaal 100 campagnes en 2 MB. Imports worden gevalideerd en als nieuwe campagnes toegevoegd. Exporteer regelmatig JSON via Instellingen. Persoonlijke gegevens worden nooit in Git opgeslagen. Meerdere browsers delen serverdata; gelijktijdige writes gebruiken momenteel last-write-wins.

Bij openbare hosting: zet een reverse proxy met HTTPS en toegangscontrole (bijvoorbeeld Basic Auth met eigen sterk wachtwoord of een identity proxy) vóór de app. Publiceer de backendpoort niet naast die proxy. Voorbeeld Caddy, met een apart gegenereerde password hash:

```caddy
hoi4.example.org {
    basic_auth {
        eigenaar YOUR_GENERATED_PASSWORD_HASH
    }
    reverse_proxy hoi4wise:3000
}
```

Gebruik geen voorbeeldwachtwoord. Stel in de proxy een bodylimiet van 2 MB in. HTTPS is ook nodig voor de PWA. De app vertrouwt voor origincontrole op de Host-header; laat de proxy de oorspronkelijke publieke Host doorgeven.

## Updates, backup en herstel

```sh
git pull
docker compose up -d --build
```

Het volume blijft behouden. Gebruik nooit `docker compose down -v` tenzij je alle campagnes wilt verwijderen. Database-schema is versie 1 (`PRAGMA user_version`); toekomstige schemawijzigingen moeten een expliciete migratie toevoegen vóór openen/schrijven.

Veilige fysieke backup: stop de app, kopieer de volledige datamap inclusief eventuele WAL/SHM-bestanden, start opnieuw. Bijvoorbeeld:

```sh
docker compose stop
docker compose cp hoi4wise:/app/data ./backups/hoi4wise-data
docker compose start
```

Herstel: stop de app, kopieer de bewaarde datamap terug in `/app/data`, verzeker eigenaar UID 1000 en start de app. Bewaar een extra kopie vóór herstel. Een JSON-export is het eenvoudigste logische alternatief en kan via de interface worden geïmporteerd.

## Validatie

```sh
node --test
node scripts/validate.mjs
node --check server.mjs
node --check public/app.js
```

Tests dekken DLC AND/OR, versievoorwaarden, datum/keuzetaken, imports, API-validatie, origincontrole en SQLite-persistentie na een procesherstart. Dit laatste vervangt geen echte containerherstarttest. `npm run build` valideert content; er is geen frameworkcompile nodig. Docker wordt door GitHub gebouwd; een lokale Docker-build vereist een Docker-installatie.

## Inhoud aanvullen
Behoud identifiers van landen, routes en taken. Verander teksten rechtstreeks in `content/guides.json`; `scripts/seed.mjs` is alleen de initiële contentgenerator en overschrijft handmatige inhoud. Conditions ondersteunen `all`, `any`, `versions`. Taakvoorwaarden ondersteunen ook `after` en `choice`. Routes hebben expliciete startdatums en ondersteunde versies. Volledige status vereist `focusVerified` en `countryReview`, 14 onderdelen en een inhoudelijke bronreview. Automatische tekstlengtechecks bewijzen geen feitelijke volledigheid.

Volgende inhoudsbatches: officiële landentags en releasables per startdatum inventariseren; focusbomen per DLC/versie controleren; historische en alternatieve focusvolgordes schrijven; land- en routegebonden beslisbomen toevoegen; alle 14 onderdelen inhoudelijk reviewen; pas daarna de catalogus als volledig markeren.
