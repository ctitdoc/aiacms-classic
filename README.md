# aiacms-classic

Version "classic" de l'UI CMS, conçue pour projeter le même périmètre fonctionnel que `aiacms-angular` sur une stack :

- HTML
- CSS
- JavaScript vanilla
- PHP sans framework
- JSON
- MariaDB via PDO
- Apache
- Linux

## Périmètre reproduit

Fonctionnalités **non mockées** :
- Listing des documents via `/cms/list_dictionary_request_json`
- Actions de documents (liens normalisés vers l'instance CMS)
- Génération de CV via `/cms/get_resume_for_job_offer_request_json`

Fonctionnalités **mockées** :
- Record document
- Requête XQuery
- Lecture des logs
- Restructuration de CV texte
- Écran de résultat lié aux traitements mockés

## Lancement

```bash
cp .env.example .env
docker compose up -d --build
```

Puis ouvrir :

- `http://localhost:8080`

ou, depuis le réseau local :

- `http://<ip_vm>:8080`

## Configuration

Le backend CMS réel est piloté via `CMS_BASE_URL`.

Par défaut :

```dotenv
CMS_BASE_URL=http://www.sitems.org:16386
```

## Structure

- `docker-compose.yml` : stack Apache/PHP + MariaDB
- `app/Dockerfile` : image applicative
- `app/public/index.php` : front controller PHP
- `app/public/assets/app.js` : SPA vanilla JS
- `app/public/assets/styles.css` : styles UI
- `app/src/bootstrap.php` : configuration + utilitaires partagés

## Notes

- Les traitements mockés sont persistés en MariaDB afin de démontrer le rôle de PDO dans la stack classic.
- Les liens d'actions relatifs `/cms/...` et `/static/...` renvoyés par le CMS sont automatiquement réécrits vers `CMS_BASE_URL`.
