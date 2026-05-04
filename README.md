# IELTS Prep App - Backend
Backend API cho ứng dụng học tiếng Anh, cung cấp các tính năng: Flashcard SRS, Nghe chép chính tả, và Đại chiến Từ vựng (PvP).

## Cấu trúc thư mục
```
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

## Business Logic

### 1. Thuật toán SRS 5 Cấp độ (`utils/srs.js`)
Mỗi thẻ từ vựng (`UserCard`) có trạng thái SRS riêng. Khi người dùng đánh giá, hàm `calculateSRS(card, quality)` tính lịch ôn tiếp theo.

Bảng interval theo level:

| Level | Interval | Ý nghĩa |
| :--- | :--- | :--- |
| 0 | 10 phút | Đang học (learning phase) |
| 1 | 1 ngày | Vừa tốt nghiệp |
| 2 | 3 ngày | |
| 3 | 7 ngày | |
| 4 | 14 ngày | |
| 5 | 30 ngày | Thành thạo (mastered) |

Quy tắc chuyển level theo đánh giá:

| Quality | Level 0 (Learning) | Level ≥ 1 (Review) |
| :--- | :--- | :--- |
| AGAIN | Level 0, +10 phút | Level 0, +10 phút (reset về học lại) |
| HARD | Level 0, +10 phút | Giữ nguyên level, repeat interval |
| GOOD | Level +1 (tốt nghiệp) | Level +1 (tối đa 5) |
| EASY | Level +2 (skip) | Level +2 (tối đa 5) |

Mapping theo chế độ học (Study Modes):
- **Flashcard**: Người dùng tự chọn 1 trong 4 mức (`AGAIN`, `HARD`, `GOOD`, `EASY`).
- **Fill-in / Nghe gõ / Đọc gõ**: Hệ thống tự động đánh giá dựa trên **tính đúng/sai** và **thời gian phản hồi** (tính từ lúc từ xuất hiện đến khi nhấn Kiểm tra):

| Điều kiện | Quality |
| :--- | :--- |
| Gõ **sai** | `AGAIN` — Reset về Level 0 |
| Đúng, ≤ **4 giây** | `EASY` — Tăng 2 Level |
| Đúng, **4–8 giây** | `GOOD` — Tăng 1 Level |
| Đúng, **8–12 giây** | `HARD` — Giữ nguyên Level |
| Đúng, > **12 giây** | `AGAIN` — Nhớ quá lâu, tương đương không nhớ |

*Lưu ý*: Nếu người dùng sử dụng Gợi ý (Ctrl+Space), điểm tối đa chỉ là `GOOD` (không thể đạt `EASY`).
Logic này được cài đặt tại `src/shared/utils/calcQualityByTime.js` và dùng chung cho cả 3 chế độ gõ.

**Ease Factor**: Mỗi thẻ có easeFactor từ 1.3–3.0. Công thức điều chỉnh:
```
newEF = clamp(1.3, 3.0, EF + 0.1 - (5 - qualityScore) * (0.08 + (5 - qualityScore) * 0.02))
```
*Trong đó qualityScore*: `AGAIN=0`, `HARD=1`, `GOOD=3`, `EASY=5`

**Status machine**:
- `NEW` → `LEARNING` (khi trả lời lần đầu và level = 0)
- `NEW` / `LEARNING` → `REVIEW` (khi level ≥ 1)
- `REVIEW` → `LEARNING` (khi AGAIN, bị giáng xuống level 0)

---

### 2. Phiên học (Session) — `study.controller.js`
`GET /study/:setId/session` — trả về tối đa 20 thẻ theo thứ tự ưu tiên:
- Due cards — thẻ có `nextReview ≤ now` (status `LEARNING` hoặc `REVIEW`), sort theo `nextReview ASC`.
- New cards — bù vào chỗ còn trống, sort theo `createdAt ASC` (học theo thứ tự thêm vào).

`POST /study/batch-submit` — nhận `[{ cardId, quality }]`, tính SRS và cập nhật DB một lần (bulkWrite), upsert `StudyLog` cho ngày hôm nay.

---

### 3. Dictation — Text Mode
`POST /dictation/prepare-text`:
- **Tách câu** — split theo dấu câu `.!?`, lọc câu ≥ 6 từ.
- **Tìm cụm từ để đục lỗ** — ưu tiên cấu trúc IELTS (regex 5 pattern).
- **Fallback** — nếu không đủ blanks, đục ngẫu nhiên cụm 2-3 từ (bỏ stop-words).
- **Số lỗ trống** — 1 blank nếu câu ≤ 8 từ, 2 nếu ≤ 14, tối đa 3.
- `cleanOriginal()` — strip `"`, `'`, `\`, normalize spaces.

---

### 4. Dictation — YouTube Mode
`POST /dictation/prepare-youtube`:

Luồng xử lý:
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
**Model YoutubeCache**: lưu videoId (unique), url, title, exercises[], total, createdAt.

