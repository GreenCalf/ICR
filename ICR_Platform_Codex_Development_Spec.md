# ICR Platform — спецификация для разработки

## 0. Назначение документа

Этот Markdown-документ предназначен как исходный контекст для Codex/AI-разработчика при создании приложения.

Задача: разработать локальную систему интеллектуальной обработки машиночитаемых бумажных форм с посимвольным распознаванием рукопечатного текста.

Рабочее название проекта: **ICR Platform**.

---

## 1. Краткое описание проекта

ICR Platform — локальное web-приложение для обработки бумажных форм, заполненных рукопечатными символами в отдельных клетках.

Система должна:

1. Создавать шаблоны бумажных форм.
2. Хранить эталонные изображения форм.
3. Поддерживать реперы для выравнивания сканов/фото.
4. Размечать поля и клетки формы.
5. Загружать заполненные документы.
6. Формировать пакеты документов для операторов.
7. Выполнять локальное посимвольное распознавание.
8. Показывать оператору каждую клетку и результат модели.
9. Позволять оператору подтверждать или исправлять символ.
10. Накоплять обучающий датасет.
11. Выгружать проверенные данные в XLSX, CSV, JSON, XML или через API.

---

## 2. Зафиксированные архитектурные решения

### 2.1. Технологический стек

Frontend:

- Angular 20.

Backend:

- Node.js.
- Express.js.
- Желательно TypeScript, если это не усложняет старт проекта.
- Не использовать NestJS без отдельного решения.

Database:

- PostgreSQL.

Image processing:

- Sharp.

Machine Learning inference:

- ONNX Runtime через `onnxruntime-node`.

ML-модели:

- локальные `.onnx` модели.

Запуск:

- без Docker.
- Компоненты запускаются как отдельные службы/процессы.

---

## 3. Важные ограничения

1. OCR/ICR должен работать локально.
2. Не использовать облачные OCR API.
3. Не использовать Docker в штатной эксплуатации.
4. Recognition Worker должен быть отдельным процессом, чтобы не блокировать Express API.
5. Финальным значением символа считается подтверждение оператора, а не ответ модели.
6. ML-модуль должен быть сменным: CNN, embedding или hybrid могут быть заменены без переписывания бизнес-логики.
7. На этапе MVP допускается использовать заглушку распознавания вместо реальной модели.

---

## 4. Общая архитектура

```text
Angular 20 Frontend
        |
        v
Express.js Backend API
        |
        +----------------------+
        |                      |
        v                      v
PostgreSQL              Recognition Worker
                               |
                               v
                         Sharp preprocessing
                               |
                               v
                         ONNX Runtime
                               |
                               v
                         Local ONNX Model
```

---

## 5. Логика обработки документа

```text
Загрузка документа
        |
        v
Определение шаблона формы
        |
        v
Поиск реперов
        |
        v
Выравнивание документа
        |
        v
Нарезка клеток
        |
        v
Подготовка изображения клетки
        |
        v
ONNX inference / Recognition Stub
        |
        v
Символ + confidence
        |
        v
Операторская проверка
        |
        v
Подтверждённые данные
        |
        v
Экспорт / обучение модели
```

---

## 6. Основные роли пользователей

### ADMIN

Администратор системы.

Права:

- управление пользователями;
- создание и редактирование шаблонов форм;
- разметка реперов;
- разметка полей и клеток;
- управление моделями;
- просмотр всех пакетов и документов.

### OPERATOR

Оператор проверки.

Права:

- работа с назначенными пакетами;
- просмотр документов в пакете;
- подтверждение символов;
- исправление символов.

### SUPERVISOR

Руководитель/контролёр.

Права:

- просмотр статистики;
- контроль операторов;
- контроль пакетов;
- просмотр качества распознавания;
- запуск повторной обработки.

---

## 7. Структура репозитория

Проект без Docker.

```text
icr-platform/

├── frontend/
│   └── Angular 20 application
│
├── backend/
│   ├── src/
│   │   ├── app.ts
│   │   ├── server.ts
│   │   ├── config/
│   │   ├── db/
│   │   ├── middleware/
│   │   ├── modules/
│   │   │   ├── auth/
│   │   │   ├── users/
│   │   │   ├── forms/
│   │   │   ├── documents/
│   │   │   ├── batches/
│   │   │   ├── recognition/
│   │   │   ├── exports/
│   │   │   └── models/
│   │   └── shared/
│   ├── package.json
│   └── .env.example
│
├── recognition-worker/
│   ├── src/
│   │   ├── worker.ts
│   │   ├── config/
│   │   ├── image/
│   │   │   ├── sharp.service.ts
│   │   │   ├── marker.service.ts
│   │   │   └── cell-crop.service.ts
│   │   ├── recognition/
│   │   │   ├── onnx.service.ts
│   │   │   ├── decoder.service.ts
│   │   │   └── recognition.service.ts
│   │   └── jobs/
│   ├── package.json
│   └── .env.example
│
├── database/
│   ├── migrations/
│   ├── seeds/
│   └── schema.sql
│
├── models/
│   ├── handwriting_v1.onnx
│   └── README.md
│
├── storage/
│   ├── templates/
│   ├── documents/
│   ├── cells/
│   └── exports/
│
├── docs/
│   ├── OPZ.md
│   ├── TZ.md
│   └── API.md
│
└── README.md
```

