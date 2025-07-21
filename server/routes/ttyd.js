const express = require('express');
const config = require('config');
const fs = require('fs-extra');
const path = require('path');
const logger = require('../utils/logger');
const ttydService = require('../services/ttyd-service');

const router = express.Router();

/**
 * Get TTYd service status
 */
router.get('/status', async (req, res) => {
    try {
        const status = ttydService.getStatus();
        res.json({
            success: true,
            data: status
        });
    } catch (error) {
        logger.error('Failed to get TTYd status:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get TTYd status',
            details: error.message
        });
    }
});

/**
 * Update TTYd configuration
 */
router.post('/config', async (req, res) => {
    try {
        const { fontSize, port } = req.body;
        
        // Validate input
        if (fontSize !== undefined) {
            const fontSizeNum = parseInt(fontSize);
            if (isNaN(fontSizeNum) || fontSizeNum < 8 || fontSizeNum > 32) {
                return res.status(400).json({
                    success: false,
                    error: 'Font size must be a number between 8 and 32'
                });
            }
        }
        
        if (port !== undefined) {
            const portNum = parseInt(port);
            if (isNaN(portNum) || portNum < 1024 || portNum > 65535) {
                return res.status(400).json({
                    success: false,
                    error: 'Port must be a number between 1024 and 65535'
                });
            }
        }

        // Update TTYd service configuration (dynamic config only)
        const updateData = {};
        if (fontSize !== undefined) updateData.fontSize = parseInt(fontSize);
        if (port !== undefined) updateData.port = parseInt(port);
        
        await ttydService.updateConfig(updateData);
        
        // Get updated configuration from service
        const currentStatus = ttydService.getStatus();
        
        res.json({
            success: true,
            message: 'TTYd configuration updated and service restarted',
            data: {
                fontSize: currentStatus.fontSize,
                port: currentStatus.port
            }
        });
        
    } catch (error) {
        logger.error('Failed to update TTYd configuration:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to update TTYd configuration',
            details: error.message
        });
    }
});

/**
 * Restart TTYd service manually
 */
router.post('/restart', async (req, res) => {
    try {
        logger.info('Manual TTYd service restart requested');
        await ttydService.restart();
        
        res.json({
            success: true,
            message: 'TTYd service restarted successfully'
        });
        
    } catch (error) {
        logger.error('Failed to restart TTYd service:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to restart TTYd service',
            details: error.message
        });
    }
});

/**
 * Start TTYd service
 */
router.post('/start', async (req, res) => {
    try {
        const started = await ttydService.start();
        
        if (started) {
            res.json({
                success: true,
                message: 'TTYd service started successfully'
            });
        } else {
            res.status(400).json({
                success: false,
                error: 'TTYd service is already running'
            });
        }
        
    } catch (error) {
        logger.error('Failed to start TTYd service:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to start TTYd service',
            details: error.message
        });
    }
});

/**
 * Stop TTYd service
 */
router.post('/stop', async (req, res) => {
    try {
        const stopped = await ttydService.stop();
        
        res.json({
            success: true,
            message: stopped ? 'TTYd service stopped successfully' : 'TTYd service was not running'
        });
        
    } catch (error) {
        logger.error('Failed to stop TTYd service:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to stop TTYd service',
            details: error.message
        });
    }
});

/**
 * Get TTYd configuration
 */
router.get('/config', async (req, res) => {
    try {
        const status = ttydService.getStatus();
        const staticConfig = ttydService.getStaticConfig();
        
        res.json({
            success: true,
            data: {
                port: status.port,                    // Dynamic config
                fontSize: status.fontSize,            // Dynamic config
                executable: staticConfig.executable,  // Static config
                baseCommand: staticConfig.baseCommand, // Static config
                arguments: staticConfig.arguments      // Static config
            }
        });
        
    } catch (error) {
        logger.error('Failed to get TTYd configuration:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get TTYd configuration',
            details: error.message
        });
    }
});

module.exports = router;