# HOI4Wise
Nederlandstalig tweede scherm voor Hearts of Iron IV. Onofficiële fanapp; geen gamekoppeling of AI-dienst nodig.

## Status en inhoud
Werkende eerste applicatieversie met dertien **gedeeltelijke** basisguides. Exacte focusvolgordes, alternatieve routes, vrij te spelen landen en de volledige landencatalogus ontbreken nog. Alleen 1936 wordt aangeboden. Geen guide wordt als volledig aangemerkt. Patch 1.19.4 is aangekondigd op 27 oktober 2026. Roemenië heeft strategische begeleiding voor 1.19.3/1.19.4; bestaande guides blijven op 1.19.3 gericht. Alle mechanics en exacte focusvolgordes zijn nog niet volledig gecontroleerd. Het dekkingsscherm beschrijft de beperkingen.

## Hosten met Docker Compose en PostgreSQL
De standaardconfiguratie gebruikt de gepubliceerde GitHub-image en een eigen PostgreSQL 17-container. Je hoeft geen broncode te bouwen. Beide Compose-bestanden (`docker-compose.yml` en `docker-compose.host.yml`) zijn gelijkwaardig.

1. Download `docker-compose.yml` en `.env.example` naar een vaste map op je server.
2. Kopieer `.env.example` naar `.env`.
3. Vul in `.env` een eigen lang, willekeurig databasewachtwoord en drie afzonderlijke accountwachtwoorden in. Bijvoorbeeld genereren met `openssl rand -hex 32`. Er worden geen standaardwachtwoorden meegeleverd.

```env
PORT=3011
HOI4WISE_TAG=latest
POSTGRES_PASSWORD=
BEN_PASSWORD=
ROBIN_PASSWORD=
ERWIN_PASSWORD=
COOKIE_SECURE=false
```

Vul alle vier wachtwoorden in vóór de eerste start. Accountwachtwoorden moeten minstens 12 tekens bevatten. Een `.env` (of dezelfde variabele in de hostomgeving/Portainer) is nu verplicht. Het wachtwoord wordt aan beide containers doorgegeven; gebruik het niet als app-login. Het staat niet in Git. Hexadecimale wachtwoorden vermijden speciale Compose-interpolatietekens.

```sh
docker compose pull
docker compose up -d
```

Open **http://SERVER-IP:3011**. Een bestaande `PORT`-instelling in `.env` heeft voorrang. De appcontainer luistert intern op 3000. PostgreSQL heeft geen gepubliceerde hostpoort en is via de Compose-service `postgres` bereikbaar. De app start nadat de database gezond is. De apphealthcheck controleert ook de database en geeft HTTP 503 bij databaseverlies.

Als GHCR toegang weigert, maak het GitHub-package openbaar of log op je host in met `docker login ghcr.io` en een eigen token met `read:packages`. Zet dit token niet in Compose.

### Je eigen datamap gebruiken
Standaard bewaart PostgreSQL alles in het named volume `postgres_data`. Wil je een eigen map, wijzig **bij de service postgres**:

```yaml
    volumes:
      - /jouw/pad/hoi4wise/postgres:/var/lib/postgresql/data
```

De losse `volumes: postgres_data:`-declaratie onderaan mag dan weg als deze niet meer gebruikt wordt. Gebruik een lege, lokale map op de Docker-host met geschikte PostgreSQL-permissies. De database-image beheert zijn eigen gebruiker; gebruik hiervoor niet de oude UID-1000-instructies voor SQLite. Gebruik bij voorkeur het named volume; zet actieve PostgreSQL-data niet zomaar op een SMB/netwerkshare.

Houd dezelfde Compose-map/projectnaam aan om hetzelfde named volume te blijven gebruiken. Geef PostgreSQL bij een grote versie-upgrade niet simpelweg een andere major-tag: volg een database-upgradeprocedure of dump/herstel.

### Overstap vanaf de vorige SQLite-versie
Deze versie gebruikt uitsluitend PostgreSQL. Omdat er nog geen SQLite-campagnes zijn, is geen datamigratie nodig. Een oud `campaigns`-volume wordt niet gebruikt en ook niet automatisch verwijderd. Eventuele oude SQLite-data worden niet automatisch overgezet. Een bestaande JSON-export blijft via Instellingen te importeren.

## Updates, status en logs

```sh
docker compose pull
docker compose up -d
docker compose ps
docker compose logs --tail=100 hoi4wise postgres
```

