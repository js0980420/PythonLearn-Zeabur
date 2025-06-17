-- ================================================================
-- Zeabur MySQL 直接導入腳本 - 適用於 phpMyAdmin
-- 創建時間: 2025-06-17
-- 用途: 直接在 phpMyAdmin 中執行，恢復 PythonLearn 平台數據
-- ================================================================

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- 創建數據庫
CREATE DATABASE IF NOT EXISTS `pythonlearn` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE `pythonlearn`;

-- 創建用戶代碼保存表
DROP TABLE IF EXISTS `user_code_saves`;
CREATE TABLE `user_code_saves` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `user_name` varchar(100) NOT NULL,
  `room_name` varchar(100) NOT NULL,
  `code_content` longtext NOT NULL,
  `save_name` varchar(200) DEFAULT NULL,
  `version` int(11) DEFAULT 1,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_user_room` (`user_name`, `room_name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 創建房間表
DROP TABLE IF EXISTS `rooms`;
CREATE TABLE `rooms` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `room_name` varchar(100) NOT NULL UNIQUE,
  `current_code` longtext,
  `last_modified_by` varchar(100) DEFAULT NULL,
  `user_count` int(11) DEFAULT 0,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_room_name` (`room_name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 創建用戶表
DROP TABLE IF EXISTS `users`;
CREATE TABLE `users` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `user_id` varchar(100) NOT NULL UNIQUE,
  `user_name` varchar(100) NOT NULL,
  `room_name` varchar(100) DEFAULT NULL,
  `ip_address` varchar(45) DEFAULT NULL,
  `is_online` tinyint(1) DEFAULT 1,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_user_id` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 創建聊天消息表
DROP TABLE IF EXISTS `chat_messages`;
CREATE TABLE `chat_messages` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `room_name` varchar(100) NOT NULL,
  `user_name` varchar(100) NOT NULL,
  `message_content` text NOT NULL,
  `message_type` varchar(20) DEFAULT 'user',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_room_name` (`room_name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 插入學生630的保存記錄
INSERT INTO `user_code_saves` (`user_name`, `room_name`, `code_content`, `save_name`, `version`, `created_at`) VALUES
('學生630', 'test-room', 'print(\"Hello World\")\nprint(\"我是學生630\")', '學生630的第一次保存', 1, '2025-06-17 01:30:00'),
('學生630', 'test-room', 'print(\"Hello Python\")\nprint(\"我是學生630\")\nx = 10\nprint(x)', '學生630的第二次保存', 2, '2025-06-17 02:00:00'),
('學生630', 'test-room', 'print(\"Python 協作學習\")\nprint(\"學生630正在學習Python\")\n\na = 5\nb = 3\nresult = a + b\nprint(f\"計算結果: {result}\")', '學生630的第三次保存', 3, '2025-06-17 02:30:00'),
('學生630', 'test-room', 'print(\"歡迎來到Python學習平台\")\nprint(\"學生ID: 630\")\n\nfor i in range(5):\n    print(f\"第 {i+1} 次循環\")\n    \nnum = 8\nif num > 5:\n    print(\"數字大於5\")\nelse:\n    print(\"數字小於等於5\")', '學生630的最新保存', 4, '2025-06-17 03:00:00');

-- 插入房間記錄
INSERT INTO `rooms` (`room_name`, `current_code`, `last_modified_by`, `user_count`, `created_at`) VALUES
('test-room', 'print(\"Hello, Python Learning Platform!\")\nprint(\"歡迎使用 Python 協作學習平台\")\n\nx = 5 + 6\nprint(f\"計算結果: {x}\")', '學生630', 1, '2025-06-17 01:00:00');

-- 插入用戶記錄
INSERT INTO `users` (`user_id`, `user_name`, `room_name`, `ip_address`, `is_online`, `created_at`) VALUES
('user_630_test_2025', '學生630', 'test-room', '127.0.0.1', 1, '2025-06-17 01:00:00');

-- 插入聊天記錄
INSERT INTO `chat_messages` (`room_name`, `user_name`, `message_content`, `message_type`, `created_at`) VALUES
('test-room', '學生630', '大家好，我是學生630', 'user', '2025-06-17 01:15:00'),
('test-room', '學生630', '我正在學習Python編程', 'user', '2025-06-17 01:20:00'),
('test-room', '學生630', '有問題可以請教AI助教', 'user', '2025-06-17 02:10:00');

SET FOREIGN_KEY_CHECKS = 1;

-- 檢查導入結果
SELECT '數據導入完成' as status, COUNT(*) as save_count FROM user_code_saves WHERE user_name = '學生630'; 