`GET /dictation/shared-library` — trả về 20 video cache mới nhất (videoId, title, total, url), dùng để hiển thị thư viện chung cho người dùng chọn nhanh.

---

### 5. Các chỉ số học tập (Stats & Heatmap)
Hệ thống phân tách rõ ràng giữa "lượng kiến thức" và "cường độ lao động" thông qua hai chỉ số:

- **Từ vựng đã học (Unique Words)** — Hiển thị trên thẻ Dashboard:
  - **Định nghĩa**: Tổng số lượng từ vựng duy nhất (`UserCards`) mà người dùng đã thực hiện ôn tập hoặc học mới trong ngày.
  - **Cách tính**: Đếm số bản ghi trong collection `UserCard` có trường `lastReviewed` thuộc ngày hiện tại.
  - **Ý nghĩa**: Cho biết hôm nay bạn đã củng cố được bao nhiêu "mục" từ vựng. Dù bạn học một từ 10 lần trong ngày, con số này vẫn chỉ tăng 1.

- **Lượt ôn tập (Total Reviews)** — Hiển thị trong tooltip của Heatmap (Lịch sử học tập):
  - **Định nghĩa**: Tổng số lượt thao tác (số lần nhấn nút Again/Good...) mà người dùng đã thực hiện.
  - **Cách tính**: Dữ liệu được lưu trong collection `StudyLog`. Mỗi khi hoàn thành một lượt học và submit, hệ thống sẽ cộng dồn số lượng card đã trả lời vào trường `count` của ngày hôm đó.
  - **Ý nghĩa**: Phản ánh cường độ làm việc thực tế. Nếu bạn gặp từ khó và phải nhấn "Again" nhiều lần, con số này sẽ cao hơn nhiều so với số lượng từ vựng duy nhất, thể hiện sự nỗ lực vượt khó của người học.

---

## Game Mechanics (Word Duel)

Tính năng **"Đại chiến Từ vựng" (Word Duel)** là một hệ thống PvP (Player vs Player) thời gian thực được xây dựng trên nền tảng Socket.io.

### 1. Cơ chế Phòng (Room Management)
- **Khởi tạo**: Người dùng tạo phòng với một tên định danh.
- **Tham gia**: Tối đa 2 người chơi mỗi phòng. Trận đấu tự động bắt đầu ngay khi người thứ 2 tham gia.
- **Trạng thái**: `waiting` (chờ người), `playing` (đang thi đấu), `finished` (kết thúc).

### 2. Quy trình Trận đấu (Match Flow)
Mỗi trận đấu gồm 10 từ vựng được bốc ngẫu nhiên từ Database. Mỗi người chơi nhận 5 lá bài (5 từ).

#### Giai đoạn thách đấu (Turn-based)
Trận đấu diễn ra theo lượt, mỗi lượt gồm 2 phase:
1. **Phase 1: Thách đấu (Picking)**
   - Người đến lượt (Challenger) chọn 1 lá bài từ tay mình.
   - Lá bài được công khai ở giữa màn hình cho cả hai người thấy.
2. **Phase 2: Đáp trả (Answering)**
   - Đối phương (Defender) phải nhập nghĩa tiếng Việt của từ đó.
   - Hệ thống kiểm tra tính chính xác (không phân biệt hoa thường, cắt khoảng trắng thừa).

#### Tính điểm (Scoring)
- Trả lời **Đúng**: Người trả lời được **+1 điểm**.
- Trả lời **Sai**: Người trả lời bị **-1 điểm**.
- Sau mỗi lượt trả lời, vai trò Challenger và Defender sẽ hoán đổi cho nhau.

### 3. Kết thúc Trận đấu
- Trận đấu kết thúc khi cả 10 lá bài đã được đánh hết.
- Hệ thống thông báo kết quả thắng/thua dựa trên tổng điểm cuối cùng.
- Phòng sẽ tự động được giải phóng khỏi bộ nhớ sau 5 giây.

### 4. Các sự kiện Socket chính (Socket Events)
| Sự kiện | Hướng | Mô tả |
| :--- | :--- | :--- |
| `game_create_room` | Client -> Server | Tạo phòng mới |
| `game_join_room` | Client -> Server | Tham gia phòng hiện có |
| `game_pick_card` | Client -> Server | Challenger chọn bài thách đấu |
| `game_submit_answer` | Client -> Server | Defender gửi câu trả lời |
| `game_started` | Server -> Client | Thông báo trận đấu bắt đầu + chia bài |
| `game_card_picked` | Server -> Client | Đồng bộ lá bài đang thách đấu |
| `game_turn_update` | Server -> Client | Cập nhật điểm và chuyển lượt |
| `game_finished` | Server -> Client | Kết thúc trận đấu và báo kết quả |

---
*Lưu ý: Logic Game được xử lý tập trung tại `src/services/socket.service.js` để đảm bảo tính đồng bộ và bảo mật.*