Een containerupdate verwijdert de database niet. Gebruik geen `docker compose down -v` voor een normale update. `POSTGRES_PASSWORD` wordt door de officiële database-image alleen bij het initialiseren van een leeg datavolume ingesteld; wijzigen in `.env` wijzigt het bestaande databasewachtwoord niet automatisch.

## Backup en herstel
Een JSON-export via Instellingen is de eenvoudigste backup van campagnes. Voor een volledige PostgreSQL-backup gebruik je `pg_dump`. Onderstaande Linux-shellvoorbeelden bewaren het bestand in `backups/` op de host. Stop de app tijdens dump en herstel om gelijktijdige wijzigingen te voorkomen; laat PostgreSQL draaien.

```sh
mkdir -p backups
docker compose stop hoi4wise
docker compose exec -T postgres pg_dump -U hoi4wise -d hoi4wise -Fc > backups/hoi4wise.dump
docker compose start hoi4wise
```

Controleer de exitcode en bewaar de dump ook buiten deze server. PostgreSQL-bestanden uit een draaiende datamap kopiëren is geen vervanging voor een consistente backup.

Herstel naar een lege database, of maak eerst een extra backup. Onderstaand herstel **vervangt bestaande databaseobjecten en gegevens**:

```sh
docker compose stop hoi4wise
docker compose exec -T postgres pg_restore -U hoi4wise -d hoi4wise --clean --if-exists --no-owner --single-transaction < backups/hoi4wise.dump
docker compose start hoi4wise
```

De databasedump omvat ook de migratiehistorie. Herstel met een passende appversie.

## Database en lokale ontwikkeling
De app gebruikt `pg` met een connection pool en parameterized queries. Campagnes, DLC-profiel, notities en favorieten staan per gebruikersnaam als JSONB in PostgreSQL. Alleen het ingelogde account heeft toegang. Gelijktijdige browsers binnen hetzelfde account gebruiken nog last-write-wins; er is geen automatische conflictresolutie.

SQL-migraties staan in `migrations/` en worden bij appstart transactioneel uitgevoerd. Een advisory lock voorkomt gelijktijdige migraties door meerdere instanties. Toegepaste migraties staan in `app_migrations`. Bewerk toegepaste migraties niet; voeg een nieuw genummerd bestand toe. Een database van een onbekende nieuwere migratie wordt geweigerd.

Lokaal zijn Node.js 24+, npm en een bereikbare PostgreSQL-database nodig:

```sh
npm ci
PGHOST=localhost PGPORT=5432 PGDATABASE=hoi4wise PGUSER=hoi4wise PGPASSWORD="$POSTGRES_PASSWORD" node server.mjs
```

Deze inline omgevingsvariabelen zijn Linux/macOS-shellsyntax. De lokale Node-server gebruikt standaard http://localhost:3000. Alternatief ondersteunt de app `DATABASE_URL`, die voorrang heeft op losse PG-variabelen. Voor een externe database kun je die instellen in de appservice en de lokale `postgres`-service/`depends_on` verwijderen; gebruik de TLS-instellingen van je databaseprovider. Log geen verbindings-URL's of wachtwoorden.

## GitHub-image en controles
`.github/workflows/docker.yml` installeert dependencies via het lockbestand, voert tests/contentvalidatie uit met een echte PostgreSQL 17-testservice en bouwt voor linux/amd64 en linux/arm64. De echte Compose-smoketest controleert opslaan, appherstart, database-uitval, herstel en databasecontainervervanging met behoud van het volume vóór publicatie.

