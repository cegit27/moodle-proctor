'use strict';

require('dotenv').config();

const config = {
  MEDIASOUP_LISTEN_IP: process.env.MEDIASOUP_LISTEN_IP || '127.0.0.1',
  MEDIASOUP_ANNOUNCED_IP: process.env.MEDIASOUP_ANNOUNCED_IP || '',
  REDIS_URL: process.env.REDIS_URL || 'redis://localhost:6379',
  PORT: parseInt(process.env.PORT, 10) || 4000,
  NODE_ENV: process.env.NODE_ENV || 'development',
  RTC_MIN_PORT: parseInt(process.env.RTC_MIN_PORT, 10) || 40000,
  RTC_MAX_PORT: parseInt(process.env.RTC_MAX_PORT, 10) || 49999,
};

if (config.NODE_ENV === 'production' && !config.MEDIASOUP_ANNOUNCED_IP) {
  throw new Error(
    '[config] MEDIASOUP_ANNOUNCED_IP must be set in production. ' +
      'Set it to the public IP address of this server.'
  );
}

module.exports = config;