---

## 8. Основные модули приложения

### 8.1. Auth Module

Назначение:

- авторизация пользователей;
- выдача JWT;
- проверка ролей.

Минимальные функции:

- login;
- logout на клиенте;
- проверка текущего пользователя;
- middleware авторизации.

---

### 8.2. Users Module

Назначение:

- управление пользователями системы.

Сущность:

```ts
type UserRole = 'ADMIN' | 'OPERATOR' | 'SUPERVISOR';

interface User {
  id: number;
  login: string;
  passwordHash: string;
  fullName: string;
  role: UserRole;
  active: boolean;
  createdAt: string;
}
```

---

### 8.3. Forms Module

Назначение:

- создание и редактирование шаблонов форм;
- загрузка эталонного изображения;
- настройка версии формы;
- хранение статуса шаблона.

Форма содержит:

```text
Form Template
    |
    +-- Markers
    |
    +-- Fields
            |
            +-- Cells
```

---

### 8.4. Form Markers Module

Назначение:

- хранение реперов формы.

Реперы используются для:

- поиска положения документа;
- исправления наклона;
- коррекции перспективы;
- точного совмещения документа с шаблоном.

Типы реперов:

- SQUARE;
- CROSS;
- CIRCLE;
- QR;
- CUSTOM.

---

### 8.5. Form Fields Module

Назначение:

- описание логических полей формы.

Примеры полей:

- surname;
- name;
- birth_date;
- document_number;
- code.

Поле имеет:

- имя;
- отображаемое название;
- тип;
- правила;
- длину;
- набор клеток.

---

### 8.6. Form Cells Module

Назначение:

- хранение координат каждой клетки.

Клетка является минимальной единицей распознавания.

Каждая клетка имеет:

- координаты x/y;
- ширину/высоту;
- номер;
- принадлежность к полю.

---

### 8.7. Documents Module

Назначение:

- загрузка заполненных документов;
- хранение файлов;
- управление статусами обработки.

Статусы документа:

```text
NEW
PROCESSING
RECOGNIZED
CHECKING
COMPLETED
EXPORTED
ERROR
```

---

### 8.8. Batches Module

Назначение:

- создание пакетов обработки для операторов.

Пакет — группа документов.

Статусы пакета:

```text
NEW
ASSIGNED
IN_PROGRESS
COMPLETED
CLOSED
```

---

### 8.9. Recognition Module

Назначение:

- создание задач распознавания;
- получение результатов от Recognition Worker;
- хранение результатов по клеткам.

---

### 8.10. Operator Verification Module

Назначение:

- показ результата оператору;
- подтверждение или исправление символа;
- сохранение истории действий;
- формирование обучающих примеров.

---

### 8.11. Character Samples Module

Назначение:

- накопление собственного обучающего датасета.

Сохранять:

- изображение клетки;
- символ модели;
- confidence;
- подтверждённый символ;
- тип поля;
- контекст формы;
- оператора;
- дату подтверждения.

---

### 8.12. ML Models Module

Назначение:

- хранение информации о версиях моделей;
- выбор активной модели;
- управление заменой модели.

---

### 8.13. Exports Module

Назначение:

- выгрузка проверенных данных.

Форматы:

- XLSX;
- CSV;
- JSON;
- XML;
- API.

---

## 9. База данных PostgreSQL

Ниже базовая структура БД для MVP.

### 9.1. users

```sql
CREATE TABLE users (
    id BIGSERIAL PRIMARY KEY,
    login VARCHAR(100) UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    full_name VARCHAR(255),
    role VARCHAR(50) NOT NULL CHECK (role IN ('ADMIN', 'OPERATOR', 'SUPERVISOR')),
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP
);
```

---

### 9.2. form_templates

```sql
CREATE TABLE form_templates (
    id BIGSERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    version VARCHAR(50) NOT NULL DEFAULT '1.0',
    description TEXT,
    image_path TEXT,
    width INTEGER,
    height INTEGER,
    status VARCHAR(50) NOT NULL DEFAULT 'DRAFT',
    created_by BIGINT REFERENCES users(id),
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP
);
```

Статусы:

```text
DRAFT
ACTIVE
ARCHIVED
```

---

### 9.3. form_markers