Pushes naar main, master en feature/** publiceren naar `ghcr.io/sjefkebakfiets/hoi4wise`. Pull requests bouwen zonder publiceren. Tags zijn branchnaam, commit-SHA en git-versietag; `latest` komt van de standaardbranch. GitHub gebruikt `GITHUB_TOKEN` met `packages:write`, geen persoonlijk token. De repository was leeg: de eerste featurebranch werd automatisch de standaardbranch. Er is niets gemerged en er is geen afzonderlijke basisbranch voor een zinvolle PR.

```sh
npm test
npm run build
node --check server.mjs
node --check public/app.js
```

Zonder `TEST_DATABASE_URL` slaan lokale tests de echte PostgreSQL-integratietest expliciet over. Stel deze variabele alleen in op een aparte testdatabase: de test maakt en verwijdert een uniek testschema. GitHub voert deze test verplicht uit met een eigen tijdelijke database. Een lokale Docker-build vereist Docker. Zelf bouwen kan met `docker build -t hoi4wise:local .`; Compose gebruikt standaard de GHCR-image.

## Toegang en PWA
De app heeft drie afzonderlijke accounts: **ben**, **robin** en **erwin**. Ieder account heeft een eigen wachtwoord, campagnes, notities, favorieten en DLC-profiel. Er zijn geen standaardwachtwoorden. Zet voor openbare toegang een reverse proxy met HTTPS en toegangscontrole vóór de app. Publiceer de backendpoort dan alleen op loopback (`127.0.0.1:3011:3000`) of gebruik een gedeeld Docker-netwerk zonder hostpoort. PostgreSQL hoeft niet publiek bereikbaar te zijn.

Voorbeeld Caddy met een zelf gegenereerde password hash:

```caddy
hoi4.example.org {
    basic_auth {
        eigenaar YOUR_GENERATED_PASSWORD_HASH
    }
    reverse_proxy hoi4wise:3000
}
```

Gebruik een eigen sterk wachtwoord. Laat de proxy de oorspronkelijke Host doorgeven. Stel een bodylimiet van 2 MB in.

De PWA bevat manifest, PNG-/SVG-iconen en een service worker. Installeer via het browsermenu op localhost of HTTPS. Een HTTP-LAN-IP ondersteunt doorgaans geen PWA-installatie. Na één verbonden bezoek zijn interface en guides gecachet. Voor inloggen en opnieuw openen van persoonlijke campagnes is een serververbinding nodig. Binnen een reeds ingelogd open tabblad krijgen offline wijzigingen een accountgebonden herstelkopie; voeg deze expliciet samen via Instellingen zodra de server bereikbaar is. Samenvoegen maakt afzonderlijke campagnes en overschrijft bestaande campagnes niet. Dit is geen volledige synchronisatie/conflictoplossing.

## Content en gebruik
Datum, focus, factie en keuzes vul je zelf in. Taken volgen deterministisch uit datum, keuzevoorwaarden en DLC. Focus en factie zijn voorlopig logboekvelden; volledige routegebonden beslisbomen ontbreken nog. Beginners krijgen extra taaktekst; onderscheid tussen gevorderd en expert is beperkt.

Guides staan in `content/guides.json`, los van de interface. Behoud identifiers van landen, routes en taken. `scripts/seed.mjs` is de initiële generator en overschrijft handmatige content. Conditions ondersteunen `all`, `any`, `versions`; taken ondersteunen `after` en `choice`. Volledige status vereist `focusVerified`, `countryReview`, alle 14 onderdelen en inhoudelijke bronreview. Tekstlengtechecks bewijzen geen feitelijke volledigheid.

Resterend inhoudelijk werk: officiële landentags en releasables per startdatum inventariseren; focusbomen per DLC/versie controleren; historische en alternatieve focusvolgordes schrijven; routegebonden beslisbomen toevoegen; alle onderdelen reviewen. De catalogus is nog niet volledig.

## Roemenië
Zoek op Roemenië of ROM in Landen & routes. De historische overlevingsstrategie vanaf 1 januari 1936 behandelt alle 14 onderwerpen en bevat 18 datum-/DLC-/keuzegebonden taken. De guide gebruikt de bestaande unieke boom uit Death or Dishonor (geïntegreerd in de basisgame), niet de aankomende Romania Focus Pack. Vul `rom-oostfront` bij Belangrijke keuzes alleen in bij een werkelijk geplande oostelijke oorlog. De exacte focusvolgorde is nog niet volledig gecontroleerd; daarom blijft de inhoud gedeeltelijk. Broncontrole: 29 oktober 2026.

## Duitsland
De bestaande route `ger-basis` is uitgewerkt in 14 landspecifieke onderdelen en 21 taken voor 1936–1942. De oorspronkelijke taak-id's blijven behouden. Historisch basisadvies is zonder Götterdämmerung beschikbaar; optionele uitbreidingstaken zijn expliciet gefilterd. `ger-oostfront` en `ger-zeeleeuw` activeren alleen de bijbehorende voorbereidingen. De volledige focusvolgorde blijft nog te controleren, dus de guide blijft gedeeltelijk.

## Accounts, upgrade en verwijderen
Bij de eerste multi-user-start initialiseren BEN_PASSWORD, ROBIN_PASSWORD en ERWIN_PASSWORD de drie accounts. De wachtwoorden worden gesalt met scrypt opgeslagen; bestaande wachtwoorden worden bij een herstart niet door de omgevingsvariabelen overschreven. Na succesvolle initialisatie mag je die drie initiële waarden uit .env verwijderen. Bewaar POSTGRES_PASSWORD. Ontbreken de initiële wachtwoorden voor ongeactiveerde accounts, dan start de app niet en meldt de log welke configuratie nodig is.

Migratie 002 wijst bestaande single-user-data eenmalig toe aan **erwin**. Ben en robin beginnen met lege campagnes. De oorspronkelijke state-tabel blijft als ongelezen legacykopie bewaard; alle appaanvragen gebruiken user_state. Maak vóór een upgrade een databasebackup en behoud je bestaande PostgreSQL-volume of bind mount. Een oude appversie kan na migratie 002 niet zonder databaseherstel teruggezet worden.

Sessies gebruiken willekeurige cookies met HttpOnly en SameSite=Strict, verlopen na zeven dagen en worden bij uitloggen ingetrokken. Alleen de hash van het sessietoken wordt opgeslagen. Loginpogingen zijn per serverwaargenomen IP beperkt; gebruikers achter dezelfde proxy delen deze tijdelijke limiet. Zet COOKIE_SECURE=true bij HTTPS; laat false alleen voor je HTTP-LAN-test. Het wijzigen van COOKIE_SECURE vereist opnieuw aanmaken van de appcontainer en opnieuw inloggen. De gebruikerscontrole op API-aanvragen voorkomt dat een oud tabblad na een accountwissel gegevens naar het andere account schrijft.

Op het dashboard kies je een campagne en klik je **Campagne verwijderen**. Na bevestiging verwijdert de server die campagne met haar notities en voortgang uitsluitend binnen het ingelogde account. Maak eventueel eerst een JSON-export; er is geen prullenbak. Een tweede verwijdering geeft 404. Verwijderen vereist verbinding met de server.

Wachtwoord vergeten? Stel op je Docker-host ACCOUNT_USER en ACCOUNT_PASSWORD tijdelijk in (bijvoorbeeld via een verborgen `read -s` in Bash), en voer uit:

```sh
export ACCOUNT_USER ACCOUNT_PASSWORD
docker compose exec -T -e ACCOUNT_USER -e ACCOUNT_PASSWORD hoi4wise node scripts/reset-password.mjs
unset ACCOUNT_USER ACCOUNT_PASSWORD
```

Gebruik als ACCOUNT_USER ben, robin of erwin en als ACCOUNT_PASSWORD een nieuw wachtwoord van minstens 12 tekens. De reset trekt alle sessies van dat account in. Plaats wachtwoorden niet in Git of openbare logs. Browsercaches zijn niet versleuteld; gebruik op gedeelde computers aparte browserprofielen en log na gebruik uit.

Voor jouw Dockge-pad blijft de koppeling onder de postgres-service: `/mnt/raid-z-1/apps/dockge/data/hoi4wise:/var/lib/postgresql/data`. Wijzig dit pad niet tijdens de upgrade als daar je huidige data staan. De app blijft op poort 3011.

## Screenshots bij Roemeense acties
Acht Roemeense acties hebben vijf officiële HOI4-referentiebeelden voor productie, transportlogistiek, de bevoorradingskaart en politieke keuzes. Klik op een afbeelding voor vergroting; Escape of Sluiten sluit het venster. Beelden staan lokaal in public/screenshots/romania en worden door de PWA gecachet; er zijn geen externe afbeeldingsverzoeken tijdens gebruik. De tekst onder ieder beeld legt uit waar je moet kijken. Bron, copyright, algemene/landgebonden context en de leeftijd van het beeld staan erbij. Beelden uit previews van 2020/2021 zijn geen bevestiging van actuele kosten, voorwaarden of kaartgrenzen in 1.19.4. Niet iedere actie heeft een passend screenshot; er zijn geen lege afbeeldingvakken of modbeelden toegevoegd.

Metadata staat in het screenshots-register in content/guides.json; taken verwijzen met screenshots naar stabiele afbeeldings-id's. Voeg voor aanvullingen alt-tekst, eigen instructies, bron, credit, versiewaarschuwing en afmetingen toe. De validator controleert de verwijzingen en lokale bestanden.
