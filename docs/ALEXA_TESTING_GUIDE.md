# دليل تجربة Alexa كطفل ومتابعة النتائج

الهدف: تشغيل مهارة Alexa كأنك الطفل، ربطها بالمريض، أداء الكويز، ورؤية النتائج في لوحة الطبيب/ولي الأمر.

---

## الخطوات المطلوبة

### 1. إضافة مريض والحصول على الكود

- الطبيب يدخل إلى **Add Patient** ويضيف مريضاً (طفلاً) مع بيانات الولي
- عند النجاح، كل مريض يحصل على **alexa_code** (مثل: `A1B2C3D4`)
- هذا الكود مطلوب لربط Alexa بالمريض

**ملاحظة:** حالياً الـ alexa_code لا يظهر في جدول المرضى بالداشبورد. يمكن عرضه في صفحة تفاصيل المريض أو في عمود بالجدول.

---

### 2. تهيئة ملف الأسئلة (Question Cache)

الكويز يعتمد على `backend/data/question_cache.json`. إذا كان الملف فارغاً أو غير موجود:

```bash
# بناء السؤال من PDF
python -m backend.scripts.build_question_cache

# أو استيراد الكاش إلى قاعدة البيانات
python -m backend.scripts.import_cache_to_db
```

---

### 3. تشغيل الـ Backend

```bash
python run.py
```

يشغّل:
- **Alexa API** على المنفذ 5002
- **Web API** على المنفذ 5004

---

### 4. تشغيل ngrok (لوصول Alexa للـ backend)

Alexa تحتاج عنواناً عاماً على الإنترنت. ngrok يفتح نفقاً من الإنترنت إلى المنفذ 5002:

```bash
# أضف NGROK_AUTH_TOKEN في .env
python -m backend.scripts.run_ngrok
```

يظهر لك عنوان مثل: `https://xxxx.ngrok.io/alexa_quiz`

---

### 5. إنشاء مهارة Alexa في Amazon Developer Console

1. ادخل إلى [Alexa Developer Console](https://developer.amazon.com/alexa/console/ask)
2. أنشئ مهارة جديدة (Custom)
3. **Endpoint:** اختر HTTPS وأدخل: `https://xxxx.ngrok.io/alexa_quiz`
4. **Locale:** أضف **Arabic (SA)** أو **Arabic (EG)** واجعله الأساسي للمهارة.
5. **Intents** — أضف هذه الأهداف (عربي):

| Intent             | Utterances (أمثلة)                                                                 | Slot  |
|--------------------|-------------------------------------------------------------------------------------|-------|
| LinkPatientIntent  | `اربط {code}`, `اربط الرمز {code}`, `الرمز هو {code}`, `كودي {code}`               | code  |
| StartQuizIntent    | `ابدأ الاختبار`, `ابدأ اختبار`, `اختبار`                                          | -     |
| AnswerIntent       | `{answer}`, `الجواب {answer}`, `إجابتي {answer}`                                    | answer|
| EndQuizIntent      | `انهِ الاختبار`, `أنهِ الاختبار`, `انهاء الاختبار`                                  | -     |

- Slot **code**: نوع `AMAZON.SearchQuery` (للقبض على رموز مثل 8B6A671B حرفاً بحرف)
- Slot **answer**: نوع يقبل **أ** أو **ب** أو **ج** (ويمكن أيضاً A أو B أو C)

6. Build the skill

---

### 6. سير التجربة كطفل

1. افتح المهارة على Echo أو في [Alexa Simulator](https://developer.amazon.com/alexa/console/ask/test)
2. ستطلب منك Alexa **الكود أولاً**. قل مثلاً: **"اربط 8 B 6 A 6 7 1 B"** (استبدل بكود المريض)
3. بعد الربط، قل: **"ابدأ الاختبار"**
4. أجب **أ** أو **ب** أو **ج** على كل سؤال
5. قل: **"انهِ الاختبار"** لإنهاء ورؤية النتيجة — ثم اذهب إلى الموقع لرؤية النتائج

---

### 7. رؤية النتائج

- **لوحة الطبيب** (`/orthophoniste`): الجدول يجلب المرضى والإحصائيات من API
- **صفحة المريض** (عند إنشائها): يمكن عرض الجلسات via `GET /api/specialists/patients/:id/sessions`
- **لوحة ولي الأمر** (قيد البناء): `GET /api/parents/children` و `GET /api/parents/children/:id/sessions`

---

## مشكلة: "I didn't understand" عند قول "Link is 8B6A671B"

إذا قلت "Link is 8B6A671B" ولم تفهم Alexa:
1. ادخل إلى Alexa Developer Console → مهارتك → Build → Intents
2. عدّل **LinkPatientIntent** وأضف الـ utterance: `link is {code}`
3. Slot `code` يجب أن يكون نوعه `AMAZON.SearchQuery`
4. انقر **Save** ثم **Build Model**
5. جرّب مرة أخرى

---

## ما يمكن تحسينه الآن

1. **عرض alexa_code** في جدول المرضى أو في صفحة المريض حتى يسهل على الطبيب/ولي الأمر إيصاله للطفل
2. **لوحة ولي الأمر** كاملة لعرض أطفاله ونتائجهم
3. **صفحة تفاصيل المريض** للطبيب: معلومات المريض، الـ alexa_code، آخر الجلسات، إحصائيات
