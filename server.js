const express = require('express');
const WebSocket = require('ws');
const http = require('http');
const path = require('path');
const fs = require('fs');
const mysql = require('mysql2');
const { spawn } = require('child_process');
const crypto = require('crypto');

// 配置服務器
const app = express();
let PORT = process.env.PORT || 3000;
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// ... existing code ...