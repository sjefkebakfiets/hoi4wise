# HOI4Wise
Nederlandstalig tweede scherm voor Hearts of Iron IV. Onofficiële fanapp; geen gamekoppeling of AI-dienst nodig.

## Status en inhoud
Werkende eerste applicatieversie met twaalf **gedeeltelijke** basisguides. Exacte focusvolgordes, alternatieve routes, vrij te spelen landen en de volledige landencatalogus ontbreken nog. Alleen 1936 wordt aangeboden. Geen guide wordt als volledig aangemerkt. Patch 1.19.3 is gepubliceerd op 17 september 2026 volgens officiële aankondigingen; latere updates en alle mechanics zijn nog niet volledig gecontroleerd. Het dekkingsscherm beschrijft de beperkingen.

## Hosten met Docker Compose en PostgreSQL
De standaardconfiguratie gebruikt de gepubliceerde GitHub-image en een eigen PostgreSQL 17-container. Je hoeft geen broncode te bouwen. Beide Compose-bestanden (`docker-compose.yml` en `docker-compose.host.yml`) zijn gelijkwaardig.

1. Download `docker-compose.yml` en `.env.example` naar een vaste map op je server.
2. Kopieer `.env.example` naar `.env`.
3. Vul in `.env` een eigen lang, willekeurig databasewachtwoord in. Bijvoorbeeld genereren met `openssl rand -hex 32`. Er wordt geen standaardwachtwoord meegeleverd.

```env
PORT=3011
HOI4WISE_TAG=latest
POSTGRES_PASSWORD=
```

Vul de lege waarde achter `POSTGRES_PASSWORD=` in vóór starten. Een `.env` (of dezelfde variabele in de hostomgeving/Portainer) is nu verplicht. Het wachtwoord wordt aan beide containers doorgegeven; gebruik het niet als app-login. Het staat niet in Git. Hexadecimale wachtwoorden vermijden speciale Compose-interpolatietekens.

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
De app gebruikt `pg` met een connection pool en parameterized queries. Campagnes, DLC-profiel, notities en favorieten staan als JSONB in PostgreSQL. De bestaande single-user-opslagstructuur blijft behouden. Gelijktijdige browsers gebruiken nog steeds last-write-wins; PostgreSQL voegt geen gebruikersaccounts of automatische browserconflictoplossing toe.

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
De app is bedoeld voor één gebruiker op een vertrouwd netwerk. Alle bezoekers met toegang delen dezelfde campagnes. Er zijn geen standaardaccounts. Zet voor openbare toegang een reverse proxy met HTTPS en toegangscontrole vóór de app. Publiceer de backendpoort dan alleen op loopback (`127.0.0.1:3011:3000`) of gebruik een gedeeld Docker-netwerk zonder hostpoort. PostgreSQL hoeft niet publiek bereikbaar te zijn.

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

De PWA bevat manifest, PNG-/SVG-iconen en een service worker. Installeer via het browsermenu op localhost of HTTPS. Een HTTP-LAN-IP ondersteunt doorgaans geen PWA-installatie. Na één verbonden bezoek zijn interface en guides gecachet. Offline wijzigingen krijgen een lokale herstelkopie; voeg deze expliciet samen via Instellingen zodra de server bereikbaar is. Samenvoegen maakt afzonderlijke campagnes en overschrijft bestaande campagnes niet. Dit is geen volledige synchronisatie/conflictoplossing.

## Content en gebruik
Datum, focus, factie en keuzes vul je zelf in. Taken volgen deterministisch uit datum, keuzevoorwaarden en DLC. Focus en factie zijn voorlopig logboekvelden; volledige routegebonden beslisbomen ontbreken nog. Beginners krijgen extra taaktekst; onderscheid tussen gevorderd en expert is beperkt.

Guides staan in `content/guides.json`, los van de interface. Behoud identifiers van landen, routes en taken. `scripts/seed.mjs` is de initiële generator en overschrijft handmatige content. Conditions ondersteunen `all`, `any`, `versions`; taken ondersteunen `after` en `choice`. Volledige status vereist `focusVerified`, `countryReview`, alle 14 onderdelen en inhoudelijke bronreview. Tekstlengtechecks bewijzen geen feitelijke volledigheid.

Resterend inhoudelijk werk: officiële landentags en releasables per startdatum inventariseren; focusbomen per DLC/versie controleren; historische en alternatieve focusvolgordes schrijven; routegebonden beslisbomen toevoegen; alle onderdelen reviewen. De catalogus is nog niet volledig.
