'use strict';

require('dotenv').config();

module.exports = {
  PORT: process.env.PORT || 4001,
  NODE_ENV: process.env.NODE_ENV || 'development',
  REDIS_URL: process.env.REDIS_URL || 'redis://localhost:6379',
  MEDIASOUP_LISTEN_IP: process.env.MEDIASOUP_LISTEN_IP || '127.0.0.1',
  MEDIASOUP_ANNOUNCED_IP: process.env.MEDIASOUP_ANNOUNCED_IP || null,
  RTC_MIN_PORT: parseInt(process.env.RTC_MIN_PORT) || 40010,
  RTC_MAX_PORT: parseInt(process.env.RTC_MAX_PORT) || 49999,
};