```sql
CREATE TABLE form_markers (
    id BIGSERIAL PRIMARY KEY,
    template_id BIGINT NOT NULL REFERENCES form_templates(id) ON DELETE CASCADE,
    marker_type VARCHAR(50) NOT NULL,
    name VARCHAR(100),
    x INTEGER NOT NULL,
    y INTEGER NOT NULL,
    width INTEGER NOT NULL,
    height INTEGER NOT NULL,
    required BOOLEAN NOT NULL DEFAULT TRUE,
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
```

---

### 9.4. form_fields

```sql
CREATE TABLE form_fields (
    id BIGSERIAL PRIMARY KEY,
    template_id BIGINT NOT NULL REFERENCES form_templates(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    label VARCHAR(255),
    field_type VARCHAR(50) NOT NULL,
    max_length INTEGER,
    allowed_chars TEXT,
    validation_rule JSONB,
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
```

Примеры `field_type`:

```text
TEXT
NUMBER
DATE
CODE
MIXED
```

---

### 9.5. form_cells

```sql
CREATE TABLE form_cells (
    id BIGSERIAL PRIMARY KEY,
    field_id BIGINT NOT NULL REFERENCES form_fields(id) ON DELETE CASCADE,
    cell_number INTEGER NOT NULL,
    x INTEGER NOT NULL,
    y INTEGER NOT NULL,
    width INTEGER NOT NULL,
    height INTEGER NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE(field_id, cell_number)
);
```

---

### 9.6. documents

```sql
CREATE TABLE documents (
    id BIGSERIAL PRIMARY KEY,
    template_id BIGINT NOT NULL REFERENCES form_templates(id),
    original_file_path TEXT NOT NULL,
    normalized_file_path TEXT,
    status VARCHAR(50) NOT NULL DEFAULT 'NEW',
    error_message TEXT,
    uploaded_by BIGINT REFERENCES users(id),
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP
);
```

---

### 9.7. processing_batches

```sql
CREATE TABLE processing_batches (
    id BIGSERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    template_id BIGINT REFERENCES form_templates(id),
    status VARCHAR(50) NOT NULL DEFAULT 'NEW',
    assigned_operator_id BIGINT REFERENCES users(id),
    total_count INTEGER NOT NULL DEFAULT 0,
    processed_count INTEGER NOT NULL DEFAULT 0,
    created_by BIGINT REFERENCES users(id),
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    started_at TIMESTAMP,
    finished_at TIMESTAMP
);
```

---

### 9.8. batch_documents

```sql
CREATE TABLE batch_documents (
    id BIGSERIAL PRIMARY KEY,
    batch_id BIGINT NOT NULL REFERENCES processing_batches(id) ON DELETE CASCADE,
    document_id BIGINT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    status VARCHAR(50) NOT NULL DEFAULT 'WAITING',
    assigned_at TIMESTAMP,
    completed_at TIMESTAMP,
    UNIQUE(batch_id, document_id)
);
```

Статусы:

```text
WAITING
PROCESSING
CHECKED
ERROR
```

---

### 9.9. recognition_jobs

PostgreSQL-based очередь задач для Recognition Worker.

```sql
CREATE TABLE recognition_jobs (
    id BIGSERIAL PRIMARY KEY,
    document_id BIGINT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    status VARCHAR(50) NOT NULL DEFAULT 'PENDING',
    priority INTEGER NOT NULL DEFAULT 0,
    attempts INTEGER NOT NULL DEFAULT 0,
    error_message TEXT,
    locked_by VARCHAR(255),
    locked_at TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    started_at TIMESTAMP,
    finished_at TIMESTAMP
);
```

Статусы:

```text
PENDING
RUNNING
DONE
FAILED
```

---

### 9.10. ml_models

```sql
CREATE TABLE ml_models (
    id BIGSERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    version VARCHAR(50) NOT NULL,
    model_type VARCHAR(50) NOT NULL,
    file_path TEXT NOT NULL,
    accuracy NUMERIC(6,5),
    active BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
```

Примеры `model_type`:

```text
CNN_CLASSIFIER
EMBEDDING_ENCODER
HYBRID
STUB
```

---

### 9.11. recognition_sessions

```sql
CREATE TABLE recognition_sessions (
    id BIGSERIAL PRIMARY KEY,
    document_id BIGINT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    model_id BIGINT REFERENCES ml_models(id),
    job_id BIGINT REFERENCES recognition_jobs(id),
    status VARCHAR(50) NOT NULL DEFAULT 'STARTED',
    started_at TIMESTAMP NOT NULL DEFAULT NOW(),
    finished_at TIMESTAMP,
    error_message TEXT
);
```

---

### 9.12. recognition_cells

