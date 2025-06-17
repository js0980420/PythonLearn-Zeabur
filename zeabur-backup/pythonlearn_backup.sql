-- MariaDB dump 10.19  Distrib 10.4.32-MariaDB, for Win64 (AMD64)
--
-- Host: localhost    Database: pythonlearn
-- ------------------------------------------------------
-- Server version	10.4.32-MariaDB

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;

--
-- Table structure for table `chat_messages`
--

DROP TABLE IF EXISTS `chat_messages`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `chat_messages` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `room_id` varchar(100) NOT NULL,
  `user_name` varchar(100) NOT NULL,
  `chat_message` text NOT NULL,
  `message_type` enum('user','system','teacher') DEFAULT 'user',
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_room_id` (`room_id`),
  KEY `idx_created_at` (`created_at`),
  CONSTRAINT `chat_messages_ibfk_1` FOREIGN KEY (`room_id`) REFERENCES `rooms` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=23 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `chat_messages`
--

LOCK TABLES `chat_messages` WRITE;
/*!40000 ALTER TABLE `chat_messages` DISABLE KEYS */;
INSERT INTO `chat_messages` VALUES (1,'test-auto-1749631832246','系統','TestUser1 加入了房間','system','2025-06-11 08:50:42'),(2,'test-auto-1749631832246','系統','TestUser1 加入了房間','system','2025-06-11 08:50:42'),(3,'test-auto-1749631832246','系統','TestUser1 加入了房間','system','2025-06-11 08:50:42'),(4,'test-auto-1749631832246','系統','TestUser1 加入了房間','system','2025-06-11 08:50:42'),(5,'test-auto-1749631832246','系統','TestUser1 離開了房間','system','2025-06-11 08:50:42'),(6,'test-auto-1749631832246','系統','TestUser1 離開了房間','system','2025-06-11 08:50:42'),(7,'test-auto-1749631832246','系統','TestUser1 離開了房間','system','2025-06-11 08:50:42'),(8,'test-auto-1749631832246','系統','TestUser1 離開了房間','system','2025-06-11 08:50:42'),(9,'test-auto-1749631832246','系統','TestUser2 離開了房間','system','2025-06-11 08:50:42'),(10,'test-auto-1749631832246','系統','TestUser2 離開了房間','system','2025-06-11 08:50:42'),(11,'test-auto-1749631832246','系統','TestUser1 加入了房間','system','2025-06-11 08:50:42'),(12,'test-auto-1749631832246','系統','TestUser1 加入了房間','system','2025-06-11 08:50:42'),(13,'test-auto-1749631832246','系統','TestUser2 加入了房間','system','2025-06-11 08:50:42'),(14,'test-auto-1749631832246','系統','TestUser2 加入了房間','system','2025-06-11 08:50:42'),(15,'test-auto-1749631832246','系統','TestUser1 加入了房間','system','2025-06-11 08:50:42'),(16,'test-auto-1749631832246','系統','TestUser1 加入了房間','system','2025-06-11 08:50:42'),(17,'test-auto-1749631832246','系統','TestUser2 加入了房間','system','2025-06-11 08:50:42'),(18,'test-auto-1749631832246','系統','TestUser2 加入了房間','system','2025-06-11 08:50:42'),(19,'test-auto-1749631832246','系統','TestUser1 離開了房間','system','2025-06-11 08:50:52'),(20,'test-auto-1749631832246','系統','TestUser1 離開了房間','system','2025-06-11 08:50:52'),(21,'test-auto-1749631832246','系統','TestUser2 離開了房間','system','2025-06-11 08:50:52'),(22,'test-auto-1749631832246','系統','TestUser2 離開了房間','system','2025-06-11 08:50:52');
/*!40000 ALTER TABLE `chat_messages` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `room_usage_logs`
--

DROP TABLE IF EXISTS `room_usage_logs`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `room_usage_logs` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `room_id` varchar(100) NOT NULL COMMENT '房間ID',
  `user_name` varchar(100) NOT NULL COMMENT '用戶名稱',
  `action_type` enum('join','leave','code_edit','chat','save') DEFAULT 'join' COMMENT '動作類型',
  `action_details` text DEFAULT NULL COMMENT '動作詳情（JSON格式）',
  `created_at` timestamp NOT NULL DEFAULT current_timestamp() COMMENT '動作時間',
  PRIMARY KEY (`id`),
  KEY `idx_room_id` (`room_id`),
  KEY `idx_user_name` (`user_name`),
  KEY `idx_action_type` (`action_type`),
  KEY `idx_created_at` (`created_at`),
  KEY `idx_room_time` (`room_id`,`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='房間使用記錄表';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `room_usage_logs`
--

