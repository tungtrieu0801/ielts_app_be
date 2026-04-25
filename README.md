# IELTS Prep App - Backend

Backend API cho ứng dụng học tiếng Anh, cung cấp hai tính năng: **Flashcard SRS** và **Nghe chép chính tả**.

## Cấu trúc thư mục

```text
ielts_app_be/
├── src/
│   ├── config/           # Kết nối MongoDB, biến môi trường
│   ├── controllers/
│   │   ├── auth.controller.js
│   │   ├── dictation.controller.js   # Logic dictation + YouTube cache
│   │   ├── study.controller.js       # SRS session, stats, streak, schedule
│   │   ├── word.controller.js
│   │   └── wordset.controller.js
│   ├── middleware/        # verifyToken (JWT), passport OAuth
│   ├── models/
│   │   ├── StudyLog.js    # Lịch sử học theo ngày (streak, heatmap)
│   │   ├── User.js        # Tài khoản Google OAuth
│   │   ├── UserCard.js    # Trạng thái SRS từng thẻ của từng user
│   │   ├── Word.js        # Từ vựng
│   │   ├── WordSet.js     # Bộ từ vựng
│   │   └── YoutubeCache.js # Cache phụ đề YouTube đã xử lý
│   ├── routes/
│   │   ├── auth.routes.js
│   │   ├── dictation.routes.js  # /prepare-text, /prepare-youtube, /shared-library
│   │   ├── study.routes.js
│   │   ├── word.routes.js
│   │   └── wordset.routes.js
│   ├── utils/
│   │   └── srs.js         # Hàm calculateSRS() — thuật toán cốt lõi
│   └── server.js
```

---

## Business Logic

### 1. Thuật toán SRS 5 Cấp độ (`utils/srs.js`)

Mỗi thẻ từ vựng (UserCard) có trạng thái SRS riêng. Khi người dùng đánh giá, hàm `calculateSRS(card, quality)` tính lịch ôn tiếp theo.

**Bảng interval theo level:**

| Level | Interval | Ý nghĩa |
|-------|----------|---------|
| 0 | 10 phút | Đang học (learning phase) |
| 1 | 1 ngày | Vừa tốt nghiệp |
| 2 | 3 ngày | |
| 3 | 7 ngày | |
| 4 | 14 ngày | |
| 5 | 30 ngày | Thành thạo (mastered) |

**Quy tắc chuyển level theo đánh giá:**

| Quality | Level 0 (Learning) | Level ≥ 1 (Review) |
|---------|-------------------|-------------------|
| **AGAIN** | Level 0, +10 phút | Level 0, +10 phút (reset về học lại) |
| **HARD** | Level 0, +10 phút | Giữ nguyên level, repeat interval |
| **GOOD** | Level +1 (tốt nghiệp) | Level +1 (tối đa 5) |
| **EASY** | Level +2 (skip) | Level +2 (tối đa 5) |

**Ease Factor:** Mỗi thẻ có `easeFactor` từ 1.3–3.0. Công thức điều chỉnh:
```
newEF = clamp(1.3, 3.0, EF + 0.1 - (5 - qualityScore) * (0.08 + (5 - qualityScore) * 0.02))
qualityScore: AGAIN=0, HARD=1, GOOD=3, EASY=5
```

**Status machine:**
- `NEW` → `LEARNING` (khi trả lời lần đầu và level = 0)
- `NEW` / `LEARNING` → `REVIEW` (khi level ≥ 1)
- `REVIEW` → `LEARNING` (khi AGAIN, bị giáng xuống level 0)

---

### 2. Phiên học (Session) — `study.controller.js`

`GET /study/:setId/session` — trả về tối đa 20 thẻ theo thứ tự ưu tiên:
1. **Due cards** — thẻ có `nextReview ≤ now` (status LEARNING hoặc REVIEW), sort theo `nextReview ASC`.
2. **New cards** — bù vào chỗ còn trống, sort theo `createdAt ASC` (học theo thứ tự thêm vào).

`POST /study/batch-submit` — nhận `[{ cardId, quality }]`, tính SRS và cập nhật DB một lần (bulkWrite), upsert `StudyLog` cho ngày hôm nay.

---

### 3. Dictation — Text Mode

`POST /dictation/prepare-text`:
1. **Tách câu** — split theo dấu câu `.!?`, lọc câu ≥ 6 từ.
2. **Tìm cụm từ để đục lỗ** — ưu tiên cấu trúc IELTS (regex 5 pattern).
3. **Fallback** — nếu không đủ blanks, đục ngẫu nhiên cụm 2-3 từ (bỏ stop-words).
4. **Số lỗ trống** — 1 blank nếu câu ≤ 8 từ, 2 nếu ≤ 14, tối đa 3.
5. **`cleanOriginal()`** — strip `\"`, `\'`, `\\`, normalize spaces.

---

### 4. Dictation — YouTube Mode

`POST /dictation/prepare-youtube`:

**Luồng xử lý:**
```
URL → extractVideoId
     ↓
YoutubeCache.findOne(videoId)  ← Cache HIT → trả về ngay (<50ms)
     ↓ Cache MISS
InnerTube API (POST, ANDROID client) → captionTracks XML
     ↓ nếu lỗi
Page Scrape fallback (HTML bracket-matching)
     ↓
parseCaptionXml() — parse <p> + <s> tags, tính dur word-level
     ↓
mergeIntoSentences() — gộp theo dấu câu / speaker change / pause >1.5s
     ↓
cleanOriginal() — xóa dấu nháy thừa
     ↓
fetchVideoTitle() — oEmbed API (lấy title không cần API key)
     ↓
YoutubeCache.upsert() — lưu DB (async, không block response)
     ↓
Response: { exercises, videoId, title, total }
```

**Model `YoutubeCache`:** lưu `videoId (unique)`, `url`, `title`, `exercises[]`, `total`, `createdAt`.

`GET /dictation/shared-library` — trả về 20 video cache mới nhất (videoId, title, total, url), dùng để hiển thị thư viện chung cho người dùng chọn nhanh.