```sql
CREATE TABLE recognition_cells (
    id BIGSERIAL PRIMARY KEY,
    document_id BIGINT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    session_id BIGINT REFERENCES recognition_sessions(id) ON DELETE SET NULL,
    cell_id BIGINT NOT NULL REFERENCES form_cells(id),
    image_path TEXT,

    model_symbol VARCHAR(10),
    model_confidence NUMERIC(6,5),

    visual_class VARCHAR(100),
    alternatives JSONB,

    verified_symbol VARCHAR(10),
    verified_by BIGINT REFERENCES users(id),
    verified_at TIMESTAMP,

    status VARCHAR(50) NOT NULL DEFAULT 'RECOGNIZED',
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
```

Статусы:

```text
RECOGNIZED
WAITING_CONFIRMATION
CONFIRMED
CORRECTED
SKIPPED
```

`alternatives` пример:

```json
[
  { "symbol": "О", "confidence": 0.72 },
  { "symbol": "0", "confidence": 0.68 }
]
```

---

### 9.13. operator_actions

```sql
CREATE TABLE operator_actions (
    id BIGSERIAL PRIMARY KEY,
    recognition_cell_id BIGINT NOT NULL REFERENCES recognition_cells(id) ON DELETE CASCADE,
    operator_id BIGINT NOT NULL REFERENCES users(id),
    action_type VARCHAR(50) NOT NULL,
    old_value VARCHAR(10),
    new_value VARCHAR(10),
    action_time TIMESTAMP NOT NULL DEFAULT NOW()
);
```

`action_type`:

```text
CONFIRM
CORRECT
SKIP
REOPEN
```

---

### 9.14. character_samples

```sql
CREATE TABLE character_samples (
    id BIGSERIAL PRIMARY KEY,
    recognition_cell_id BIGINT REFERENCES recognition_cells(id) ON DELETE SET NULL,
    template_id BIGINT REFERENCES form_templates(id),
    field_id BIGINT REFERENCES form_fields(id),
    cell_id BIGINT REFERENCES form_cells(id),

    image_path TEXT NOT NULL,

    model_symbol VARCHAR(10),
    model_confidence NUMERIC(6,5),

    verified_symbol VARCHAR(10) NOT NULL,
    visual_class VARCHAR(100),
    field_type VARCHAR(50),

    approved BOOLEAN NOT NULL DEFAULT TRUE,
    used_for_training BOOLEAN NOT NULL DEFAULT FALSE,

    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
```

---

### 9.15. exports

```sql
CREATE TABLE exports (
    id BIGSERIAL PRIMARY KEY,
    batch_id BIGINT REFERENCES processing_batches(id) ON DELETE SET NULL,
    format VARCHAR(20) NOT NULL,
    file_path TEXT,
    status VARCHAR(50) NOT NULL DEFAULT 'NEW',
    created_by BIGINT REFERENCES users(id),
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    finished_at TIMESTAMP,
    error_message TEXT
);
```

Форматы:

```text
XLSX
CSV
JSON
XML
API
```

---

### 9.16. Индексы

```sql
CREATE INDEX idx_documents_template_id ON documents(template_id);
CREATE INDEX idx_documents_status ON documents(status);

CREATE INDEX idx_batches_status ON processing_batches(status);
CREATE INDEX idx_batches_operator ON processing_batches(assigned_operator_id);

CREATE INDEX idx_recognition_cells_document ON recognition_cells(document_id);
CREATE INDEX idx_recognition_cells_cell ON recognition_cells(cell_id);
CREATE INDEX idx_recognition_cells_status ON recognition_cells(status);
CREATE INDEX idx_recognition_cells_verified_by ON recognition_cells(verified_by);

CREATE INDEX idx_character_samples_symbol ON character_samples(verified_symbol);
CREATE INDEX idx_character_samples_training ON character_samples(used_for_training);

CREATE INDEX idx_recognition_jobs_status ON recognition_jobs(status);
CREATE INDEX idx_recognition_jobs_priority ON recognition_jobs(priority DESC);
```

---

## 10. REST API MVP

Базовый префикс:

```text
/api
```

---

### 10.1. Auth

#### POST `/api/auth/login`

Request:

```json
{
  "login": "admin",
  "password": "password"
}
```

Response:

```json
{
  "token": "jwt-token",
  "user": {
    "id": 1,
    "login": "admin",
    "fullName": "Administrator",
    "role": "ADMIN"
  }
}
```

---

### 10.2. Users

#### GET `/api/users`

Только ADMIN/SUPERVISOR.

#### POST `/api/users`

Только ADMIN.

Request:

```json
{
  "login": "operator1",
  "password": "password",
  "fullName": "Оператор 1",
  "role": "OPERATOR"
}
```

---

### 10.3. Forms

#### GET `/api/forms`

Response:

```json
[
  {
    "id": 1,
    "name": "Анкета клиента",
    "version": "1.0",
    "status": "ACTIVE"
  }
]
```

#### POST `/api/forms`

Request multipart/form-data:

- name;
- version;
- description;
- image.

Response:

