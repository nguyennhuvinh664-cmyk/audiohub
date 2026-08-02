-- Import demo playlists to D1
INSERT OR REPLACE INTO playlists (id, name, state, created_by, created_at, updated_at, items) VALUES ('pl-thuy-hu', 'Thủy Hử', 'done', 'admin', '2026-07-15T00:00:00Z', '2026-07-31T00:00:00Z', '[{\"storyId\":\"s_thuy_hu\",\"title\":\"Thủy Hử\",\"author\":\"Admin\",\"genre\":\"Cổ Đại\",\"listenCount\":10,\"listenCount2d\":2}]');

INSERT OR REPLACE INTO playlists (id, name, state, created_by, created_at, updated_at, items) VALUES ('pl-tam-quoc', 'Tam Quốc', 'ongoing', 'admin', '2026-07-20T00:00:00Z', '2026-07-30T00:00:00Z', '[{\"storyId\":\"s_tam_quoc\",\"title\":\"Tam Quốc\",\"author\":\"Admin\",\"genre\":\"Cổ Đại\",\"listenCount\":5,\"listenCount2d\":1}]');
