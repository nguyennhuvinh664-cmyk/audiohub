# AudioHub Test Checklist

## Pre-test Setup
- [ ] Truy cập trang chủ - kiểm tra loading
- [ ] Đăng nhập tài khoản (Google/Facebook)
- [ ] Mở Developer Console (F12) - kiểm tra không có lỗi đỏ

---

## 1. Trang chủ (Home Page)
- [ ] Hiển thị stories mới nhất
- [ ] Hiển thị carousel/featured stories
- [ ] Click vào story → chuyển sang trang chi tiết
- [ ] Search function hoạt động
- [ ] Filter theo category hoạt động
- [ ] Phân trang hoạt động

---

## 2. Trang Chi Tiết Story (Story Detail)
- [ ] Hiển thị thông tin story (title, author, views, likes)
- [ ] Hiển thị danh sách chapters
- [ ] Click play → audio phát được
- [ ] Click chapter khác → chuyển chapter
- [ ] Progress bar di chuyển
- [ ] nút Like hoạt động
- [ ] nút Bookmark hoạt động
- [ ] Link "Xem kênh" dẫn đúng trang channel

---

## 3. Trang Kênh (Channel Page)
- [ ] Hiển thị thông tin author
- [ ] Hiển thị danh sách stories của author
- [ ] Hiển thị thống kê (followers, stories)
- [ ] Click theo dõi (Follow) hoạt động
- [ ] Nút "Kênh của tôi" hiển thị đúng (chỉ khi login)

---

## 4. Upload Story (Author)
- [ ] Truy cập trang upload (qua menu)
- [ ] Điền đầy đủ thông tin (title, category, description)
- [ ] Upload audio file thành công
- [ ] Upload ảnh bìa thành công
- [ ] Chọn chapter list đúng
- [ ] Submit → tạo story mới
- [ ] Story mới xuất hiện trên trang chủ

---

## 5. Chỉnh Sửa Story (Author)
- [ ] Vào trang chỉnh sửa story
- [ ] Thay đổi thông tin cơ bản
- [ ] Thêm/xóa chapter
- [ ] Upload audio mới cho chapter
- [ ] Lưu thay đổi
- [ ] Kiểm tra thay đổi hiển thị đúng

---

## 6. Quản Lý Chương (Chapter Management)
- [ ] Thêm chapter mới
- [ ] Xóa chapter
- [ ] Sắp xếp lại thứ tự chapter
- [ ] Đánh dấu chapter free/premium
- [ ] Lưu và kiểm tra lại

---

## 7. Trang Tài Khoản (Account Page)
- [ ] Hiển thị thông tin cá nhân
- [ ] Hiển thị lịch sử nghe
- [ ] Hiển thị stories đã bookmark
- [ ] Chỉnh sửa thông tin cá nhân
- [ ] Đăng xuất hoạt động

---

## 8. Navigation & UI
- [ ] Menu dropdown hoạt động
- [ ] "Kênh của tôi" link đúng URL
- [ ] Logo click về trang chủ
- [ ] Responsive trên mobile (nếu test)
- [ ] Dark mode / theme hiển thị đúng

---

## 9. Error Handling
- [ ] Test upload file quá lớn
- [ ] Test upload file sai định dạng
- [ ] Test không nhập đủ thông tin bắt buộc
- [ ] Kiểm tra thông báo lỗi rõ ràng

---

## 10. Audio Playback (Quan trọng!)
- [ ] Play/Pause hoạt động
- [ ] Next/Previous chapter
- [ ] Progress bar kéo được
- [ ] Volume control hoạt động
- [ ] Auto-play chapter tiếp theo
- [ ] Audio không bị lỗi/chậm

---

## Test Data Needed
1. **2-3 tài khoản** (1 author, 1-2 users)
2. **3-5 stories** với audio files
3. **5-10 chapters** mỗi story
4. **Ảnh bìa** cho mỗi story

## Duration
- **Quick test**: 30 phút (chỉ test chức năng chính)
- **Full test**: 1-2 tiếng (test tất cả + edge cases)

---

**Notes:**
- Kiểm tra Developer Console (F12) thường xuyên
- Ghi lại bất kỳ lỗi nào gặp phải
- Test trên cả desktop và mobile nếu có thể
