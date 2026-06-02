# إعداد Amazon لـ «مغامرة النجوم» — إجابات صوتية (كلب، موزة…)

## تشخيص JSON الذي أرسلته

عند قول **«كلب»** وصل الطلب هكذا:

```json
"intent": {
  "name": "AMAZON.FallbackIntent",
  "confirmationStatus": "NONE"
}
```

- **لا يوجد** `AnswerIntent`
- **لا يوجد** slot `answer`
- **لا يوجد** `request.input` ولا نص «كلب»

→ **Amazon لم يمرّر كلمتك للخادم.** المحاكي يعرض «كلب» في الواجهة، لكن الـ JSON فارغ.  
الخادم لا يستطيع التخمين → «لم أفهم إجابتك».

**الحل الأساسي: Interaction Model في Developer Console** (ليس قائمة لا نهائية في slot).

---

## 1. Endpoint

```
https://eduvox-alexa.onrender.com/alexa_quiz
```

Locale: **Arabic (SA)** أو **Arabic (EG)**.

---

## 2. Built-in intents (فعّلها)

| Intent |
|--------|
| `AMAZON.YesIntent` |
| `AMAZON.ConfirmIntent` (اختياري) |

---

## 3. AnswerIntent — **الأهم**

### Slot `answer`

| الاسم | النوع |
|-------|--------|
| `answer` | **`AMAZON.SearchQuery`** |

**ليس** Custom Entity بأ / ب / ج فقط.

### Sample utterances (أضفها كلها)

```
{answer}
الجواب {answer}
إجابتي {answer}
اجابة {answer}
نعم
جاهز
مستعد
كلب
قطة
موزة
أحمر
اثنان
2
```

> `{answer}` يقبل أي كلمة.  
> الكلمات الصريحة (كلب، موزة…) تمنع `FallbackIntent` لهذه الكلمات.

---

## 4. JSON Editor (نسخ سريع)

Build → **JSON Editor** → أضف/عدّل `AnswerIntent` (مع بقية intents لديك):

```json
{
  "name": "AnswerIntent",
  "slots": [
    {
      "name": "answer",
      "type": "AMAZON.SearchQuery",
      "samples": []
    }
  ],
  "samples": [
    "{answer}",
    "الجواب {answer}",
    "إجابتي {answer}",
    "نعم",
    "جاهز",
    "كلب",
    "موزة",
    "أحمر",
    "اثنان",
    "2"
  ]
}
```

ثم **Save Model** → **Build Model** → انتظر دقيقة.

---

## 5. Dialog (اختياري — يُفضَّل)

في JSON Editor، تحت `AnswerIntent`:

```json
"dialog": {
  "intents": [
    {
      "name": "AnswerIntent",
      "delegationStrategy": "ALWAYS",
      "slots": [
        {
          "name": "answer",
          "type": "AMAZON.SearchQuery",
          "elicitationRequired": false,
          "confirmationRequired": false,
          "prompts": {}
        }
      ]
    }
  ]
}
```

الخادم يرسل `Dialog.ElicitSlot` عند `FallbackIntent` بدون نص.

---

## 6. التحقق بعد Build

في **Test** (ar-SA)، قل **كلب** وافتح **JSON Input**:

**يجب** أن ترى:

```json
"intent": {
  "name": "AnswerIntent",
  "slots": {
    "answer": {
      "name": "answer",
      "value": "كلب"
    }
  }
}
```

إن بقي `AMAZON.FallbackIntent` بدون slots → Interaction Model غير صحيح أو لم يُعمل Build.

---

## 7. بقية النوايا (تذكير)

| Intent | Utterances |
|--------|------------|
| LinkPatientIntent | `اربط {code}` — slot `code` = SearchQuery |
| StartQuizIntent | `ابدأ الاختبار`, `ابدا الاختبار` |
| EndQuizIntent | `انهِ الاختبار` (بدون «ابدأ») |

---

## 8. على الموقع

- مكتبة → **مغامرة النجوم** → عيّن للطفل.
- Render → **eduvox-alexa** منشور بآخر commit.
