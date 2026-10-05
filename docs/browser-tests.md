# Проверки браузером

Скрипты используют DevTools Protocol через встроенный `WebSocket` Node 22+. Отдельный Playwright/Cypress не установлен.

Запустите Edge/Chrome с отдельным профилем и remote debugging. Пример Windows:

```powershell
Start-Process -FilePath 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe' `
  -ArgumentList '--headless=new','--disable-gpu','--remote-debugging-port=9223',`
    '--user-data-dir=C:\Users\zpvis\GolandProjects\point\var\browser','--no-first-run','about:blank' `
  -WindowStyle Hidden
```

Не используйте основной браузерный профиль. Скрипты очищают cookies только тестового браузера.

## Smoke

```powershell
$env:APP_URL='http://localhost:8080'
node scripts/browser-smoke.mjs
```

Проверяет начало регистрации, три ответа, восстановление после refresh и отсутствие горизонтального overflow на ширине 390 px. Создаёт незавершённую тестовую регистрацию; используйте отдельную тестовую базу и для smoke.

## Полный путь пользователя и админки

1. Создайте отдельную временную PostgreSQL-схему, например `point_browser_test`, **не public**.
2. Запустите вторую копию приложения:

```powershell
$env:DATABASE_URL='postgresql://postgres:change-me@localhost:5432/point_dev?sslmode=disable&search_path=point_browser_test'
$env:APP_ENV='development'
$env:HTTP_ADDR='127.0.0.1:8081'
$env:PUBLIC_ORIGIN='http://localhost:8081'
$env:UPLOAD_DIR='var/browser-test-uploads'
go run ./cmd/point
```

3. В другом терминале:

```powershell
$env:APP_URL='http://localhost:8081'
$env:E2E_DISPOSABLE_DATABASE='1'
node scripts/browser-e2e.mjs
```

Проверяет UI целиком: создание аккаунта → организация → ручной адрес с разными координатами входа и здания → возможности → расписание → загрузка двух PNG → OTHER-контакт → изменение на SELF → review без старого контакта → submit → «Мои Point».

4. В **тестовой схеме** назначьте созданному пользователю роль admin:

```sql
UPDATE point_browser_test.users SET role='admin' WHERE email LIKE 'browser-%@example.test';
```

5. Запустите `node scripts/browser-admin.mjs`. Скрипт создаёт draft в UI, добавляет custom YES_NO о парковке, публикует v2, проходит этот вопрос в новой регистрации и проверяет его сохранение через API; затем запрашивает изменения по созданной заявке.

6. Остановите тестовый backend и удалите **только созданную тестовую схему**. Test uploads находятся в отдельном каталоге. Скриншоты сохраняются в `var/screenshots`, не входят в git.

Основные проверки бизнес-логики, версии существующих сессий, безопасности и нормализованных полей выполняются также Go integration tests в автоматически изолированных схемах.