```json
{
  "id": 1,
  "name": "Анкета клиента",
  "version": "1.0",
  "imagePath": "storage/templates/form_1.png"
}
```

#### GET `/api/forms/:id`

Должен вернуть форму, реперы, поля и клетки.

#### PUT `/api/forms/:id`

Обновление метаданных формы.

---

### 10.4. Markers

#### POST `/api/forms/:formId/markers`

Request:

```json
{
  "markerType": "SQUARE",
  "name": "top-left",
  "x": 100,
  "y": 100,
  "width": 20,
  "height": 20,
  "required": true
}
```

#### PUT `/api/markers/:id`

#### DELETE `/api/markers/:id`

---

### 10.5. Fields

#### POST `/api/forms/:formId/fields`

Request:

```json
{
  "name": "surname",
  "label": "Фамилия",
  "fieldType": "TEXT",
  "maxLength": 20,
  "allowedChars": "АБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯ",
  "validationRule": {
    "required": true
  },
  "sortOrder": 1
}
```

#### PUT `/api/fields/:id`

#### DELETE `/api/fields/:id`

---

### 10.6. Cells

#### POST `/api/fields/:fieldId/cells`

Request:

```json
{
  "cells": [
    { "cellNumber": 1, "x": 100, "y": 300, "width": 30, "height": 40 },
    { "cellNumber": 2, "x": 132, "y": 300, "width": 30, "height": 40 }
  ]
}
```

---

### 10.7. Documents

#### POST `/api/documents/upload`

multipart/form-data:

- templateId;
- file.

Response:

```json
{
  "id": 100,
  "templateId": 1,
  "status": "NEW",
  "originalFilePath": "storage/documents/doc_100.png"
}
```

#### GET `/api/documents`

Query:

- status;
- templateId;
- page;
- limit.

#### GET `/api/documents/:id`

---

### 10.8. Recognition Jobs

#### POST `/api/documents/:id/recognize`

Создаёт задачу для Recognition Worker.

Response:

```json
{
  "jobId": 500,
  "documentId": 100,
  "status": "PENDING"
}
```

#### GET `/api/recognition/jobs/:id`

---

### 10.9. Batches

#### POST `/api/batches`

Request:

```json
{
  "name": "Пакет 001",
  "templateId": 1,
  "documentIds": [100, 101, 102],
  "assignedOperatorId": 5
}
```

#### GET `/api/batches`

#### GET `/api/batches/:id`

#### POST `/api/batches/:id/assign`

Request:

```json
{
  "operatorId": 5
}
```

---

### 10.10. Operator Workspace

#### GET `/api/operator/batches`

Возвращает назначенные пакеты текущего оператора.

#### GET `/api/operator/batches/:batchId/next-cell`

Возвращает следующую клетку для проверки.

Response:

```json
{
  "batchId": 1,
  "documentId": 100,
  "recognitionCellId": 9001,
  "field": {
    "id": 10,
    "name": "surname",
    "label": "Фамилия"
  },
  "cell": {
    "id": 200,
    "cellNumber": 5
  },
  "cellImagePath": "/files/cells/doc_100_cell_200.png",
  "modelSymbol": "О",
  "modelConfidence": 0.72,
  "alternatives": [
    { "symbol": "О", "confidence": 0.72 },
    { "symbol": "0", "confidence": 0.68 }
  ]
}
```

#### PUT `/api/operator/cells/:recognitionCellId/verify`

Request:

```json
{
  "verifiedSymbol": "0",
  "actionType": "CORRECT"
}
```

Response:

```json
{
  "id": 9001,
  "status": "CORRECTED",
  "verifiedSymbol": "0"
}
```

---

### 10.11. Exports

#### POST `/api/exports`

Request:

```json
{
  "batchId": 1,
  "format": "XLSX"
}
```

Response:

```json
{
  "exportId": 700,
  "status": "NEW"
}
```

#### GET `/api/exports/:id`

---

## 11. Recognition Worker

Recognition Worker — отдельный Node.js процесс.

### 11.1. Назначение

Worker должен:

1. Периодически искать задачи в `recognition_jobs`.
2. Блокировать задачу.
3. Загружать документ.
4. Загружать шаблон формы.
5. Искать реперы.
6. Выравнивать документ.
7. Нарезать клетки.
8. Сохранять изображения клеток.
9. Запускать ONNX-модель или stub.
10. Сохранять `recognition_cells`.
11. Обновлять статусы документа и задачи.

---

### 11.2. Алгоритм worker

```text
while true:
    find next PENDING job
    lock job
    set RUNNING
    process document
    save recognition cells
    set job DONE
    set document RECOGNIZED
```

---

### 11.3. Вариант SQL-блокировки job

