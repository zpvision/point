# Questionnaire engine

## Структура

`internal/app/model.go` определяет типизированные Graph / Section / Question / Option / Condition, registry типов и bindings. `validation.go` проверяет ответы, `sessions.go` вычисляет runtime и создаёт сущности, `admin.go` управляет версиями и заявками. Общие таблицы не привязаны к Point.

Для `USER_REGISTRATION` и `POINT_REGISTRATION` есть доменные завершители. Другие опубликованные сценарии можно проходить через общий API сессий после авторизации; completion сохраняет завершённую сессию без создания бизнес-сущности. Для будущей сущности добавляется её доменный завершитель, а не новый движок вопросов. Регистрация складов/перевозчиков сейчас не реализована.

## Версии

1. Администратор открывает сценарий и создаёт draft из последней версии.
2. В draft редактируются граф, разделы, варианты и условия. Сохранение использует `revision`; устаревшая запись получает 409.
3. Publish проверяет уникальные keys/options, типы, bindings, условия и обязательный доменный контракт.
4. В одной транзакции draft становится PUBLISHED, прежняя текущая версия — ARCHIVED, указатель current обновляется, записывается audit event.
5. Новая сессия получает current version ID; существующая продолжает прежнюю независимо от архивации.

Условия ссылаются на стабильный question key. После изменения key в редакторе ссылки внутри draft обновляются. Удаление вопроса с зависимыми условиями блокируется UI; невалидный граф нельзя опубликовать через API.

## Условия и ответы

Операторы: `equals`, `not_equals`, `contains`, `not_contains`, `is_empty`, `is_not_empty`, `greater_than`, `less_than`. Условия одной `group` соединяются AND, группы соединяются OR. Без условий вопрос видим, если enabled. `not_equals` / `not_contains` для ещё не отвеченного вопроса возвращают false; для явной проверки отсутствия ответа используется `is_empty`.

Вопросы обходятся по order раздела и order вопроса. Condition source должен идти раньше. Это исключает циклы и делает вычисление воспроизводимым. Условный вопрос видит только активные ответы предыдущих вопросов. Никаких SQL/JS/eval выражений нет.

После ответа backend возвращает весь актуальный session state: `answers`, effective `questions`, `next`, `answered`, `total`, `percent`, domain `preview`. Скрытые ответы помечаются inactive. При возврате в ветку старые скрытые ответы не восстанавливаются автоматически: пользователь должен подтвердить актуальные данные заново.

PASSWORD никогда не попадает в `questionnaire_answers`. Bcrypt hash временно находится в закрытом поле сессии, затем переносится в `users.password_hash`, а временный hash удаляется. API отдаёт только маску наличия пароля. Сам пароль передаётся непосредственно в обработчик auth binding.

`POST answers` — upsert по `(session_id, question_key)`. Session row блокируется на время изменения и complete. Complete повторно валидирует актуальные обязательные ответы, принадлежность файлов, контактное лицо и реквизиты; повторный complete возвращает прежний entity ID.

## Системные и custom вопросы

Binding выбирается из whitelist. Каждый binding разрешает конкретные question types; SQL identifiers от администратора не принимаются. Семантические значения option отделены от label. Бизнес-значения для контакта: `SELF` / `OTHER` или boolean для YES_NO. Организация `ip` требует 12 цифр ИНН, `ooo` — 10; дополнительные типы допускают валидный ИНН согласно его длине.

В INN_LOOKUP реквизиты являются единым структурированным ответом. ADDRESS_MAP содержит address, normalized components, addressLatitude/addressLongitude, entranceLatitude/entranceLongitude, markerAdjusted, confirmed. SCHEDULE содержит семь дней с локальными opening/closing/break times. Системные данные Point нормализуются при submit. Фото хранятся вне БД; answer содержит только attachment IDs и категории.

Для вопроса «Есть ли парковка?» достаточно создать YES_NO с пустым binding, сохранить и опубликовать draft. В новой сессии вопрос появится автоматически. Ответ будет в «Дополнительных ответах» заявки, без миграции или изменения source code.

