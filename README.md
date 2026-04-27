# IELTS App Backend - Game Mechanics (Word Duel)

Tính năng **"Đại chiến Từ vựng" (Word Duel)** là một hệ thống PvP (Player vs Player) thời gian thực được xây dựng trên nền tảng Socket.io.

## 1. Cơ chế Phòng (Room Management)
- **Khởi tạo**: Người dùng tạo phòng với một tên định danh.
- **Tham gia**: Tối đa 2 người chơi mỗi phòng. Trận đấu tự động bắt đầu ngay khi người thứ 2 tham gia.
- **Trạng thái**: `waiting` (chờ người), `playing` (đang thi đấu), `finished` (kết thúc).

## 2. Quy trình Trận đấu (Match Flow)
Mỗi trận đấu gồm 10 từ vựng được bốc ngẫu nhiên từ Database. Mỗi người chơi nhận 5 lá bài (5 từ).

### Giai đoạn thách đấu (Turn-based)
Trận đấu diễn ra theo lượt, mỗi lượt gồm 2 phase:

1.  **Phase 1: Thách đấu (Picking)**
    - Người đến lượt (Challenger) chọn 1 lá bài từ tay mình.
    - Lá bài được công khai ở giữa màn hình cho cả hai người thấy.
    
2.  **Phase 2: Đáp trả (Answering)**
    - Đối phương (Defender) phải nhập nghĩa tiếng Việt của từ đó.
    - Hệ thống kiểm tra tính chính xác (không phân biệt hoa thường, cắt khoảng trắng thừa).

### Tính điểm (Scoring)
- Trả lời **Đúng**: Người trả lời được **+1 điểm**.
- Trả lời **Sai**: Người trả lời bị **-1 điểm**.
- Sau mỗi lượt trả lời, vai trò Challenger và Defender sẽ hoán đổi cho nhau.

## 3. Kết thúc Trận đấu
- Trận đấu kết thúc khi cả 10 lá bài đã được đánh hết.
- Hệ thống thông báo kết quả thắng/thua dựa trên tổng điểm cuối cùng.
- Phòng sẽ tự động được giải phóng khỏi bộ nhớ sau 5 giây.

## 4. Các sự kiện Socket chính (Socket Events)
| Sự kiện | Hướng | Mô tả |
| :--- | :--- | :--- |
| `game_create_room` | Client -> Server | Tạo phòng mới |
| `game_join_room` | Client -> Server | Tham gia phòng hiện có |
| `game_pick_card` | Client -> Server | Challenger chọn bài thách đấu |
| `game_submit_answer`| Client -> Server | Defender gửi câu trả lời |
| `game_started` | Server -> Client | Thông báo trận đấu bắt đầu + chia bài |
| `game_card_picked` | Server -> Client | Đồng bộ lá bài đang thách đấu |
| `game_turn_update` | Server -> Client | Cập nhật điểm và chuyển lượt |
| `game_finished` | Server -> Client | Kết thúc trận đấu và báo kết quả |

---
*Lưu ý: Logic Game được xử lý tập trung tại `src/services/socket.service.js` để đảm bảo tính đồng bộ và bảo mật.*