```sql
UPDATE recognition_jobs
SET status = 'RUNNING',
    locked_by = $1,
    locked_at = NOW(),
    started_at = NOW()
WHERE id = (
    SELECT id
    FROM recognition_jobs
    WHERE status = 'PENDING'
    ORDER BY priority DESC, created_at ASC
    LIMIT 1
    FOR UPDATE SKIP LOCKED
)
RETURNING *;
```

---

### 11.4. Stub распознавания для MVP

До подключения реальной модели использовать заглушку:

```ts
interface RecognitionResult {
  symbol: string;
  confidence: number;
  alternatives: Array<{
    symbol: string;
    confidence: number;
  }>;
}
```

Пример:

```ts
function recognizeCellStub(): RecognitionResult {
  return {
    symbol: '',
    confidence: 0,
    alternatives: []
  };
}
```

Или можно возвращать случайные символы из allowed_chars поля для тестирования UI.

---

### 11.5. ONNX интерфейс

```ts
interface IRecognitionEngine {
  recognizeCell(input: RecognizeCellInput): Promise<RecognizeCellOutput>;
}

interface RecognizeCellInput {
  imagePath: string;
  allowedChars?: string;
  fieldType?: string;
}

interface RecognizeCellOutput {
  symbol: string;
  confidence: number;
  visualClass?: string;
  alternatives: Array<{
    symbol: string;
    confidence: number;
  }>;
}
```

---

## 12. Frontend Angular 20

### 12.1. Структура

```text
frontend/src/app/

├── core/
│   ├── auth/
│   ├── guards/
│   ├── interceptors/
│   └── services/
│
├── shared/
│   ├── components/
│   ├── pipes/
│   └── models/
│
├── features/
│   ├── auth/
│   ├── users/
│   ├── forms/
│   ├── documents/
│   ├── batches/
│   ├── operator/
│   ├── exports/
│   └── models/
│
└── app.routes.ts
```

---

### 12.2. Основные маршруты

```ts
export const routes = [
  { path: 'login', component: LoginPageComponent },

  { path: 'forms', component: FormListPageComponent },
  { path: 'forms/new', component: FormCreatePageComponent },
  { path: 'forms/:id/designer', component: FormDesignerPageComponent },

  { path: 'documents', component: DocumentListPageComponent },
  { path: 'documents/upload', component: DocumentUploadPageComponent },
  { path: 'documents/:id', component: DocumentDetailsPageComponent },

  { path: 'batches', component: BatchListPageComponent },
  { path: 'batches/:id', component: BatchDetailsPageComponent },

  { path: 'operator', component: OperatorDashboardPageComponent },
  { path: 'operator/batches/:id', component: OperatorWorkspacePageComponent },

  { path: 'exports', component: ExportListPageComponent },

  { path: '', redirectTo: 'forms', pathMatch: 'full' }
];
```

---

### 12.3. Экран конструктора форм

Функции:

- показать эталонное изображение;
- масштабирование;
- режим добавления репера;
- режим добавления поля;
- режим добавления клеток;
- редактирование координат;
- удаление элементов;
- сохранение.

Режимы:

```text
SELECT
ADD_MARKER
ADD_FIELD
ADD_CELLS
EDIT
```

---

### 12.4. Экран рабочего места оператора

Должен показывать:

1. Название пакета.
2. Прогресс.
3. Изображение документа.
4. Подсветку текущей клетки.
5. Увеличенное изображение клетки.
6. Поле формы.
7. Номер клетки.
8. Ответ модели.
9. Confidence.
10. Альтернативы.
11. Кнопки подтверждения и исправления.

Клавиатурные действия желательно поддержать:

```text
Enter  -> подтвердить
Backspace -> исправить
ArrowRight -> следующая
ArrowLeft -> предыдущая
```

---

## 13. Выгрузка результатов

### 13.1. Сборка значения поля

Поле собирается из подтверждённых клеток:

```text
fieldValue = recognition_cells
  .filter(field_id)
  .sort(cell_number)
  .map(verified_symbol)
  .join('')
```

Если `verified_symbol` отсутствует, документ не должен считаться полностью проверенным.

---

### 13.2. JSON export example

```json
{
  "batchId": 1,
  "documents": [
    {
      "documentId": 100,
      "fields": {
        "surname": "ИВАНОВ",
        "birth_date": "12.05.1990",
        "document_number": "001234"
      }
    }
  ]
}
```

---

### 13.3. CSV export example

```csv
document_id,surname,birth_date,document_number
100,ИВАНОВ,12.05.1990,001234
```

---

## 14. ML Research Module

Основная система не зависит от финального выбора модели.

Нужно предусмотреть сменный recognition engine.

### 14.1. Вариант A: CNN classifier

```text
Cell Image -> CNN -> Symbol + Confidence
```

Плюсы:

- проще;
- быстрее реализовать;
- хорошо подходит для MVP.

Минусы:

- хуже объяснимость;
- требует больше размеченных данных;
- сложнее решает О/0 без контекста.

---

