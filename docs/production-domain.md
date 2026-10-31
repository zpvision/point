# Production: 2point.ru

Рабочий Git-репозиторий — `point-git` локально и `/var/www/s1point` на сервере.
Кабинет — `https://app.2point.ru`, лендинг — `https://2point.ru`.
Nginx/SSL уже настроены пользователем; их серверная конфигурация в репозитории отсутствует.
Развёртывание агентом не выполнялось.

## Причина и настройки

Проверка Origin раньше сравнивала заголовок с `PUBLIC_ORIGIN`, по умолчанию
`http://localhost:8080`. На сервере нужно согласовать окружение **процесса systemd**,
а не только файл `.env`: Go не загружает dotenv самостоятельно.

```dotenv
APP_ENV=production
PUBLIC_ORIGIN=https://app.2point.ru
HTTP_ADDR=127.0.0.1:8082
STATIC_DIR=/var/www/s1point/web/dist
```

Без завершающего `/`. Production по умолчанию использует новый origin;
явно заданный другой origin останавливает запуск с понятной ошибкой.
`.env.example` сохраняет настройки локальной разработки и содержит комментарии
для Production. Не копировать его поверх существующего серверного `.env`.
DATABASE_URL, UPLOAD_DIR, пароли, токены и настройки подключения не изменяются.

Все запросы кабинета используют относительный `/api`, `credentials: same-origin`;
загрузка файлов через XHR тоже использует относительный адрес. Nginx должен
проксировать `/api` и `/legal` на `127.0.0.1:8082` с сохранением Origin и Referer.
Не подменять Origin адресом upstream и не добавлять разрешающий CORS в Nginx.
Backend отклоняет посторонние Origin, включая origin лендинга, без CORS grants.
Для записи с `point_auth` или `point_consent` нужен точный Origin либо Referer;
`Sec-Fetch-Site: cross-site` также блокируется. Server-to-server вызовы без cookies
по-прежнему проходят собственную проверку авторизации endpoint.

Cookies `point_auth` и `point_consent`: host-only (Domain отсутствует), Path=/,
HttpOnly, Secure в Production, SameSite=Lax. Сессии остаются в PostgreSQL;
куки старого домена браузер новому не передаст. На новом домене потребуется
повторный вход и, при необходимости, подтверждение согласия. Не расширять Domain.
Редиректов на старый домен в рабочем приложении не найдено.

Ссылки из кабинета на лендинг обновлены централизованно через `landingHref()`.
Исходников самого лендинга в этой рабочей папке нет: в его отдельном проекте
проверить кнопки входа `https://app.2point.ru/account` и регистрации
`https://app.2point.ru/account/points/new`. Внешние ограничения ключей Yandex,
провайдеров авторизации и доставки писем проверить в их кабинетах вручную.

## Сохранённые контакты и юридические сведения

Контакт **office@s1point.ru** намеренно сохранён:

- `web/src/lib/point-consent-document.ts`;
- `web/src/lib/point-offer-document.json`;
- `internal/app/design-documents/{consent,privacy,offer}.json` (встроенные копии);
- `web/public/locales/interface.json`.

Оператор ООО «Федерация», ИНН 1102077082, адрес Республика Коми, г. Ухта,
ул. Сенюкова, д. 17 и остальные реквизиты/тексты/версии документов не менялись.
Исторические подтверждения в БД не изменялись. Новые миграции не добавлялись.
Юридические PDF в `web/public/documents` и `web/public/faq` не переписывались;
замена их контактных данных требует отдельного согласования.

В соседнем `app` (визуальный образец Cloudflare, вне Git-репозитория) аналогичный
email сохранён в `CONSENT_SETUP.md`, `lib/point-consent-document.ts`,
`lib/point-offer-document.json`, `public/locales/interface.json`.
Пример адреса в `app/README.md` обновлён отдельно; этот файл не попадёт в коммит
`point-git`. Других рабочих HTTP-ссылок на прежние домены в текстовых исходниках
не осталось. В `internal/app/origin_test.go` старые URL оставлены как
отрицательные примеры: сервер обязан отклонять их.
Локальные `.env` и `app/.env.local` старых доменов не содержат и не изменялись.

## Подготовка коммита локально

Проверено локально 31.10.2026: Go — 20 тестов верхнего уровня прошли,
16 PostgreSQL-тестов пропущены (TEST_DATABASE_URL не задан, Docker daemon
недоступен); `go vet` и `go build` успешны. Frontend — 6 файлов / 21 тест
прошли; `npm run lint` и `npm run build` (включая TypeScript) успешны.
`git diff --check` успешен. Полный DB/E2E-прогон и браузерная проверка
Production остаются обязательной отдельной проверкой, их успех не заявляется.

```sh
cd point-git
git diff --check
git diff HEAD
git add .env.example README.md docs/design-migration.md docs/production-domain.md \
  internal/app/server.go internal/app/origin.go internal/app/origin_test.go \
  web/src/lib/site-links.ts web/src/design/cabinet.tsx
git diff --cached --stat
git commit -m "Configure 2point.ru production origin and preserve CSRF protection"
git push origin HEAD
git rev-parse HEAD
```

Коммит и push выполняет пользователь. Не добавлять `.env`, секреты или `var/`.

## Обновление сервера вручную

