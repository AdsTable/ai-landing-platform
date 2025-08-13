# AI Multi-Industry SaaS Landing Platform

project-root/
│
├── config/                          # Global configuration
│   ├── settings.js                  # ✅ Industries, languages, modules, payment, CRM
│   └── tenants.js                   # ✅ Pre-configured tenants for initial deployment
│
├── models/                          # Database models (MongoDB/Mongoose)
│   ├── User.js                      # ✅ Users with roles + Stripe fields + email verification
│   ├── Tenant.js                    # ✅ White-label tenants: brand, domain, theme
│   ├── Plan.js                      # ✅ Billing plans + Stripe integration fields
│   ├── Invoice.js                   # 🆕 Invoice records (if needed)
│   └── Subscription.js              # 🆕 Subscription history (if needed)
│
├── middleware/                      # Authentication, security & validation
│   ├── auth.js                      # ✅ requireAuth, requireRole, optionalAuth
│   ├── limits.js                    # ✅ Plan usage limits enforcement
│   ├── apiAuth.js                   # ✅ API key authentication
│   ├── security.js                  # 🆕 Helmet, CORS, rate limiting, XSS protection
│   ├── validation.js                # 🆕 Input validation for all routes
│   ├── errorHandler.js              # 🆕 Global error handling & logging
│   ├── monitoring.js                # 🆕 Request logging, health metrics
│   └── upload.js                    # 🆕 File upload & image optimization
│
├── services/                        # Core business logic modules
│   ├── ai.js                        # ✅ AI content generation (OpenAI)
│   ├── images.js                    # ✅ AI image generation (DALL·E)
│   ├── translate.js                 # ✅ AI translations (multi-language)
│   ├── cache.js                     # ✅ In-memory cache of generated pages
│   ├── trends.js                    # ✅ Google Trends crawling
│   ├── analytics.js                 # ✅ AI traffic analysis from GA/Matomo
│   ├── abtest.js                    # ✅ AI-controlled A/B testing logic
│   ├── seo-analyze.js               # 🆕 Competitor SEO parsing & keyword analysis
│   ├── keywords.js                  # 🆕 AI keyword generation
│   ├── billing.js                   # 🆕 Stripe integration (enhanced)
│   ├── crm.js                       # ✅ CRM integration (Bitrix24, AmoCRM)
│   ├── push.js                      # ✅ Web push notifications
│   ├── social.js                    # ✅ Auto-posting to social media
│   ├── massGenerator.js             # ✅ Cron job for enterprise mass generation
│   ├── webhooks.js                  # ✅ External events integration
│   ├── logger.js                    # 🆕 Enhanced logging (Winston + daily rotate)
│   ├── email.js                     # 🆕 Email system (verification, billing, notifications)
│   └── seed.js                      # 🆕 Database seeding with real logic
│
├── routes/                          # HTTP endpoints
│   ├── auth/                        # 🆕 Authentication routes
│   │   ├── login.js                 # 🆕 Login page & POST handler
│   │   ├── register.js              # 🆕 Registration & email verification  
│   │   └── password-reset.js        # 🆕 Password recovery (future)
│   │
│   ├── public/                      # Public-facing routes
│   │   └── main.js                  # 🆕 Enhanced with validation & monitoring
│   │
│   ├── admin/                       # Administrator UI & functions
│   │   ├── dashboard.js             # ✅ Admin dashboard
│   │   ├── generate.js              # 🆕 Enhanced with validation & logging
│   │   ├── abtests.js               # 🆕 A/B testing management
│   │   ├── seo.js                   # 🆕 SEO analysis & keyword tools
│   │   ├── social.js                # 🆕 Social media management
│   │   ├── settings.js              # 🆕 Platform settings management
│   │   ├── users.js                 # 🆕 User management with pagination
│   │   └── push-manager.js          # 🆕 Enhanced push notifications with filters
│   │
│   ├── tenant/                      # Client (tenant) dashboard & actions
│   │   ├── dashboard.js             # ✅ Tenant dashboard
│   │   ├── theme.js                 # ✅ Theme customization
│   │   └── usage.js                 # 🆕 Usage statistics & plan limits
│   │
│   ├── billing/                     # 🆕 Payment & subscription management
│   │   ├── subscription.js          # 🆕 Plans, checkout, subscription management
│   │   └── webhooks.js              # 🆕 Stripe webhook handlers
│   │
│   └── api/                         # REST API (mobile/external integrations)
│       ├── pages.js                 # ✅ Page generation API
│       ├── tenants.js               # 🆕 Tenant management API
│       ├── auth.js                  # ✅ API authentication
│       └── translate.js             # 🆕 Enhanced translation API
│
├── views/                           # EJS templates
│   ├── layouts/
│   │   └── main.ejs                 # 🆕 Enhanced with security & branding
│   │
│   ├── components/                  # Modular UI blocks
│   │   ├── reviews.ejs              # 🆕 Customer reviews component
│   │   ├── map.ejs                  # 🆕 Location map component
│   │   ├── form.ejs                 # 🆕 Contact form component
│   │   ├── product-card.ejs         # 🆕 Product showcase component
│   │   ├── lang-switcher.ejs        # ✅ Language switcher
│   │   └── admin-menu.ejs           # 🆕 Admin navigation menu
│   │
│   ├── auth/                        # 🆕 Authentication pages
│   │   ├── login.ejs                # 🆕 Login form
│   │   ├── register.ejs             # 🆕 Registration form
│   │   ├── verify-email.ejs         # 🆕 Email verification page
│   │   └── reset-password.ejs       # 🆕 Password reset (future)
│   │
│   ├── billing/                     # 🆕 Billing & subscription pages
│   │   ├── plans.ejs                # 🆕 Plan selection page
│   │   ├── checkout.ejs             # 🆕 Stripe checkout integration
│   │   └── invoices.ejs             # 🆕 Invoice history (future)
│   │
│   ├── public-pages/                # Rendered AI landing content
│   │   └── property.ejs             # 🆕 Enhanced with preview mode & components
│   │
│   ├── admin/                       # Admin panel pages
│   │   ├── dashboard.ejs            # ✅ Admin dashboard
│   │   ├── generate.ejs             # 🆕 Enhanced page generation form
│   │   ├── abtests.ejs              # 🆕 A/B testing interface
│   │   ├── seo.ejs                  # 🆕 SEO analysis tools
│   │   ├── social.ejs               # 🆕 Social media management
│   │   ├── users.ejs                # 🆕 User management with search/filters
│   │   ├── settings.ejs             # 🆕 Platform configuration
│   │   └── push-manager.ejs         # 🆕 Enhanced push notification manager
│   │
│   ├── tenant/                      # Tenant panel pages
│   │   ├── dashboard.ejs            # ✅ Tenant dashboard
│   │   ├── theme-editor.ejs         # ✅ Theme customization
│   │   └── usage.ejs                # 🆕 Usage analytics & plan limits
│   │
│   └── errors/                      # 🆕 Error pages
│       ├── 404.ejs                  # 🆕 Not found page
│       └── 500.ejs                  # 🆕 Server error page
│
├── public/                          # Static assets
│   ├── css/
│   │   ├── style.css                # ✅ Main stylesheet
│   │   └── admin.css                # ✅ Admin panel styles
│   │
│   ├── js/
│   │   ├── usage.js                 # 🆕 Usage analytics charts
│   │   ├── push-subscribe.js        # ✅ Push notification subscription
│   │   └── pwa-register.js          # ✅ PWA service
│   │
│   ├── uploads/                     # 🆕 User uploaded files directory
│   │
│   ├── manifest.json                # ✅ PWA manifest
│   ├── service-worker.js            # ✅ PWA offline & push logic
│   ├── icon-192.png                 # ✅ PWA icon (small)
│   └── icon-512.png                 # ✅ PWA icon (large)
│
├── logs/                            # Enhanced logging system
│   ├── app-YYYY-MM-DD.log           # 🆕 Application logs (daily rotation)
│   ├── error-YYYY-MM-DD.log         # 🆕 Error logs (daily rotation)
│   ├── security-YYYY-MM-DD.log      # 🆕 Security events (daily rotation)
│   └── ai-YYYY-MM-DD.log            # 🆕 AI operations (daily rotation)
│
├── test/                            # Testing & quality assurance
│   └── routes-checker.js            # 🆕 Automated route & page validation
│
├── migrations/                      # 🆕 Database migration scripts (future)
│   └── .gitkeep                     # 🆕 Placeholder for migration files
│
├── docs/                            # 🆕 Project documentation (future)
│   ├── api.md                       # 🆕 API documentation
│   └── deployment.md                # 🆕 Deployment guide
│
├── .env                             # Environment variables for production
├── .env.example                     # 🆕 Complete environment template
├── Dockerfile                       # ✅ Docker containerization
├── docker-compose.yml               # ✅ Multi-container orchestration
├── package.json                     # 🆕 Enhanced with all dependencies
├── server.js                        # 🆕 Enhanced with security & all routes
├── cron-jobs.js                     # 🆕 Scheduled tasks with real logic
├── openapi.yaml                     # 🆕 API specification for external developers
└── README.md                        # 🆕 Complete project documentation


# SERVICES INTERDEPENDENCIES

logger.js (BASE) 
├── ai.js → logger.js, billing.js (для лимитов)
├── images.js → logger.js, ai.js (для prompts?)
├── translate.js → logger.js, ai.js (OpenAI API)
├── cache.js → logger.js  
├── billing.js → logger.js, User, Plan, Invoice, Subscription
├── email.js → logger.js, utils/url.js
├── push.js → logger.js, User
├── seo-analyze.js → logger.js, keywords.js ⚠️
├── keywords.js → logger.js, ai.js ⚠️
├── social.js → logger.js, ?
├── trends.js → logger.js
├── analytics.js → logger.js, ?  
├── abtest.js → logger.js, cache.js, analytics.js ⚠️
├── massGenerator.js → ALL SERVICES ⚠️ CRITICAL
├── webhooks.js → logger.js, billing.js, User
└── seed.js → ALL MODELS ⚠️
