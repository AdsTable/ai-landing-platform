## https://www.perplexity.ai/search/izuchit-besedu-po-ssylke-i-soz-acZUv0JzQFiu97rzK_FWZw

# Как использовать при старте проекта

// Можно сделать начальный «сиди́нг» в базу:
// добавляем файл config/tenants.js и сервис начальной загрузки арендаторов (tenants) в базу, чтобы при первом запуске проекта у вас были сразу готовые демо-арендаторы с настройками бренда. Это упростит тестирование white-label функционала.

// config/tenants.js
// Predefined tenants for initial setup/demo
export default [
    {
        name: "Demo Real Estate",
        domain: "realestate.localhost",
        logoUrl: "/img/demo-re-logo.png",
        primaryColor: "#007bff",
        allowedIndustries: ["real_estate"],
        allowedLanguages: ["en", "es"],
        planName: "Pro" // will be matched with Plan model in DB
    },
    {
        name: "Demo Tourism",
        domain: "tourism.localhost",
        logoUrl: "/img/demo-tour-logo.png",
        primaryColor: "#ff6600",
        allowedIndustries: ["tourism"],
        allowedLanguages: ["en", "es"],
        planName: "Enterprise"
    }
];



// В server.js при первом старте:
// Сервис начальной загрузки services/seed.js
import Tenant from '../models/Tenant.js';
import Plan from '../models/Plan.js';
import tenantsData from '../config/tenants.js';

export async function seedTenants() {
    for (const t of tenantsData) {
        const plan = await Plan.findOne({ name: t.planName });
        if (!plan) continue;
        const exists = await Tenant.findOne({ domain: t.domain });
        if (!exists) {
            await Tenant.create({
                name: t.name,
                domain: t.domain,
                logoUrl: t.logoUrl,
                primaryColor: t.primaryColor,
                allowedIndustries: t.allowedIndustries,
                allowedLanguages: t.allowedLanguages,
                planId: plan._id
            });
            console.log(`Tenant "${t.name}" created.`);
        } else {
            console.log(`Tenant "${t.name}" already exists.`);
        }
    }
}

// Вызов сервиса при запуске в server.js или основном файле

// Добавить в начало или в точку инициализации после подключения к базе:
import { seedTenants } from './services/seed.js';

// После успешного подключения к MongoDB
mongoose.connect(process.env.MONGO_URI)
    .then(async () => {
        console.log("MongoDB connected");
        await seedTenants(); // Инициализация демо-арендаторов
    })
    .catch(err => console.error(err));

// Как использовать для тестирования
//    При первом запуске сервера демо-арендаторы из config/tenants.js будут автоматически созданы в базе.
//    Для локальной разработки можно добавить доменные записи в hosts файл (например 127.0.0.1 realestate.localhost), чтобы переключаться между брендами.
//    Это позволит вам проверить white-label тему сайта, лого, цвета и разрешённые языки/индустрии без ручного добавления арендаторов в базу.
//    В продакшен режиме вы можете отключить автоматический сидинг или использовать админку для управления арендаторами.


# 1. Настройка файла hosts на вашем компьютере

Файл hosts позволяет сопоставить определённые домены с локальным IP-адресом (обычно 127.0.0.1 для localhost). Это позволяет обращаться к вашему локальному серверу через удобные доменные имена вместо стандартного localhost:3000.
Для Windows:
    Откройте Блокнот или любой текстовый редактор с правами администратора.
    Отредактируйте файл:
C:\Windows\System32\drivers\etc\hosts

Добавьте строки для ваших тестовых доменов, например:
    127.0.0.1 realestate.localhost
    127.0.0.1 tourism.localhost
    Сохраните файл.

Для macOS / Linux:
    Откройте терминал.
    Выполните команду для редактирования файла hosts:
sudo nano /etc/hosts

Добавьте строки:
    127.0.0.1 realestate.localhost
    127.0.0.1 tourism.localhost
    Сохраните изменения (Ctrl+O, Enter) и выйдите (Ctrl+X).

# 2. Запуск локального сервера

Убедитесь, что ваш сервер прослушивает все запросы, в том числе с указанных доменных имён (обычно это IP 0.0.0.0 или localhost).

Запустите сервер, он будет принимать запросы на URL вида:

    http://realestate.localhost:3000

    http://tourism.localhost:3000

# 3. Механизм переключения брендов (тенантов) по домену

В вашем серверном коде (например, в Express middleware) уже есть логика загрузки данных арендатора (тенанта) по домену запроса:

javascript
app.use(async (req, res, next) => {
    const host = req.hostname.toLowerCase();
    const tenant = await Tenant.findOne({ domain: host });
    if (tenant) req.tenant = tenant;
    next();
});

Она означает, что при заходе на http://realestate.localhost:3000 будет загружен бренд "Demo Real Estate", а на http://tourism.localhost:3000 — "Demo Tourism".
# 4. Тестирование

    Откройте в браузере http://realestate.localhost:3000 — сайт покажет бренд с логотипом, цветами и настройками для Real Estate.

    Откройте http://tourism.localhost:3000 — отобразится бренд для Tourism.

    Вы можете добавить в hosts ещё поддомены с разными конфигурациями, чтобы тестировать разные бренды одновременно.

Таким образом вы сможете удобно тестировать white-label и multi-tenant функционал, переключаясь между локальными доменами, не меняя в коде настройки.
!!(Если потребуется, запросите помощь с конкретными примерами middleware и настройками сервера для обработки таких запросов или советами по работе с SSL для локальной разработки.)


# Services/translate.js

    Чтобы не генерировать похожий контент с нуля для каждого языка, а переводить уже созданный AI‑текст на другие языки, сохраняя ключевые слова и маркетинговый смысл.

    Может использоваться:

        при создании лендингa для нескольких языков

        в админ‑панели (редактор контента → перевести на 10 языков)

        для UI (интерфейсные тексты берутся из словаря и переводятся один раз)

    Работает с тем же OpenAI API либо с любым другим сервисом (например, DeepL API).

## 💡 Как мы интегрируем translate.js в проект

    В генерации страниц
        При создании страницы на основном языке → сразу делаем переводы на все языки, указанные в tenant.allowedLanguages.
        Сохраняем их в кэш и/или БД.

    В админ-панели
        Добавляем кнопку «Translate to…» рядом с полем ввода/редактирования описания.

    В API
        POST /api/translate → принимает текст и возвращает перевод.

    В UI-тексты
        Можем централизованно хранить словари и прогонять их через translateText() при добавлении нового языка.

# 📌 Как запустить test "routes-checker.js"

    Установите зависимости:
npm install axios tough-cookie axios-cookiejar-support dotenv

    В .env укажите:
BASE_URL=http://localhost:3000
TEST_ADMIN_EMAIL=admin@example.com
TEST_ADMIN_PASS=123456
TEST_TENANT_EMAIL=tenant@example.com
TEST_TENANT_PASS=123456
API_KEY=ваш_api_ключ


    Запустите сервер, затем:
node test/routes-checker.js

# Подключить при старте сервера cron-jobs, если хотим:

import "./cron-jobs.js";