LOCK TABLES `room_usage_logs` WRITE;
/*!40000 ALTER TABLE `room_usage_logs` DISABLE KEYS */;
/*!40000 ALTER TABLE `room_usage_logs` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `rooms`
--

DROP TABLE IF EXISTS `rooms`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `rooms` (
  `id` varchar(100) NOT NULL,
  `name` varchar(100) NOT NULL,
  `code` text DEFAULT NULL,
  `version` int(11) DEFAULT 1,
  `last_edited_by` varchar(50) DEFAULT NULL,
  `last_activity` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_last_activity` (`last_activity`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `rooms`
--

LOCK TABLES `rooms` WRITE;
/*!40000 ALTER TABLE `rooms` DISABLE KEYS */;
INSERT INTO `rooms` VALUES ('general-room','general-room','# 🐍 Python協作教學平台\n# 歡迎使用多人協作編程環境！\n# 房間: general-room\n# 開始編寫您的Python程式碼...\n\n',1,NULL,'2025-06-11 08:51:49','2025-06-11 08:51:49'),('test-auto-1749631832246','test-auto-1749631832246','print(\"Hello from test!\")',2,'TestUser1','2025-06-11 08:50:42','2025-06-11 08:50:42');
/*!40000 ALTER TABLE `rooms` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `system_config`
--

DROP TABLE IF EXISTS `system_config`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `system_config` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `config_key` varchar(100) NOT NULL COMMENT '配置鍵',
  `config_value` text NOT NULL COMMENT '配置值',
  `config_type` enum('string','int','boolean','json') DEFAULT 'string' COMMENT '配置類型',
  `description` text DEFAULT NULL COMMENT '配置描述',
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `config_key` (`config_key`),
  KEY `idx_config_key` (`config_key`)
) ENGINE=InnoDB AUTO_INCREMENT=8 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='系統配置表';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `system_config`
--

LOCK TABLES `system_config` WRITE;
/*!40000 ALTER TABLE `system_config` DISABLE KEYS */;
INSERT INTO `system_config` VALUES (1,'platform_name','Python多人協作教學平台','string','平台名稱','2025-06-10 12:33:54','2025-06-10 12:33:54'),(2,'auto_save_interval','30','int','自動保存間隔（秒）','2025-06-10 12:33:54','2025-06-10 12:33:54'),(3,'max_code_history','100','int','最大代碼歷史記錄數','2025-06-10 12:33:54','2025-06-10 12:33:54'),(4,'chat_message_limit','1000','int','聊天訊息保留上限','2025-06-10 12:33:54','2025-06-10 12:33:54'),(5,'default_room','general-room','string','預設房間名稱','2025-06-10 12:33:54','2025-06-10 12:33:54'),(6,'enable_auto_load','true','boolean','是否啟用自動載入最新代碼','2025-06-10 12:33:54','2025-06-10 12:33:54'),(7,'max_recent_users','10','int','最近用戶名稱保留數量','2025-06-10 12:33:54','2025-06-10 12:33:54');
/*!40000 ALTER TABLE `system_config` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `user_activities`
--

DROP TABLE IF EXISTS `user_activities`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `user_activities` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `user_id` varchar(50) NOT NULL,
  `user_name` varchar(100) NOT NULL,
  `room_id` varchar(100) DEFAULT NULL,
  `action` varchar(50) NOT NULL,
  `details` text DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_user_id` (`user_id`),
  KEY `idx_room_id` (`room_id`),
  KEY `idx_created_at` (`created_at`),
  CONSTRAINT `user_activities_ibfk_1` FOREIGN KEY (`room_id`) REFERENCES `rooms` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=24 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `user_activities`
--

LOCK TABLES `user_activities` WRITE;
/*!40000 ALTER TABLE `user_activities` DISABLE KEYS */;
INSERT INTO `user_activities` VALUES (1,'user_1','TestUser1','test-auto-1749631832246','加入房間',NULL,'2025-06-11 08:50:42'),(2,'user_2','TestUser1','test-auto-1749631832246','加入房間',NULL,'2025-06-11 08:50:42'),(3,'user_1','TestUser1','test-auto-1749631832246','加入房間',NULL,'2025-06-11 08:50:42'),(4,'user_2','TestUser1','test-auto-1749631832246','加入房間',NULL,'2025-06-11 08:50:42'),(5,'user_1','TestUser1','test-auto-1749631832246','離開房間',NULL,'2025-06-11 08:50:42'),(6,'user_2','TestUser1','test-auto-1749631832246','離開房間',NULL,'2025-06-11 08:50:42'),(7,'user_3','TestUser1','test-auto-1749631832246','離開房間',NULL,'2025-06-11 08:50:42'),(8,'user_4','TestUser1','test-auto-1749631832246','離開房間',NULL,'2025-06-11 08:50:42'),(9,'user_5','TestUser2','test-auto-1749631832246','離開房間',NULL,'2025-06-11 08:50:42'),(10,'user_6','TestUser2','test-auto-1749631832246','離開房間',NULL,'2025-06-11 08:50:42'),(11,'user_3','TestUser1','test-auto-1749631832246','加入房間',NULL,'2025-06-11 08:50:42'),(12,'user_4','TestUser1','test-auto-1749631832246','加入房間',NULL,'2025-06-11 08:50:42'),(13,'user_3','TestUser1','test-auto-1749631832246','code_edit','Version 2','2025-06-11 08:50:42'),(14,'user_5','TestUser2','test-auto-1749631832246','加入房間',NULL,'2025-06-11 08:50:42'),(15,'user_6','TestUser2','test-auto-1749631832246','加入房間',NULL,'2025-06-11 08:50:42'),(16,'user_3','TestUser1','test-auto-1749631832246','加入房間',NULL,'2025-06-11 08:50:42'),(17,'user_4','TestUser1','test-auto-1749631832246','加入房間',NULL,'2025-06-11 08:50:42'),(18,'user_5','TestUser2','test-auto-1749631832246','加入房間',NULL,'2025-06-11 08:50:42'),(19,'user_6','TestUser2','test-auto-1749631832246','加入房間',NULL,'2025-06-11 08:50:42'),(20,'user_3','TestUser1','test-auto-1749631832246','離開房間',NULL,'2025-06-11 08:50:52'),(21,'user_4','TestUser1','test-auto-1749631832246','離開房間',NULL,'2025-06-11 08:50:52'),(22,'user_5','TestUser2','test-auto-1749631832246','離開房間',NULL,'2025-06-11 08:50:52'),(23,'user_6','TestUser2','test-auto-1749631832246','離開房間',NULL,'2025-06-11 08:50:52');
/*!40000 ALTER TABLE `user_activities` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `user_activity_log`
--

DROP TABLE IF EXISTS `user_activity_log`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `user_activity_log` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `user_name` varchar(255) NOT NULL,
  `action_type` varchar(50) NOT NULL,
  `slot_id` int(11) DEFAULT NULL,
  `slot_name` varchar(255) DEFAULT NULL,
  `code_length` int(11) DEFAULT 0,
  `room_id` varchar(255) DEFAULT 'general-room',
  `ip_address` varchar(45) DEFAULT NULL,
  `user_agent` text DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_user_activity` (`user_name`,`created_at`),
  KEY `idx_action_type` (`action_type`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `user_activity_log`
--

LOCK TABLES `user_activity_log` WRITE;
/*!40000 ALTER TABLE `user_activity_log` DISABLE KEYS */;
/*!40000 ALTER TABLE `user_activity_log` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `user_code_history`
--

DROP TABLE IF EXISTS `user_code_history`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `user_code_history` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `user_name` varchar(255) NOT NULL,
  `code_content` longtext NOT NULL,
  `code_hash` varchar(64) NOT NULL,
  `save_type` enum('auto','manual','latest') NOT NULL DEFAULT 'manual',
  `slot_id` int(11) DEFAULT NULL,
  `slot_name` varchar(255) DEFAULT NULL,
  `room_id` varchar(255) DEFAULT 'general-room',
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_user_history` (`user_name`,`created_at`),
  KEY `idx_code_hash` (`code_hash`),
  KEY `idx_save_type` (`save_type`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `user_code_history`
--

LOCK TABLES `user_code_history` WRITE;
/*!40000 ALTER TABLE `user_code_history` DISABLE KEYS */;
/*!40000 ALTER TABLE `user_code_history` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `user_code_saves`
--

DROP TABLE IF EXISTS `user_code_saves`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `user_code_saves` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `user_name` varchar(255) NOT NULL,
  `slot_id` int(11) NOT NULL DEFAULT 0,
  `slot_name` varchar(255) NOT NULL DEFAULT '未命名',
  `code_content` longtext NOT NULL,
  `is_latest` tinyint(1) NOT NULL DEFAULT 0,
  `is_auto_save` tinyint(1) NOT NULL DEFAULT 0,
  `room_id` varchar(255) DEFAULT 'general-room',
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `unique_user_slot` (`user_name`,`slot_id`),
  KEY `idx_user_name` (`user_name`),
  KEY `idx_latest` (`user_name`,`is_latest`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `user_code_saves`
--

LOCK TABLES `user_code_saves` WRITE;
/*!40000 ALTER TABLE `user_code_saves` DISABLE KEYS */;
/*!40000 ALTER TABLE `user_code_saves` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `user_login_history`
--

DROP TABLE IF EXISTS `user_login_history`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `user_login_history` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `user_name` varchar(255) NOT NULL,
  `login_time` timestamp NOT NULL DEFAULT current_timestamp(),
  `ip_address` varchar(45) DEFAULT NULL,
  `user_agent` text DEFAULT NULL,
  `room_id` varchar(255) DEFAULT 'general-room',
  `session_duration` int(11) DEFAULT NULL,
  `logout_time` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_user_login` (`user_name`,`login_time`),
  KEY `idx_login_time` (`login_time`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `user_login_history`
--

LOCK TABLES `user_login_history` WRITE;
/*!40000 ALTER TABLE `user_login_history` DISABLE KEYS */;
/*!40000 ALTER TABLE `user_login_history` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `user_login_logs`
--

DROP TABLE IF EXISTS `user_login_logs`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `user_login_logs` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `user_name` varchar(100) NOT NULL COMMENT '用戶名稱',
  `user_id` varchar(50) NOT NULL COMMENT '用戶ID',
  `room_id` varchar(100) NOT NULL COMMENT '房間ID',
  `is_teacher` tinyint(1) DEFAULT 0 COMMENT '是否為教師',
  `login_time` timestamp NOT NULL DEFAULT current_timestamp() COMMENT '登入時間',
  `ip_address` varchar(45) DEFAULT NULL COMMENT 'IP地址',
  `user_agent` text DEFAULT NULL COMMENT '瀏覽器資訊',
  `session_duration` int(11) DEFAULT 0 COMMENT '會話持續時間（秒）',
  `logout_time` timestamp NULL DEFAULT NULL COMMENT '登出時間',
  PRIMARY KEY (`id`),
  KEY `idx_user_name` (`user_name`),
  KEY `idx_room_id` (`room_id`),
  KEY `idx_login_time` (`login_time`),
  KEY `idx_is_teacher` (`is_teacher`)
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='用戶登入記錄表';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `user_login_logs`
--

LOCK TABLES `user_login_logs` WRITE;
/*!40000 ALTER TABLE `user_login_logs` DISABLE KEYS */;
INSERT INTO `user_login_logs` VALUES (1,'李老師','teacher001','test-classroom',1,'2025-06-10 12:44:59',NULL,NULL,0,NULL);
/*!40000 ALTER TABLE `user_login_logs` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `user_preferences`
--

DROP TABLE IF EXISTS `user_preferences`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `user_preferences` (
  `user_name` varchar(255) NOT NULL,
  `auto_save_enabled` tinyint(1) DEFAULT 1,
  `auto_save_interval` int(11) DEFAULT 30,
  `theme` varchar(50) DEFAULT 'light',
  `editor_font_size` int(11) DEFAULT 14,
  `editor_theme` varchar(50) DEFAULT 'default',
  `last_used_names` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`last_used_names`)),
  `favorite_slots` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`favorite_slots`)),
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`user_name`),
  KEY `idx_updated` (`updated_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `user_preferences`
--

LOCK TABLES `user_preferences` WRITE;
/*!40000 ALTER TABLE `user_preferences` DISABLE KEYS */;
/*!40000 ALTER TABLE `user_preferences` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `users`
--

DROP TABLE IF EXISTS `users`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `users` (
  `id` varchar(50) NOT NULL,
  `user_name` varchar(100) NOT NULL,
  `room_id` varchar(100) DEFAULT NULL,
  `personal_code` text DEFAULT NULL,
  `last_activity` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_room_id` (`room_id`),
  KEY `idx_last_activity` (`last_activity`),
  KEY `idx_user_name` (`user_name`),
  CONSTRAINT `users_ibfk_1` FOREIGN KEY (`room_id`) REFERENCES `rooms` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `users`
--

LOCK TABLES `users` WRITE;
/*!40000 ALTER TABLE `users` DISABLE KEYS */;
INSERT INTO `users` VALUES ('user_1','TestUser1','test-auto-1749631832246',NULL,'2025-06-11 08:50:42','2025-06-11 08:50:42'),('user_2','TestUser1','test-auto-1749631832246',NULL,'2025-06-11 08:50:42','2025-06-11 08:50:42'),('user_3','TestUser1','test-auto-1749631832246',NULL,'2025-06-11 08:50:42','2025-06-11 08:50:42'),('user_4','TestUser1','test-auto-1749631832246',NULL,'2025-06-11 08:50:42','2025-06-11 08:50:42'),('user_5','TestUser2','test-auto-1749631832246',NULL,'2025-06-11 08:50:42','2025-06-11 08:50:42'),('user_6','TestUser2','test-auto-1749631832246',NULL,'2025-06-11 08:50:42','2025-06-11 08:50:42');
/*!40000 ALTER TABLE `users` ENABLE KEYS */;
UNLOCK TABLES;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2025-06-12  2:30:40
