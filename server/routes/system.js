const express = require('express');
const router = express.Router();
const { asyncHandler } = require('../middleware/error-handler');
const logger = require('../utils/logger');

// Get system status
router.get('/status', asyncHandler(async (req, res) => {
  const si = require('systeminformation');
  
  try {
    const [cpu, memory, disk, network, temperature] = await Promise.all([
      si.currentLoad(),
      si.mem(),
      si.fsSize(),
      si.networkStats(),
      getRaspberryPiTemperature()
    ]);
    
    // Helper function to get Raspberry Pi temperature
    async function getRaspberryPiTemperature() {
      try {
        // First try systeminformation
        const temp = await si.cpuTemperature();
        if (temp.main > 0) {
          return temp;
        }
        
        // Fallback to Raspberry Pi specific method
        const fs = require('fs').promises;
        const tempRaw = await fs.readFile('/sys/class/thermal/thermal_zone0/temp', 'utf8');
        const tempCelsius = parseInt(tempRaw.trim()) / 1000;
        
        return {
          main: tempCelsius,
          max: tempCelsius
        };
      } catch (error) {
        return { main: 0, max: 0 };
      }
    }
    
    res.json({
      success: true,
      system: {
        cpu: {
          usage: Math.round(cpu.currentLoad),
          cores: cpu.cpus?.length || 1,
          speed: cpu.avgLoad || 0
        },
        memory: {
          used: Math.round(memory.active / 1024 / 1024),
          total: Math.round(memory.total / 1024 / 1024),
          free: Math.round(memory.free / 1024 / 1024),
          usage: Math.round((memory.active / memory.total) * 100)
        },
        disk: disk.map(d => ({
          device: d.fs,
          used: Math.round(d.used / 1024 / 1024 / 1024),
          total: Math.round(d.size / 1024 / 1024 / 1024),
          usage: Math.round(d.use)
        })),
        network: network.slice(0, 3).map(n => ({
          interface: n.iface,
          rx: Math.round(n.rx_bytes / 1024 / 1024),
          tx: Math.round(n.tx_bytes / 1024 / 1024)
        })),
        temperature: {
          cpu: temperature.main || 0,
          max: temperature.max || 0
        }
      },
      process: {
        pid: process.pid,
        uptime: Math.floor(process.uptime()),
        memory: process.memoryUsage(),
        cpu: process.cpuUsage()
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error getting system status:', error);
    res.json({
      success: true,
      system: {
        cpu: { usage: 0, cores: 1, speed: 0 },
        memory: { used: 0, total: 0, free: 0, usage: 0 },
        disk: [],
        network: [],
        temperature: { cpu: 0, max: 0 }
      },
      process: {
        pid: process.pid,
        uptime: Math.floor(process.uptime()),
        memory: process.memoryUsage(),
        cpu: process.cpuUsage()
      },
      timestamp: new Date().toISOString(),
      note: 'Limited system information available'
    });
  }
}));

// Get application logs
router.get('/logs', asyncHandler(async (req, res) => {
  const { level, limit = 50, since } = req.query;
  
  // This is a simplified log endpoint
  // In production, you might want to use a proper log management system
  res.json({
    success: true,
    logs: [
      {
        timestamp: new Date().toISOString(),
        level: 'info',
        message: 'Log endpoint accessed',
        metadata: { 
          user: req.user?.username,
          ip: req.ip 
        }
      }
    ],
    total: 1,
    parameters: { level, limit, since },
    timestamp: new Date().toISOString()
  });
}));

// Restart application (requires special permissions)
router.post('/restart', asyncHandler(async (req, res) => {
  logger.warn('Application restart requested', {
    user: req.user?.username,
    ip: req.ip
  });
  
  res.json({
    success: true,
    message: 'Restart signal sent',
    timestamp: new Date().toISOString()
  });
  
  // Give time for response to be sent
  setTimeout(() => {
    process.exit(0);
  }, 1000);
}));

module.exports = router;