## Добавление типа или binding разработчиком

Новый type:

1. Добавить enum в `Types`, типизированную структуру complex answer при необходимости.
2. Добавить authoritative validation в `validateAnswer` и unit tests.
3. Добавить локальный renderer в `QuestionRenderer` и форматирование истории в `answerLabel`.
4. При необходимости добавить настройки редактора. Реестр для select берётся с backend, не дублируется на frontend.

Новый binding:

1. Добавить имя и допустимые types в `Bindings`.
2. Добавить обработку в доменный завершитель и, если необходимо, колонку миграцией.
3. Если поле обязательно для создания сущности, включить его в проверку publish и complete.
4. Проверить отсутствие конфликтов с другими bindings и покрыть доменную запись тестом.

## API

Все URL имеют префикс `/api`. Ошибки: `{code, message, question_key?}`. Внутренние ошибки и payload с персональными данными не логируются.

| Метод / путь | Назначение |
|---|---|
| GET `/me` | Текущий пользователь и публичный browser key |
| PATCH `/me/phone` | Добавить/обновить телефон текущего пользователя; при выборе «Я» без телефона UI запрашивает его перед отправкой Point |
| POST `/auth/login`, `/auth/logout` | Авторизация |
| GET `/scenarios/{code}` | Текущая опубликованная версия |
| POST `/registration/sessions` | `{code,restart?}`: создать или возобновить |
| GET `/registration/sessions/{id}` | Состояние своей сессии |
| POST `.../{id}/answers` | `{key,value,version_id}` |
| POST `.../{id}/complete`, `.../{id}/cancel` | Завершить / отменить |
| GET/POST `.../{id}/attachments` | Восстановить список / multipart upload |
| GET/DELETE `/attachments/{id}` | Авторизованное чтение / удаление |
| GET `/organizations`, `/points` | Свои организации / точки |
| GET `/applications/{id}` | Заявка владельца или администратора |
| POST `/applications/{id}/reopen` | Исправление NEEDS_CHANGES |
| POST `/organization-lookup` | `{inn}` |
| GET `/geo/suggest?q=...`, `/geo/geocode?q=...` | Подсказки / прямой и обратный геокодинг |
| POST `/verification/start`, `/verification/confirm` | OTP challenge / подтверждение |
| GET `/admin/registry` | Допустимые types и bindings |
| GET/POST `/admin/scenarios` | Список / новый сценарий |
| GET `/admin/scenarios/{id}` | История версий с графами |
| POST `/admin/scenarios/{id}/draft` | Новый или существующий draft |
| PUT `/admin/versions/{id}` | `{graph,revision}` |
| POST `/admin/versions/{id}/publish` | `{revision}` |
| POST `/admin/versions/{id}/preview` | Stateless draft preview без доменных записей |
| GET `/admin/applications` | Фильтры status/city/search/from/to, последние 200 |
| POST `/admin/applications/{id}/moderate` | `{status,comment}` |

Auth — HttpOnly SameSite=Lax cookie с SHA-256 token hash в БД. Анонимная регистрация привязана к отдельному случайному HttpOnly cookie. Чужие сессии/заявки/файлы возвращают 404; admin endpoints возвращают 403 обычному пользователю. Mutating browser requests проверяются по Origin.

## Статусы и аудит

Сессия: IN_PROGRESS → COMPLETED / CANCELLED. NEEDS_CHANGES можно reopen в IN_PROGRESS, затем повторный submit возвращает ту же заявку в IN_REVIEW. Данные сохраняются по закреплённой версии.

Заявка: IN_REVIEW → APPROVED / NEEDS_CHANGES / REJECTED. Повторное административное решение вне IN_REVIEW запрещено. Point: PENDING → ACTIVE при одобрении; SUSPENDED/CLOSED предусмотрены в модели, отдельный операционный UI в этот этап не включён.

`audit_events` сохраняет администратора, время публикации, решения и комментарии, а также отправку и повторную отправку заявки. Опубликованные версии и исходные answers доступны для истории.
