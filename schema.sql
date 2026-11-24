CREATE TABLE IF NOT EXISTS users (
  username VARCHAR(30) PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  role VARCHAR(20) NOT NULL,
  hash VARCHAR(255) NOT NULL,
  created_at BIGINT NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS applications (
  id VARCHAR(30) PRIMARY KEY,
  username VARCHAR(30) NOT NULL,
  name VARCHAR(100) NOT NULL,
  email VARCHAR(100) NOT NULL,
  phone VARCHAR(30) NOT NULL,
  school VARCHAR(150) NOT NULL,
  course VARCHAR(100) NOT NULL,
  year VARCHAR(20) NOT NULL,
  office VARCHAR(20) NOT NULL,
  office2 VARCHAR(20) DEFAULT '',
  hours INT NOT NULL,
  `start` VARCHAR(20) DEFAULT '',
  msg VARCHAR(1000) DEFAULT '',
  status VARCHAR(20) NOT NULL DEFAULT 'Pending',
  note VARCHAR(500) DEFAULT '',
  created_at BIGINT NOT NULL,
  INDEX idx_app_username (username),
  CONSTRAINT fk_application_user FOREIGN KEY (username) REFERENCES users(username) ON DELETE CASCADE
);
