# Atheeria — English Alexa Skill Setup

Create a **second skill** in Amazon Developer Console (English only). Both skills use the **same backend**:

```text
https://YOUR-ALEXA-SERVICE.onrender.com/alexa_quiz
```

The server picks **Arabic or English** from the request locale (`en-US`, `en-GB` → English; `ar-SA` → Arabic).

---

## 1. Create the skill in Amazon

1. [Alexa Developer Console](https://developer.amazon.com/alexa/console/ask) → **Create Skill**
2. Name example: **Atheeria English**
3. Primary locale: **English (US)** or **English (UK)**
4. Model: **Custom**
5. Hosting: your AWS / default (endpoint is on Render, not Lambda)

---

## 2. Interaction model (English)

| Intent | Sample utterances | Slot |
|--------|-------------------|------|
| `LinkPatientIntent` | `link {code}`, `link my code {code}`, `{code}` | code |
| `StartQuizIntent` | `start the quiz`, `start quiz`, `begin training`, `open training program`, `training program` | — |
| `AnswerIntent` | `{answer}`, `answer {answer}`, `my answer is {answer}` | answer |
| `EndQuizIntent` | `end quiz`, `finish quiz`, `stop quiz` | — |

- Slot **code**: `AMAZON.SearchQuery` (six digits, e.g. `469573`)
- Slot **answer**: accepts **A**, **B**, **C**

**Build Model** after saving.

---

## 3. Endpoint

- **HTTPS** → `https://eduvox-alexa.onrender.com/alexa_quiz` (your Render URL)
- Same URL as the Arabic skill
- SSL: My development endpoint is a sub-domain… (typical for Render)

---

## 4. English training program (dashboard)

For the **English skill**, assign an **English** ready program:

1. Library → **Add English ready program** (API: `POST /api/specialists/library/demo-adhd-en`)
2. Assign it to the child
3. Use the same **6-digit link code** on Alexa

Program name in library: `Ready ADHD program for kids (English)`.

---

## 5. Test flow (simulator — English US)

```
open atheeria english
link 469573
start the quiz
A
B
C
end quiz
```

Expected speech (English):

- Welcome → link code prompt  
- After link → *Linked successfully… Say: start the quiz*  
- Quiz → questions with **A / B / C** options  

---

## 6. Arabic vs English skills

| | Arabic skill | English skill |
|---|-------------|---------------|
| Amazon locales | ar-SA / ar-EG | en-US / en-GB |
| Invocation | (your Arabic name) | e.g. *atheeria english* |
| Backend | Same `/alexa_quiz` | Same |
| Child code | Same 6 digits | Same |
| Program | Arabic ready program | English ready program |

---

## 7. Troubleshooting

| Issue | Fix |
|-------|-----|
| Arabic speech on English skill | Check skill locale is **en-US**; redeploy Render after backend update |
| Code not found | Same `DATABASE_URL` on web-api and alexa services |
| No questions | Assign **English** program, not Arabic |
| *Which device?* | Add more `StartQuizIntent` utterances; Build Model |
