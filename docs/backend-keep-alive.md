# Giữ backend Render hoạt động

Backend trả `204 No Content` ở `GET /api/health`. Endpoint không truy vấn database và trả `Cache-Control: no-store`.

## Lịch chính: Supabase Cron

Job `swipe-nest-backend-keep-alive` gọi endpoint mỗi **5 phút** từ database Supabase đang chạy độc lập với Render. Khoảng cách này có dư địa trước ngưỡng idle 15 phút. Không dùng timer bên trong backend vì timer sẽ dừng khi backend sleep.

File [cấu hình production](../server/db-migration/ops/backend-keep-alive.sql) chạy bằng tài khoản quản trị trong Supabase SQL Editor. Chạy lại sẽ cập nhật cùng job, không tạo thêm job. File nằm ngoài chuỗi migration ứng dụng để database dev không tự tạo lịch ping production. Job không cần API key hay dữ liệu người dùng.

Kiểm tra cấu hình và lượt chạy tự động:

```sql
SELECT jobid, jobname, schedule, active
FROM cron.job
WHERE jobname = 'swipe-nest-backend-keep-alive';

SELECT runs.start_time, runs.end_time, runs.status, runs.return_message
FROM cron.job_run_details AS runs
JOIN cron.job AS jobs ON jobs.jobid = runs.jobid
WHERE jobs.jobname = 'swipe-nest-backend-keep-alive'
ORDER BY runs.start_time DESC
LIMIT 10;

SELECT id, status_code, timed_out, error_msg, created
FROM net._http_response
ORDER BY created DESC
LIMIT 10;
```

`cron.job_run_details.status = 'succeeded'` xác nhận SQL đã xếp request vào hàng đợi; cần kiểm tra thêm `net._http_response.status_code = 204` và `timed_out = false` để xác nhận HTTP thành công. Bảng phản hồi cũng có thể chứa request từ job `pg_net` khác và chỉ giữ lịch sử ngắn hạn.

Nếu cần tạm dừng riêng job này:

```sql
SELECT cron.alter_job(jobid, active := false)
FROM cron.job
WHERE jobname = 'swipe-nest-backend-keep-alive';
```

Chạy lại file cấu hình để bật lại. Cần cập nhật URL trong file và job nếu chuyển backend sang dịch vụ khác. Supabase phải tiếp tục hoạt động để cron chạy.

## Lịch dự phòng: GitHub Actions

Workflow [backend-keep-alive.yml](../.github/workflows/backend-keep-alive.yml) vẫn được giữ làm dự phòng và hỗ trợ chạy thủ công. GitHub có thể trì hoãn hoặc bỏ lượt cron; không dùng workflow này làm nguồn ping duy nhất.

Ngày 19/11/2026 (giờ Việt Nam), kiểm tra phát hiện workflow active nhưng chưa có lượt `schedule`; các lượt `workflow_dispatch` vẫn trả HTTP 204. Vì vậy, chạy thủ công thành công không chứng minh lịch tự động hoạt động. Cấu hình Supabase Cron giải quyết sự phụ thuộc này.

Tài liệu: [Supabase Cron](https://supabase.com/docs/guides/cron), [pg_net](https://supabase.com/docs/guides/database/extensions/pg_net), [giới hạn lịch GitHub Actions](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule).