Выполнять в согласованное окно. Нужны Go из `go.mod`, Node/npm, доступ к Git,
sudo и резервные копии БД/UPLOAD_DIR по обычному регламенту. Проверить, что
systemd запускает `/var/www/s1point/point` из `/var/www/s1point`, а Nginx
использует порт 8082. Все команды ниже в одной Bash-сессии.

```bash
set -euo pipefail
cd /var/www/s1point
test -z "$(git status --porcelain)" # При локальных изменениях остановиться.
previous_commit=$(git rev-parse HEAD)
git fetch origin
target_commit=ВСТАВИТЬ_SHA_ПРОВЕРЕННОГО_КОММИТА
git cat-file -e "$target_commit^{commit}"
test -z "$(git diff --name-only "$previous_commit" "$target_commit" -- internal/app/migrations)"
git merge --ff-only "$target_commit"

release_dir="/var/www/s1point/var/releases/$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -p "$release_dir"
npm ci
npm test
npm run lint
# Изолированная сборка: текущий web/dist продолжает обслуживать пользователей.
npm run build -- --outDir "$release_dir/web"
go vet ./cmd/... ./internal/...
go test ./cmd/... ./internal/... -count=1
go build -o "$release_dir/point" ./cmd/point
test -s "$release_dir/web/index.html"

# Полный прогон DB-тестов: отдельно задайте TEST_DATABASE_URL тестовой БД.
# Не подставлять production DATABASE_URL. Без переменной DB-тесты пропускаются.
# TEST_DATABASE_URL='...' go test ./cmd/... ./internal/... -count=1

backup_dir="/var/backups/s1point/$(date -u +%Y%m%dT%H%M%SZ)"
sudo install -d -m 700 "$backup_dir"
printf '%s\n' "$previous_commit" | sudo tee "$backup_dir/previous-commit" >/dev/null
sudo cp -a /var/www/s1point/point "$backup_dir/point"
sudo install -d /etc/systemd/system/s1point.service.d
dropin=/etc/systemd/system/s1point.service.d/zz-2point-domain.conf
if sudo test -e "$dropin"; then
  sudo cp -a "$dropin" "$backup_dir/domain.conf"
fi

# Существующие EnvironmentFile и секреты не меняются.
# EnvironmentFile может перекрывать Environment, поэтому только несекретные
# настройки задаём отдельным последним EnvironmentFile.
sudo tee "$release_dir/production-domain.env" >/dev/null <<EOF
APP_ENV=production
PUBLIC_ORIGIN=https://app.2point.ru
HTTP_ADDR=127.0.0.1:8082
STATIC_DIR=$release_dir/web
EOF
sudo chmod 644 "$release_dir/production-domain.env"
sudo tee "$dropin" >/dev/null <<EOF
[Service]
EnvironmentFile=$release_dir/production-domain.env
EOF

# Проверить, что более поздние drop-in не перекрывают эти настройки,
# сервис имеет доступ к release_dir, и Nginx получает frontend от Go.
# Если Nginx напрямую читает web/dist, до переключения отдельно согласовать
# его root с новым release_dir/web и проверить nginx -t.
sudo install -m 755 "$release_dir/point" /var/www/s1point/point.next
sudo mv -f /var/www/s1point/point.next /var/www/s1point/point
sudo systemctl daemon-reload
sudo systemctl restart s1point.service
sudo systemctl is-active --quiet s1point.service

curl --fail --silent --show-error https://app.2point.ru/api/me
curl --fail --silent --show-error https://app.2point.ru/api/point-consent >/dev/null
curl --silent --show-error -o /tmp/2point-origin-check.json -w '%{http_code}\n' \
  -X POST https://app.2point.ru/api/auth/logout -H 'Origin: https://untrusted.example'
# Ожидается 403 / ORIGIN_FORBIDDEN.
cat /tmp/2point-origin-check.json
```

Проверить в браузере вход, выход, согласие, сохранение анкеты, загрузку файла,
кабинет и маркетплейс. В Network: запросы только к `app.2point.ru/api`, без
ORIGIN_FORBIDDEN для штатных действий; cookies имеют перечисленные атрибуты.
Проверить переходы в обе стороны с реального лендинга. Live API и авторизованные
потоки Production локальными тестами не подтверждаются.

Если сервер раздаёт frontend напрямую через Nginx, нельзя считать обновление
завершённым до переключения его root. Фактическая конфигурация сервера здесь
недоступна, автоматически менять её по предположениям не следует.

## Откат из той же сессии

```bash
sudo install -m 755 "$backup_dir/point" /var/www/s1point/point.rollback
sudo mv -f /var/www/s1point/point.rollback /var/www/s1point/point
if sudo test -f "$backup_dir/domain.conf"; then
  sudo cp -a "$backup_dir/domain.conf" "$dropin"
else
  sudo rm -f "$dropin"
fi
sudo systemctl daemon-reload
sudo systemctl restart s1point.service
sudo systemctl is-active --quiet s1point.service
```

Если изменяли root Nginx, восстановить прежний root и выполнить `nginx -t`
перед reload. Старые файлы frontend не удалялись. Откат возвращает прежнее
окружение, включая возможную исходную ошибку Origin; это восстановление
артефактов, а не альтернативное исправление домена. Данные БД не откатываются.
Git остаётся на новом коммите: исправлять дальнейшие изменения через отдельный
коммит/revert, без `reset --hard` на сервере.