### 14.2. Вариант B: Embedding encoder

```text
Cell Image -> Encoder -> Vector -> Similarity Search -> Symbol
```

Плюсы:

- лучше для малого датасета;
- удобно искать похожие символы;
- лучше подходит для накопления собственной базы.

Минусы:

- сложнее реализация;
- нужен слой принятия решения;
- нет прямого ответа модели.

---

### 14.3. Вариант C: Hybrid

```text
Cell Image
    |
    v
Encoder
    |
    +--> Classifier
    |
    +--> Similarity Search
    |
    v
Decision Layer with field context
```

Потенциально лучший вариант для промышленной версии.

---

### 14.4. Обучение на Node.js

Обучение допускается делать на Node.js в отдельном процессе:

```text
node api.js
node trainer.worker.js
```

Важно:

- обучение не должно блокировать API;
- обучение не является обязательным для MVP;
- ML-эксперименты должны быть изолированы.

---

## 15. Особые случаи распознавания

Похожие символы:

```text
О / 0
З / 3
Б / 8
И / 1
С / C
```

Решение:

```text
Изображение клетки
+
Контекст поля
+
allowed_chars
+
validation_rule
+
ответ оператора
=
финальный символ
```

Пример:

- поле `surname`, allowed_chars = русские буквы => круглый символ трактуется как `О`;
- поле `document_number`, allowed_chars = цифры => круглый символ трактуется как `0`.

---

## 16. Этапы разработки

### Этап 0. Предпроектная подготовка

Цель:

- утвердить требования и архитектуру.

Задачи:

- описать роли;
- описать модули;
- утвердить стек;
- утвердить запуск без Docker;
- утвердить структуру БД.

Результат:

- утверждённая документация.

---

### Этап 1. Архитектура и каркас проекта

Цель:

- создать техническую основу.

Задачи:

- создать monorepo;
- создать backend;
- создать frontend;
- создать recognition-worker;
- настроить PostgreSQL connection;
- настроить .env;
- создать базовую структуру модулей.

Результат:

- стартовый проект запускается локально.

---

### Этап 2. База данных

Цель:

- реализовать хранение основных сущностей.

Задачи:

- создать SQL миграции;
- создать таблицы;
- создать индексы;
- подготовить seed-пользователя admin;
- подключить backend к БД.

Результат:

- БД готова для работы MVP.

---

### Этап 3. Backend API

Цель:

- создать API для основных модулей.

Задачи:

- auth;
- users;
- forms;
- markers;
- fields;
- cells;
- documents;
- recognition jobs;
- batches;
- operator verification;
- exports.

Результат:

- API доступно и покрывает основной сценарий.

---

### Этап 4. Angular Frontend

Цель:

- создать UI.

Задачи:

- login;
- layout;
- формы;
- дизайнер формы;
- документы;
- пакеты;
- рабочее место оператора;
- выгрузки.

Результат:

- пользователь может пройти основной сценарий через UI.

---

### Этап 5. Recognition Worker MVP

Цель:

- реализовать обработку документа.

Задачи:

- получение job;
- загрузка шаблона;
- crop клеток;
- сохранение cell images;
- stub recognition;
- сохранение recognition_cells.

Результат:

- документы превращаются в набор клеток для оператора.

---

### Этап 6. Операторская проверка

Цель:

- обеспечить контроль результата.

Задачи:

- показать текущую клетку;
- показать картинку клетки;
- показать результат модели;
- подтвердить/исправить;
- сохранить operator_actions;
- создать character_samples.

Результат:

- оператор подтверждает символы.

---

### Этап 7. Экспорт

Цель:

- выгрузить проверенные данные.

Задачи:

- сборка полей из клеток;
- экспорт JSON;
- экспорт CSV;
- экспорт XLSX;
- статус EXPORTED.

Результат:

- проверенный пакет выгружается.

---

### Этап 8. Интеграция ONNX

Цель:

- заменить stub реальной моделью.

Задачи:

- подключить `onnxruntime-node`;
- подготовить tensor input;
- декодировать output;
- учитывать allowed_chars;
- сохранять alternatives.

Результат:

- работает локальное распознавание.

---

### Этап 9. ML Research

Цель:

- выбрать оптимальную модель.

Задачи:

- сбор датасета;
- сравнение CNN и embedding;
- измерение accuracy;
- анализ О/0, З/3, Б/8, И/1;
- экспорт лучшей модели в ONNX.

Результат:

- выбран подход для промышленной версии.

---

### Этап 10. Тестирование и ввод в эксплуатацию

Цель:

- подготовить приложение к работе.

Задачи:

- функциональное тестирование;
- тестирование API;
- тестирование UI;
- нагрузочное тестирование worker;
- проверка прав доступа;
- инструкция по установке без Docker.

Результат:

- система готова к пилотной эксплуатации.

---

## 17. MVP: минимальный рабочий сценарий

