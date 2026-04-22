# Alexa AI Quiz — مشروع مبسّط

مهارة Alexa لتقييم تعليمي بالصوت، مع استخراج أسئلة من PDF بالذكاء الاصطناعي.

## هيكل المشروع

```
Alexa_AI_Project/
├── backend/                    # الباك اند (Python)
│   ├── api/                    # Controllers (Alexa, Dashboard, Web API)
│   ├── core/                   # Business logic (quiz_logic, pdf, embeddings)
│   ├── database/               # Models + Repositories
│   ├── scripts/                # سكربتات التحضير والتشغيل
│   │   ├── build_rag.py
│   │   ├── build_question_cache.py
│   │   ├── import_cache_to_db.py
│   │   ├── migrate_phase4.py
│   │   ├── run_all.py          # يشغّل Alexa + Dashboard + Web API
│   │   └── run_ngrok.py
│   ├── data/                   # question_cache.json, quiz_index.faiss, etc.
│   ├── config.py
│   └── requirements.txt
├── frontend/                   # Next.js (من WebSite/web-platform-for-kids)
├── docs/                       # WORKFLOW_PHASE4, SETUP_WINDOWS, ARCHITECTURE
├── run.py                      # تشغيل (يستدعي backend.scripts.run_all)
└── .env
```

## التثبيت

```bash
cd Alexa_AI_Project
python3 -m venv venv
source venv/bin/activate   # أو venv\Scripts\activate على Windows
pip install -r requirements.txt
cp backend/.env.example backend/.env
# أضف GROQ_API_KEY و DATABASE_URL في backend/.env
```

**ملاحظة:** إذا ظهر خطأ "flask could not be resolved" في Cursor، فعّل البيئة الافتراضية واختر المفسّر: `Ctrl+Shift+P` → "Python: Select Interpreter" → اختر `./venv/bin/python`

## الاستخدام
1. `cp ~/Downloads/adhd.pdf backend/data/sample.pdf`
2. **بناء RAG:** `python -m backend.scripts.build_rag backend/data/sample.pdf`
3. **بناء الكاش:** `python -m backend.scripts.build_question_cache 20`
4. **استيراد للـ DB:** `python -m backend.scripts.import_cache_to_db`
5. **Phase 4 (مرة واحدة):** `python -m backend.scripts.migrate_phase4`
6. **ولي مستقل — أعمدة المرحلة 1 (مرة واحدة إن لم تُشغَّل `init_db` بعد):** `python -m backend.scripts.migrate_parent_standalone_phase1`
7. **تشغيل السيرفر:** `python run.py`

- Alexa: `http://localhost:5002/alexa_quiz`
- Dashboard: `http://localhost:5003/dashboard`
- Web API: `http://localhost:5004/api/`

## نشر سحابي (بدون تشغيل محلي)

لجعل Alexa تعمل دائمًا بدون `run.py` على جهازك، انشر **خدمتين Backend منفصلتين**:

### 1) خدمة Web API (لوحة الويب)
- Start Command:
```bash
python run.py
```
- في البيئة السحابية، `run.py` يشتغل كـ Web API فقط على `PORT`.

### 2) خدمة Alexa Webhook
- Start Command:
```bash
python -m backend.scripts.run_alexa_server
```
- Endpoint المهارة في Alexa Console:
```text
https://YOUR-ALEXA-SERVICE-DOMAIN/alexa_quiz
```

### Environment Variables (على الخدمتين)
- `DATABASE_URL`
- `GROQ_API_KEY`
- `PORT` (تضيفه المنصة تلقائيًا غالبًا)

### نشر تلقائي عبر `render.yaml`
- الملف جاهز في الجذر: `render.yaml`
- من Render:
  1. `New` → `Blueprint`
  2. اختر نفس repo
  3. Render سيقرأ `render.yaml` وينشئ خدمتين:
     - `eduvox-web-api`
     - `eduvox-alexa`
  4. أضف القيم السرية يدويًا:
     - `DATABASE_URL`
     - `GROQ_API_KEY`

### ملاحظات مهمة للإنتاج
- لا تستخدم `localhost` أو `ngrok` في Alexa Console للإنتاج.
- يجب أن يكون endpoint ثابتًا (HTTPS public URL).
- إذا الخطة المجانية تنوّم الخدمة (sleep/cold start)، قد تظهر رسالة:
  `there was a problem with the requested skill's response`.
  الأفضل خدمة بدون sleep لمهارات Alexa.