MVP должен позволить:

1. Войти в систему.
2. Создать шаблон формы.
3. Загрузить эталонное изображение формы.
4. Разметить поле и клетки.
5. Загрузить заполненный документ.
6. Создать задачу распознавания.
7. Worker нарезает клетки.
8. Stub/модель создаёт результаты.
9. Оператор подтверждает символы.
10. Система собирает значения полей.
11. Пользователь выгружает результат.

---

## 18. Definition of Done для MVP

MVP считается готовым, если:

- приложение запускается без Docker;
- PostgreSQL подключён;
- есть ADMIN пользователь;
- можно создать форму;
- можно создать поле;
- можно создать клетки;
- можно загрузить документ;
- можно создать recognition job;
- worker создаёт `recognition_cells`;
- оператор видит клетки;
- оператор подтверждает или исправляет символ;
- создаются `operator_actions`;
- создаются `character_samples`;
- можно выгрузить JSON/CSV;
- нет обращения к внешним OCR API.

---

## 19. Приоритеты реализации

### P0 — обязательно для MVP

- Auth.
- PostgreSQL schema.
- Forms.
- Fields.
- Cells.
- Documents upload.
- Recognition jobs.
- Worker with stub.
- Operator workspace.
- Verification.
- JSON/CSV export.

### P1 — желательно

- Markers UI.
- Real Sharp crop.
- Cell image preview.
- XLSX export.
- Batch assignment.
- Basic statistics.

### P2 — после MVP

- Real ONNX model.
- Marker-based alignment.
- ML research module.
- Embedding model.
- Training worker.
- Advanced analytics.
- XML/API export.

---

## 20. Команды запуска без Docker

Примерно:

### Backend

```bash
cd backend
npm install
npm run dev
```

### Recognition Worker

```bash
cd recognition-worker
npm install
npm run dev
```

### Frontend

```bash
cd frontend
npm install
npm start
```

### PostgreSQL

PostgreSQL должен быть установлен как локальная или серверная служба.

Настройки БД передаются через `.env`.

---

## 21. Env variables

### backend/.env.example

```env
NODE_ENV=development
PORT=3000

DATABASE_HOST=localhost
DATABASE_PORT=5432
DATABASE_NAME=icr_platform
DATABASE_USER=icr_user
DATABASE_PASSWORD=icr_password

JWT_SECRET=change_me

STORAGE_ROOT=../storage
```

### recognition-worker/.env.example

```env
NODE_ENV=development

DATABASE_HOST=localhost
DATABASE_PORT=5432
DATABASE_NAME=icr_platform
DATABASE_USER=icr_user
DATABASE_PASSWORD=icr_password

STORAGE_ROOT=../storage
MODELS_ROOT=../models

WORKER_ID=worker-1
POLL_INTERVAL_MS=2000

RECOGNITION_MODE=STUB
ACTIVE_MODEL_PATH=../models/handwriting_v1.onnx
```

---

## 22. Что Codex должен сгенерировать первым

Рекомендуемый порядок генерации кода:

1. Создать структуру репозитория.
2. Создать `database/schema.sql`.
3. Создать backend Express skeleton.
4. Подключить PostgreSQL.
5. Создать auth module.
6. Создать forms module.
7. Создать documents module.
8. Создать recognition_jobs module.
9. Создать recognition-worker со stub-обработкой.
10. Создать Angular skeleton.
11. Создать страницы:
    - login;
    - forms list;
    - form designer placeholder;
    - documents upload;
    - operator workspace.
12. Реализовать JSON/CSV export.

---

## 23. Важная инструкция для реализации

На первом этапе не пытаться сразу реализовать идеальное распознавание.

Сначала построить рабочий бизнес-процесс:

```text
Форма -> Документ -> Клетки -> Оператор -> Экспорт
```

ML заменить stub-движком до тех пор, пока UI, БД и workflow не заработают стабильно.

---

## 24. Термины

### ICR

Intelligent Character Recognition — интеллектуальное распознавание символов, в нашем проекте посимвольное.

### Form Template

Шаблон бумажной формы.

### Marker / Репер

Опорная метка на форме для выравнивания.

### Field

Логическое поле формы, например `surname`.

### Cell

Одна клетка одного символа.

### Document

Загруженный заполненный экземпляр формы.

### Batch

Пакет документов, назначенный оператору.

### Recognition Cell

Результат распознавания одной клетки.

### Character Sample

Подтверждённый пример символа для будущего обучения.

---

## 25. Финальная концепция

Система строится вокруг связки:

```text
Шаблон формы
    ->
Клетки
    ->
Распознавание
    ->
Операторское подтверждение
    ->
Обучающий датасет
    ->
Выгрузка
```

Это не просто OCR, а локальная платформа ввода данных из бумажных форм с возможностью дальнейшего улучшения собственной модели распознавания.
